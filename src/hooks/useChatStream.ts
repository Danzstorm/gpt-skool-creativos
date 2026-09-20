import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Message, UploadedFile } from "@/lib/types";
import { consumeSSE } from "@/lib/stream-client";
import {
  clientAttachmentLabel,
  friendlyStreamError,
  interpretChatStreamResponse,
} from "@/lib/stream-errors";
import type { Phase } from "@/lib/thinking-phrases";
import type { ComposerHandle } from "@/components/chat/Composer";

export type EnsureThread = (gptId: string) => Promise<string | null>;

export type UseChatStreamOptions = {
  activeGptId: string | null;
  activeThreadId: string | null;
  /** Solo si el hilo inicial existía en la lista (mismo criterio que UnifiedChat). */
  initialThreadId?: string | null;
  attachedFiles: UploadedFile[];
  pendingUploads: number;
  clearAttachments: () => void;
  restoreAttachments: (files: UploadedFile[] | undefined) => void;
  composerRef: RefObject<ComposerHandle | null>;
  ensureThread: EnsureThread;
  bumpThreadAfterSend: (threadId: string, messageLabel: string) => void;
  applyThreadTitle: (threadId: string, title: string) => void;
  onUserMessageAppended?: () => void;
  /** Espera a que Gemini llene la transcripción de los videos adjuntos. */
  waitForVideoAnalysis?: () => Promise<boolean>;
};

export function useChatStream({
  activeGptId,
  activeThreadId,
  initialThreadId,
  attachedFiles,
  pendingUploads,
  clearAttachments,
  restoreAttachments,
  composerRef,
  ensureThread,
  bumpThreadAfterSend,
  applyThreadTitle,
  onUserMessageAppended,
  waitForVideoAnalysis,
}: UseChatStreamOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("thinking");
  const [thinkingStartedAt, setThinkingStartedAt] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const waitingVideoRef = useRef(false);
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearMessages = useCallback(() => setMessages([]), []);
  const cancelEdit = useCallback(() => setIsEditing(false), []);
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const loadHistory = useCallback(async (threadId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/messages`);
      setMessages(res.ok ? await res.json() : []);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!initialThreadId) return;
    void loadHistory(initialThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consumeStream = useCallback(
    async (res: Response, threadId: string | null) => {
      const interpreted = await interpretChatStreamResponse(res);
      if (interpreted.kind === "revoked") {
        window.location.assign("/unauthorized?reason=revoked");
        return;
      }
      if (interpreted.kind === "error") {
        throw new Error(interpreted.message);
      }

      let streamUnlocked = false;
      await consumeSSE(
        res,
        (text) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: updated[updated.length - 1].content + text,
            };
            return updated;
          });
        },
        (next) => setPhase(next as Phase),
        {
          onDone: () => {
            if (streamUnlocked) return;
            streamUnlocked = true;
            abortRef.current = null;
            setIsLoading(false);
          },
          onThreadTitle: (title) => {
            if (!threadId) return;
            applyThreadTitle(threadId, title);
          },
        }
      );
      return streamUnlocked;
    },
    [applyThreadTitle]
  );

  const runAssistant = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setIsLoading(true);
      setPhase("thinking");
      setThinkingStartedAt(Date.now());
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const controller = new AbortController();
      abortRef.current = controller;
      const threadId =
        typeof body.threadId === "string" ? body.threadId : activeThreadId;
      let streamUnlocked = false;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(body),
        });
        streamUnlocked = (await consumeStream(res, threadId)) ?? false;
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = aborted
            ? { ...last, content: last.content || "_(respuesta detenida)_" }
            : { ...last, error: friendlyStreamError(err) };
          return updated;
        });
      } finally {
        if (!streamUnlocked) {
          abortRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [activeThreadId, consumeStream]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (
        (!text.trim() && attachedFiles.length === 0) ||
        isLoading ||
        pendingUploads > 0 ||
        waitingVideoRef.current ||
        !activeGptId
      )
        return;

      if (attachedFiles.some((file) => file.analyzing) && waitForVideoAnalysis) {
        waitingVideoRef.current = true;
        try {
          const ready = await waitForVideoAnalysis();
          if (!ready) {
            composerRef.current?.setText(text);
            return;
          }
        } finally {
          waitingVideoRef.current = false;
        }
      }

      const messageText = text.trim();
      const messageLabel =
        messageText || clientAttachmentLabel(attachedFiles);
      const replaceLast = isEditing;
      setIsEditing(false);
      setIsLoading(true);

      const userMessage: Message = {
        role: "user",
        content: messageText,
        files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
      };

      setMessages((prev) => [...prev, userMessage]);
      clearAttachments();
      onUserMessageAppended?.();

      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await ensureThread(activeGptId);
        if (!threadId) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "No se pudo iniciar la conversación." },
          ]);
          setIsLoading(false);
          return;
        }
      }

      bumpThreadAfterSend(threadId, messageLabel);

      await runAssistant("/api/chat", {
        gptId: activeGptId,
        threadId,
        message: messageText,
        files:
          userMessage.files?.map((f) => ({
            openai_file_id: f.openai_file_id,
            type: f.type,
          })) ?? [],
        replaceLast,
      });
    },
    [
      activeGptId,
      activeThreadId,
      attachedFiles,
      bumpThreadAfterSend,
      clearAttachments,
      ensureThread,
      isEditing,
      isLoading,
      onUserMessageAppended,
      pendingUploads,
      runAssistant,
      waitForVideoAnalysis,
      composerRef,
    ]
  );

  const regenerate = useCallback(async () => {
    if (isLoading || !activeGptId || !activeThreadId) return;
    setMessages((prev) =>
      prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev
    );
    await runAssistant("/api/chat/regenerate", {
      gptId: activeGptId,
      threadId: activeThreadId,
    });
  }, [isLoading, activeGptId, activeThreadId, runAssistant]);

  const startEdit = useCallback(
    (index: number) => {
      const m = messagesRef.current[index];
      if (!m || m.role !== "user") return;
      composerRef.current?.setText(m.content);
      restoreAttachments(m.files);
      setMessages((prev) => prev.slice(0, index));
      setIsEditing(true);
    },
    [composerRef, restoreAttachments]
  );

  return {
    messages,
    isLoadingHistory,
    isLoading,
    phase,
    thinkingStartedAt,
    isEditing,
    loadHistory,
    clearMessages,
    sendMessage,
    regenerate,
    startEdit,
    cancelEdit,
    stopStreaming,
  };
}
