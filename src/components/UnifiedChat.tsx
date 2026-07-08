"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Gpt, Message, UploadedFile, ThreadSummary } from "@/lib/types";
import { Menu, ArrowDown, ChevronDown, PanelLeftOpen, SquarePen } from "lucide-react";
import Sparkle from "./Sparkle";
import GptGlyph from "./chat/GptGlyph";
import ChatSidebar from "./chat/ChatSidebar";
import MessageBubble from "./chat/MessageBubble";
import Composer, { type ComposerHandle } from "./chat/Composer";
import GptChatsModal from "./chat/GptChatsModal";
import { consumeSSE } from "@/lib/stream-client";

const SIDEBAR_COLLAPSED_KEY = "chat_sidebar_collapsed";

interface Props {
  gpts: Gpt[];
  threads: ThreadSummary[];
  initialThreadId?: string | null;
  initialGptId?: string | null;
  profile: { fullName: string | null; email: string | null; isAdmin: boolean };
}

export default function UnifiedChat({ gpts, threads, initialThreadId, initialGptId, profile }: Props) {
  const [threadList, setThreadList] = useState<ThreadSummary[]>(threads);
  const initialThread = initialThreadId ? threads.find((t) => t.id === initialThreadId) : null;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThread?.id ?? null);
  const [activeGptId, setActiveGptId] = useState<string | null>(
    initialThread?.gpt_id ?? initialGptId ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [gptChatsModalId, setGptChatsModalId] = useState<string | null>(null);

  // Aplicado post-montaje (no en el estado inicial) para que el SSR/primer
  // render coincida siempre con "expandido" y no genere hydration mismatch;
  // leer localStorage en el lazy initializer de useState rompería esa paridad.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setSidebarCollapsed(true);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const activeGpt = useMemo(() => gpts.find((g) => g.id === activeGptId), [gpts, activeGptId]);

  useEffect(() => {
    if (!showScrollBtn) bottomRef.current?.scrollIntoView({ behavior: isLoading ? "auto" : "smooth" });
  }, [messages, isLoading, showScrollBtn]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollBtn(!nearBottom);
  }

  function scrollToBottom() {
    setShowScrollBtn(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Carga inicial del historial si arrancamos sobre una conversación existente
  useEffect(() => {
    if (!initialThread) return;
    loadHistory(initialThread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushUrl(params: string) {
    window.history.replaceState(null, "", `/chat${params}`);
  }

  async function loadHistory(threadId: string) {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/messages`);
      setMessages(res.ok ? await res.json() : []);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  const selectGpt = useCallback((gptId: string) => {
    setSidebarOpen(false);
    setActiveGptId(gptId);
    setActiveThreadId(null);
    setMessages([]);
    pushUrl(`?gpt=${gptId}`);
  }, []);

  const selectThread = useCallback(
    (t: ThreadSummary) => {
      if (t.id === activeThreadId || isLoadingHistory) return;
      setSidebarOpen(false);
      setActiveThreadId(t.id);
      setActiveGptId(t.gpt_id);
      pushUrl(`?c=${t.id}`);
      loadHistory(t.id);
    },
    [activeThreadId, isLoadingHistory]
  );

  const newChat = useCallback(() => {
    setSidebarOpen(false);
    setActiveThreadId(null);
    setActiveGptId(null);
    setMessages([]);
    pushUrl("");
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const startRename = useCallback((t: ThreadSummary) => {
    setRenamingId(t.id);
    setRenameValue(t.title);
  }, []);
  const cancelRename = useCallback(() => setRenamingId(null), []);

  const renameThread = useCallback(
    async (id: string) => {
      // Se limpia renamingId ANTES del await: el input se desmonta de inmediato,
      // así un segundo evento (blur tras Enter, doble click) no puede reenviar
      // el mismo rename mientras el primero sigue en vuelo.
      if (renamingId !== id) return;
      const title = renameValue.trim();
      setRenamingId(null);
      if (!title) return;

      const res = await fetch(`/api/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const updated = await res.json();
        setThreadList((prev) => prev.map((t) => (t.id === id ? { ...t, title: updated.title } : t)));
      }
    },
    [renameValue, renamingId]
  );

  const deleteThread = useCallback(
    async (id: string) => {
      if (!confirm("¿Borrar esta conversación? Esta acción no se puede deshacer.")) return;
      await fetch(`/api/threads/${id}`, { method: "DELETE" });
      setThreadList((prev) => prev.filter((t) => t.id !== id));
      if (id === activeThreadId) newChat();
    },
    [activeThreadId, newChat]
  );

  const openGptChats = useCallback((gptId: string) => setGptChatsModalId(gptId), []);
  const closeGptChats = useCallback(() => setGptChatsModalId(null), []);

  const uploadFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) continue;
      const data = await res.json();
      setAttachedFiles((prev) => [
        ...prev,
        {
          name: file.name,
          openai_file_id: data.file_id,
          type: isImage ? "image" : "document",
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        },
      ]);
    }
  }, []);

  const removeAttached = useCallback((index: number) => {
    setAttachedFiles((prev) => {
      const f = prev[index];
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((_, idx) => idx !== index);
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  }

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Consume el SSE y va agregando texto al último mensaje (asistente) del estado
  async function consumeStream(res: Response) {
    if (res.status === 429) {
      throw new Error("Demasiados mensajes seguidos. Espera unos segundos e intenta de nuevo.");
    }
    if (res.status === 409) {
      throw new Error("Ya hay una respuesta en curso para esta conversación. Espera a que termine.");
    }
    if (res.status === 403) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Alcanzaste tu límite de mensajes de este mes.");
    }
    if (!res.ok) throw new Error("Error al enviar mensaje");

    await consumeSSE(res, (text) => {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: updated[updated.length - 1].content + text,
        };
        return updated;
      });
    });
  }

  // Agrega un placeholder de asistente y streamea la respuesta desde `url`
  async function runAssistant(url: string, body: object) {
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      await consumeStream(res);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const errMsg = err instanceof Error ? err.message : "Error al obtener respuesta. Intenta de nuevo.";
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = aborted
          ? { ...last, content: last.content || "_(respuesta detenida)_" }
          : { ...last, content: errMsg };
        return updated;
      });
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if ((!text.trim() && attachedFiles.length === 0) || isLoading || !activeGptId) return;

      const messageText = text.trim();
      const replaceLast = isEditing;
      setIsEditing(false);
      setIsLoading(true); // cerrar carrera de doble-envío antes de cualquier await

      const userMessage: Message = {
        role: "user",
        content: messageText,
        files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
      };

      setMessages((prev) => [...prev, userMessage]);
      setAttachedFiles([]);
      setShowScrollBtn(false);

      // Creación diferida: si no hay conversación aún, crearla al primer mensaje
      let threadId = activeThreadId;
      if (!threadId) {
        const res = await fetch("/api/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gptId: activeGptId }),
        });
        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "No se pudo iniciar la conversación." },
          ]);
          setIsLoading(false);
          return;
        }
        const created: ThreadSummary & { title: string } = await res.json();
        const newThread: ThreadSummary = {
          id: created.id,
          title: created.title,
          gpt_id: activeGptId,
          created_at: created.created_at,
          updated_at: created.updated_at,
        };
        threadId = newThread.id;
        setActiveThreadId(newThread.id);
        setThreadList((prev) => [newThread, ...prev]);
        pushUrl(`?c=${newThread.id}`);
      }

      // Título optimista + preview + mover al tope
      setThreadList((prev) => {
        const updated = prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                title: t.title === "Nueva conversación" ? messageText.slice(0, 40) || t.title : t.title,
                last_message_preview: messageText.slice(0, 80),
                updated_at: new Date().toISOString(),
              }
            : t
        );
        const active = updated.find((t) => t.id === threadId);
        return active ? [active, ...updated.filter((t) => t.id !== threadId)] : updated;
      });

      await runAssistant("/api/chat", {
        gptId: activeGptId,
        threadId,
        message: messageText,
        files: userMessage.files?.map((f) => ({ openai_file_id: f.openai_file_id, type: f.type })) ?? [],
        replaceLast,
      });
    },
    // runAssistant es estable en comportamiento (solo cierra sobre setState/refs); omitirla
    // evita que sendMessage cambie de referencia en cada token streameado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGptId, activeThreadId, attachedFiles, isEditing, isLoading]
  );

  const regenerate = useCallback(async () => {
    if (isLoading || !activeGptId || !activeThreadId) return;
    setMessages((prev) => (prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev));
    await runAssistant("/api/chat/regenerate", { gptId: activeGptId, threadId: activeThreadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, activeGptId, activeThreadId]);

  // Lee el contenido a editar desde messagesRef (no `messages`) para que esta
  // función no cambie de referencia en cada token streameado — así memo() en
  // MessageBubble sigue evitando re-renders de los mensajes no afectados.
  const startEdit = useCallback((index: number) => {
    const m = messagesRef.current[index];
    if (!m || m.role !== "user") return;
    composerRef.current?.setText(m.content);
    setAttachedFiles([]);
    setMessages((prev) => prev.slice(0, index));
    setIsEditing(true);
  }, []);

  const cancelEdit = useCallback(() => setIsEditing(false), []);

  const copyMessage = useCallback((index: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
  }, []);

  // índice del último mensaje de usuario (para ofrecer "editar")
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  const showComposer = !!activeGpt;

  const gptChatsModalGpt = gptChatsModalId ? gpts.find((g) => g.id === gptChatsModalId) : null;
  const gptChatsModalThreads = useMemo(
    () => (gptChatsModalId ? threadList.filter((t) => t.gpt_id === gptChatsModalId) : []),
    [threadList, gptChatsModalId]
  );

  return (
    <div className="flex h-dvh relative">
      <ChatSidebar
        gpts={gpts}
        threadList={threadList}
        activeGptId={activeGptId}
        activeThreadId={activeThreadId}
        sidebarOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        profile={profile}
        chatSearch={chatSearch}
        onSearchChange={setChatSearch}
        onSelectGpt={selectGpt}
        onSelectThread={selectThread}
        onNewChat={newChat}
        onCloseSidebar={closeSidebar}
        onOpenGptChats={openGptChats}
        renamingId={renamingId}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onStartRename={startRename}
        onSubmitRename={renameThread}
        onCancelRename={cancelRename}
        onDeleteThread={deleteThread}
      />

      {/* Área principal */}
      <div
        className="flex flex-col flex-1 min-w-0 relative"
        onDragOver={(e) => {
          // preventDefault siempre: si no, sin GPT activo el navegador abre el
          // archivo soltado en vez de ignorarlo.
          e.preventDefault();
          if (showComposer) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (showComposer) handleDrop(e);
        }}
      >
        {isDragging && showComposer && (
          <div className="absolute inset-0 z-10 bg-zinc-800/40 border-2 border-dashed border-zinc-600 rounded-2xl m-2 flex items-center justify-center pointer-events-none">
            <p className="text-zinc-200 text-sm font-medium">Suelta imágenes o archivos aquí</p>
          </div>
        )}
        {/* Header */}
        <div className="border-b border-zinc-800/80 px-4 py-3 bg-zinc-950/80 backdrop-blur-xl flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-zinc-400 hover:text-white transition md:hidden"
            aria-label="Abrir panel"
          >
            <Menu size={20} />
          </button>
          {sidebarCollapsed && (
            <div className="hidden md:flex items-center gap-1 -ml-1">
              <button
                onClick={toggleSidebarCollapsed}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition"
                title="Expandir panel"
                aria-label="Expandir panel"
              >
                <PanelLeftOpen size={18} />
              </button>
              <button
                onClick={newChat}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition"
                title="Nuevo chat"
                aria-label="Nuevo chat"
              >
                <SquarePen size={18} />
              </button>
            </div>
          )}
          {activeGpt ? (
            <button
              onClick={() => openGptChats(activeGpt.id)}
              className="flex items-center gap-2 min-w-0 rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-zinc-800/60 transition"
              title="Ver conversaciones de este GPT"
            >
              <GptGlyph gpt={activeGpt} size="sm" />
              <h2 className="text-zinc-100 font-medium text-[13px] truncate">{activeGpt.name}</h2>
              <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
            </button>
          ) : (
            <h2 className="text-zinc-400 font-medium text-sm">Elige un GPT para empezar</h2>
          )}
        </div>

        {/* Mensajes / estados */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-6"
        >
          {isLoadingHistory && (
            <div className="space-y-4 animate-pulse max-w-2xl mx-auto w-full">
              <div className="flex justify-end">
                <div className="h-10 w-2/5 bg-zinc-800 rounded-2xl rounded-br-sm" />
              </div>
              <div className="flex justify-start gap-2">
                <div className="w-7 h-7 bg-zinc-800 rounded-lg flex-shrink-0" />
                <div className="h-20 w-3/5 bg-zinc-800 rounded-2xl rounded-bl-sm" />
              </div>
            </div>
          )}

          {!activeGpt && !isLoadingHistory && (
            <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
              <div className="w-14 h-14 rounded-2xl border border-zinc-800 flex items-center justify-center mb-4">
                <Sparkle className="w-6 h-6 text-zinc-600" />
              </div>
              <p className="text-sm">Elige un GPT en el panel para comenzar una conversación.</p>
            </div>
          )}

          {activeGpt && messages.length === 0 && !isLoadingHistory && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 max-w-2xl mx-auto">
              <div className="mb-5">
                <GptGlyph gpt={activeGpt} size="xl" />
              </div>
              <h3 className="font-display text-2xl font-medium tracking-tight text-stone-50 mb-2">{activeGpt.name}</h3>
              {activeGpt.description && (
                <p className="text-zinc-400 text-sm max-w-md">{activeGpt.description}</p>
              )}
              {activeGpt.author && (
                <p className="text-zinc-600 text-xs mt-1.5">By {activeGpt.author}</p>
              )}
              {activeGpt.conversation_starters && activeGpt.conversation_starters.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full">
                  {activeGpt.conversation_starters.slice(0, 4).map((starter, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(starter)}
                      className="text-left border border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-900 rounded-2xl px-4 py-3 text-sm text-zinc-300 hover:text-zinc-100 transition-all hover:-translate-y-0.5"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.length > 0 && (
            <div className="max-w-3xl mx-auto w-full space-y-6">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const streaming = isLoading && isLast && msg.role === "assistant";
                return (
                  <MessageBubble
                    key={i}
                    index={i}
                    message={msg}
                    activeGpt={activeGpt}
                    isLast={isLast}
                    streaming={streaming}
                    canRegenerate={isLast && !isLoading}
                    canEdit={i === lastUserIndex && !isLoading}
                    isCopied={copiedIndex === i}
                    onCopy={copyMessage}
                    onRegenerate={regenerate}
                    onEdit={startEdit}
                  />
                );
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-full p-2 shadow-lg hover:bg-zinc-700 transition"
            aria-label="Bajar al final"
          >
            <ArrowDown size={16} />
          </button>
        )}

        {showComposer && (
          <Composer
            ref={composerRef}
            isLoading={isLoading}
            isEditing={isEditing}
            onCancelEdit={cancelEdit}
            attachedFiles={attachedFiles}
            onFilesSelected={uploadFiles}
            onRemoveFile={removeAttached}
            onSend={sendMessage}
            onStop={stopStreaming}
          />
        )}
      </div>

      {gptChatsModalGpt && (
        <GptChatsModal
          gpt={gptChatsModalGpt}
          threads={gptChatsModalThreads}
          activeThreadId={activeThreadId}
          onClose={closeGptChats}
          onSelectThread={selectThread}
          onNewChat={() => selectGpt(gptChatsModalGpt.id)}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValueChange={setRenameValue}
          onStartRename={startRename}
          onSubmitRename={renameThread}
          onCancelRename={cancelRename}
          onDeleteThread={deleteThread}
        />
      )}
    </div>
  );
}
