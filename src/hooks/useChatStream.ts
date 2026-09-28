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
import { toChatRequestFile } from "@/lib/chat-uploads";

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
  const [switchingVersion, setSwitchingVersion] = useState(false);

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
            const last = updated[updated.length - 1];
            const content = last.content + text;
            updated[updated.length - 1] = {
              ...last,
              content,
              ...(last.versions && last.versionIndex !== undefined
                ? { versions: last.versions.map((v, i) => (i === last.versionIndex ? content : v)) }
                : {}),
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
          // El servidor detectó salida degenerada y va a reintentar: lo que
          // ya se mostró de la primera pasada se descarta antes de que
          // lleguen los deltas nuevos, para no dejar restos mezclados.
          onReset: () => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: "",
                ...(last.versions && last.versionIndex !== undefined
                  ? { versions: last.versions.map((v, i) => (i === last.versionIndex ? "" : v)) }
                  : {}),
              };
              return updated;
            });
          },
        }
      );
      return streamUnlocked;
    },
    [applyThreadTitle]
  );

  const runAssistant = useCallback(
    async (url: string, body: Record<string, unknown>, seed?: Partial<Message>) => {
      setIsLoading(true);
      setPhase("thinking");
      setThinkingStartedAt(Date.now());
      setMessages((prev) => [...prev, { ...seed, role: "assistant", content: "" }]);
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
        switchingVersion ||
        pendingUploads > 0 ||
        attachedFiles.some((file) => file.pending) ||
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
        files: userMessage.files?.flatMap((f) => {
          const mapped = toChatRequestFile(f);
          return mapped ? [mapped] : [];
        }) ?? [],
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
      switchingVersion,
      onUserMessageAppended,
      pendingUploads,
      runAssistant,
      waitForVideoAnalysis,
      composerRef,
    ]
  );

  // Trae del servidor las versiones reales de la última respuesta. El servidor
  // manda (p.ej. un aviso ⚠️ guardado que el cliente no vio); `expectedLength`
  // evita pisar un mensaje nuevo si el usuario ya siguió escribiendo.
  const syncLastVersions = useCallback(async (threadId: string, expectedLength: number) => {
    try {
      const res = await fetch(`/api/threads/${threadId}/messages`);
      if (!res.ok) return;
      const server = ((await res.json()) as Message[]).at(-1);
      if (server?.role !== "assistant") return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (prev.length !== expectedLength || last?.role !== "assistant") return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, versions: server.versions, versionIndex: server.versionIndex },
        ];
      });
    } catch {
      // Sin sincronizar, las flechas usan lo que ya hay en pantalla.
    }
  }, []);

  const regenerate = useCallback(async () => {
    if (isLoading || switchingVersion || !activeGptId || !activeThreadId) return;
    const current = messagesRef.current;
    const last = current[current.length - 1];
    const previous = last?.role === "assistant" ? (last.versions ?? [last.content]) : [];
    setMessages((prev) =>
      prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev
    );
    const threadId = activeThreadId;
    const expectedLength = current.length - (last?.role === "assistant" ? 1 : 0) + 1;
    await runAssistant(
      "/api/chat/regenerate",
      { gptId: activeGptId, threadId },
      previous.length > 0
        ? { versions: [...previous, ""], versionIndex: previous.length }
        : undefined
    );
    await syncLastVersions(threadId, expectedLength);
  }, [isLoading, switchingVersion, activeGptId, activeThreadId, runAssistant, syncLastVersions]);

  const selectVersion = useCallback(
    async (index: number) => {
      const current = messagesRef.current;
      const last = current[current.length - 1];
      if (
        isLoading ||
        switchingVersion ||
        !activeThreadId ||
        last?.role !== "assistant" ||
        !last.versions ||
        index < 0 ||
        index >= last.versions.length ||
        index === last.versionIndex
      )
        return;

      const replaceLast = (message: Message) =>
        setMessages((prev) =>
          prev[prev.length - 1]?.role === "assistant" ? [...prev.slice(0, -1), message] : prev
        );
      replaceLast({ ...last, content: last.versions[index], versionIndex: index, error: undefined });
      setSwitchingVersion(true);
      try {
        const res = await fetch(`/api/threads/${activeThreadId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          replaceLast({ ...last, error: body?.error ?? "No se pudo cambiar de versión." });
        }
      } catch (err) {
        replaceLast({ ...last, error: friendlyStreamError(err) });
      } finally {
        setSwitchingVersion(false);
      }
    },
    [isLoading, switchingVersion, activeThreadId]
  );

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
    selectVersion,
    switchingVersion,
    startEdit,
    cancelEdit,
    stopStreaming,
  };
}
