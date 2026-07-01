"use client";

import { useState, useRef, useEffect } from "react";
import type { Gpt, Message, UploadedFile, ThreadSummary } from "@/lib/types";
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  X,
  Pencil,
  Trash2,
  Menu,
  Square,
  MessageSquarePlus,
  Copy,
  Check,
  RotateCcw,
  ArrowDown,
} from "lucide-react";
import MessageContent from "./MessageContent";
import { cn } from "@/lib/utils";

interface Props {
  gpts: Gpt[];
  threads: ThreadSummary[];
  initialThreadId?: string | null;
  initialGptId?: string | null;
}

function GptGlyph({ gpt, size = "sm" }: { gpt?: Gpt; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "w-8 h-8 text-base rounded-lg" : "w-6 h-6 text-xs rounded-md";
  return (
    <span
      className={cn(
        "flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/20",
        box
      )}
    >
      {gpt?.icon_url ? (
        <img src={gpt.icon_url} alt="" className="w-full h-full object-cover rounded-[inherit]" />
      ) : (
        "✦"
      )}
    </span>
  );
}

export default function UnifiedChat({ gpts, threads, initialThreadId, initialGptId }: Props) {
  const [threadList, setThreadList] = useState<ThreadSummary[]>(threads);
  const initialThread = initialThreadId ? threads.find((t) => t.id === initialThreadId) : null;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThread?.id ?? null);
  const [activeGptId, setActiveGptId] = useState<string | null>(
    initialThread?.gpt_id ?? initialGptId ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeGpt = gpts.find((g) => g.id === activeGptId);
  const gptById = (id: string) => gpts.find((g) => g.id === id);

  useEffect(() => {
    if (!showScrollBtn) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

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

  function selectGpt(gptId: string) {
    setSidebarOpen(false);
    setActiveGptId(gptId);
    setActiveThreadId(null);
    setMessages([]);
    pushUrl(`?gpt=${gptId}`);
  }

  async function selectThread(t: ThreadSummary) {
    if (t.id === activeThreadId || isLoadingHistory) return;
    setSidebarOpen(false);
    setActiveThreadId(t.id);
    setActiveGptId(t.gpt_id);
    pushUrl(`?c=${t.id}`);
    loadHistory(t.id);
  }

  function newChat() {
    setSidebarOpen(false);
    setActiveThreadId(null);
    setActiveGptId(null);
    setMessages([]);
    pushUrl("");
  }

  async function renameThread(id: string) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const res = await fetch(`/api/threads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameValue.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setThreadList((prev) => prev.map((t) => (t.id === id ? { ...t, title: updated.title } : t)));
    }
    setRenamingId(null);
  }

  async function deleteThread(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    const remaining = threadList.filter((t) => t.id !== id);
    setThreadList(remaining);
    if (id === activeThreadId) newChat();
  }

  async function uploadFiles(files: File[]) {
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
  }

  function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploadFiles(Array.from(files));
  }

  function removeAttached(index: number) {
    setAttachedFiles((prev) => {
      const f = prev[index];
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((_, idx) => idx !== index);
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length > 0) {
      e.preventDefault();
      uploadFiles(imgs);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      setIsTranscribing(false);
      if (res.ok) {
        const { text } = await res.json();
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        setTimeout(autoResize, 0);
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  // Consume el SSE y va agregando texto al último mensaje (asistente) del estado
  async function consumeStream(res: Response) {
    if (res.status === 429) {
      throw new Error("Demasiados mensajes seguidos. Espera unos segundos e intenta de nuevo.");
    }
    if (!res.ok) throw new Error("Error al enviar mensaje");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.replace("data: ", "");
        if (data === "[DONE]") continue;
        const parsed = JSON.parse(data);
        if (parsed.text) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: updated[updated.length - 1].content + parsed.text,
            };
            return updated;
          });
        }
      }
    }
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
      const errMsg =
        err instanceof Error && err.message.includes("Demasiados")
          ? err.message
          : "Error al obtener respuesta. Intenta de nuevo.";
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

  async function sendMessage(overrideText?: string) {
    const baseText = overrideText ?? input;
    if ((!baseText.trim() && attachedFiles.length === 0) || isLoading || !activeGptId) return;

    const messageText = baseText.trim();
    const replaceLast = isEditing;
    setIsEditing(false);

    const userMessage: Message = {
      role: "user",
      content: messageText,
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachedFiles([]);
    setShowScrollBtn(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Creación diferida: si no hay conversación aún, crearla al primer mensaje
    let threadId = activeThreadId;
    if (!threadId) {
      setIsLoading(true);
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

    // Título optimista + mover al tope
    setThreadList((prev) => {
      const updated = prev.map((t) =>
        t.id === threadId && t.title === "Nueva conversación"
          ? { ...t, title: messageText.slice(0, 40) || t.title }
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
  }

  async function regenerate() {
    if (isLoading || !activeGptId || !activeThreadId) return;
    setMessages((prev) => (prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev));
    await runAssistant("/api/chat/regenerate", { gptId: activeGptId, threadId: activeThreadId });
  }

  function startEdit(index: number) {
    const m = messages[index];
    if (!m || m.role !== "user" || isLoading) return;
    setInput(m.content);
    setAttachedFiles([]);
    setMessages((prev) => prev.slice(0, index));
    setIsEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
      autoResize();
    }, 0);
  }

  function copyMessage(content: string, index: number) {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
  }

  // índice del último mensaje de usuario (para ofrecer "editar")
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const showComposer = !!activeGpt;

  return (
    <div className="flex h-[calc(100vh-57px)] relative">
      {sidebarOpen && (
        <div
          className="fixed inset-0 top-[57px] bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: GPTs + Conversaciones */}
      <aside
        className={cn(
          "w-64 flex-col border-r border-zinc-800/80 bg-zinc-950 z-30",
          "md:flex md:relative md:translate-x-0",
          "fixed top-[57px] bottom-0 left-0 flex transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/70 hover:border-zinc-600 text-zinc-100 text-sm font-medium rounded-xl px-3 py-2.5 transition"
          >
            <MessageSquarePlus size={16} />
            Nuevo chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {/* Sección GPTs */}
          <p className="text-[11px] uppercase tracking-wider text-zinc-600 font-medium px-3 pt-2 pb-1.5">
            GPTs
          </p>
          <div className="space-y-0.5 mb-3">
            {gpts.map((g) => (
              <button
                key={g.id}
                onClick={() => selectGpt(g.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition text-left",
                  activeGptId === g.id && !activeThreadId
                    ? "bg-violet-600/15 text-white border border-violet-500/20"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent"
                )}
              >
                <GptGlyph gpt={g} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
          </div>

          {/* Sección Conversaciones */}
          {threadList.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wider text-zinc-600 font-medium px-3 pt-2 pb-1.5">
                Chats
              </p>
              <div className="space-y-0.5">
                {threadList.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer text-sm transition",
                      t.id === activeThreadId
                        ? "bg-violet-600/15 text-white border border-violet-500/20"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent"
                    )}
                    onClick={() => selectThread(t)}
                  >
                    <GptGlyph gpt={gptById(t.gpt_id)} />
                    {renamingId === t.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameThread(t.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => renameThread(t.id)}
                        className="flex-1 bg-zinc-800 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
                      />
                    ) : (
                      <span className="flex-1 truncate">{t.title}</span>
                    )}

                    {renamingId !== t.id && (
                      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(t.id);
                            setRenameValue(t.title);
                          }}
                          className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteThread(t.id);
                          }}
                          className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Área principal */}
      <div
        className="flex flex-col flex-1 min-w-0 relative"
        onDragOver={(e) => {
          if (!showComposer) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        {isDragging && showComposer && (
          <div className="absolute inset-0 z-10 bg-violet-600/10 border-2 border-dashed border-violet-500/50 rounded-2xl m-2 flex items-center justify-center pointer-events-none">
            <p className="text-violet-200 text-sm font-medium">Suelta imágenes o archivos aquí</p>
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
          {activeGpt ? (
            <>
              <GptGlyph gpt={activeGpt} size="lg" />
              <h2 className="text-zinc-100 font-semibold text-sm truncate">{activeGpt.name}</h2>
            </>
          ) : (
            <h2 className="text-zinc-400 font-medium text-sm">Elige un GPT para empezar</h2>
          )}
        </div>

        {/* Mensajes / estados */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
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

          {/* Sin GPT elegido */}
          {!activeGpt && !isLoadingHistory && (
            <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
              <div className="w-14 h-14 rounded-2xl border border-zinc-800 flex items-center justify-center text-2xl mb-4">
                ✦
              </div>
              <p className="text-sm">Elige un GPT en el panel para comenzar una conversación.</p>
            </div>
          )}

          {/* GPT elegido, sin mensajes: pantalla de intro del GPT */}
          {activeGpt && messages.length === 0 && !isLoadingHistory && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 max-w-2xl mx-auto">
              <div className="mb-5">
                <GptGlyph gpt={activeGpt} size="lg" />
              </div>
              <h3 className="text-zinc-100 font-semibold text-xl mb-2">{activeGpt.name}</h3>
              {activeGpt.description && (
                <p className="text-zinc-400 text-sm max-w-md">{activeGpt.description}</p>
              )}
              {activeGpt.conversation_starters && activeGpt.conversation_starters.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full">
                  {activeGpt.conversation_starters.slice(0, 4).map((starter, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(starter)}
                      className="text-left border border-zinc-800 hover:border-violet-500/40 bg-zinc-900/50 hover:bg-zinc-900 rounded-2xl px-4 py-3 text-sm text-zinc-300 hover:text-zinc-100 transition-all hover:-translate-y-0.5"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const streaming = isLoading && isLast && msg.role === "assistant";
            return (
              <div
                key={i}
                className={cn("group flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className="mr-2 mt-0.5">
                    <GptGlyph gpt={activeGpt} />
                  </div>
                )}
                <div className="flex flex-col gap-1 max-w-[80%]">
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-br-sm shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]"
                        : "bg-zinc-800/80 text-zinc-100 rounded-bl-sm border border-zinc-700/50"
                    )}
                  >
                    {msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.files.map((f, fi) =>
                          f.type === "image" && f.previewUrl ? (
                            <img
                              key={fi}
                              src={f.previewUrl}
                              alt={f.name}
                              className="w-24 h-24 object-cover rounded-lg border border-white/20"
                            />
                          ) : (
                            <span key={fi} className="text-xs bg-white/10 rounded-lg px-2 py-1">
                              📎 {f.name}
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {msg.content ? (
                      msg.role === "assistant" ? (
                        <div className="flex items-end">
                          <MessageContent content={msg.content} />
                          {streaming && (
                            <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 mb-1 rounded-sm animate-pulse" />
                          )}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      )
                    ) : (
                      msg.role === "assistant" && (
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce delay-0">·</span>
                          <span className="animate-bounce delay-100">·</span>
                          <span className="animate-bounce delay-200">·</span>
                        </span>
                      )
                    )}
                  </div>

                  {/* Acciones al pasar el mouse */}
                  {msg.content && !streaming && (
                    <div
                      className={cn(
                        "flex gap-0.5 opacity-0 group-hover:opacity-100 transition",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <button
                        onClick={() => copyMessage(msg.content, i)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                        title="Copiar"
                      >
                        {copiedIndex === i ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      {msg.role === "assistant" && isLast && !isLoading && (
                        <button
                          onClick={regenerate}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                          title="Regenerar"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      {msg.role === "user" && i === lastUserIndex && !isLoading && (
                        <button
                          onClick={() => startEdit(i)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Botón bajar al final */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-full p-2 shadow-lg hover:bg-zinc-700 transition"
            aria-label="Bajar al final"
          >
            <ArrowDown size={16} />
          </button>
        )}

        {/* Composer */}
        {showComposer && (
          <div className="border-t border-zinc-800/80 bg-zinc-950 px-4 py-4">
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 max-w-3xl mx-auto">
                {attachedFiles.map((f, i) => {
                  const imageIndex = attachedFiles.filter((x, xi) => x.type === "image" && xi <= i).length;
                  return f.type === "image" ? (
                    <div key={i} className="relative group/thumb">
                      <img
                        src={f.previewUrl}
                        alt={f.name}
                        className="w-16 h-16 object-cover rounded-xl border border-zinc-700"
                      />
                      <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/70 text-white rounded px-1">
                        img {imageIndex}
                      </span>
                      <button
                        onClick={() => removeAttached(i)}
                        className="absolute -top-1.5 -right-1.5 bg-zinc-800 border border-zinc-600 rounded-full p-0.5 text-zinc-300 hover:text-white opacity-0 group-hover/thumb:opacity-100 transition"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 bg-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 h-16"
                    >
                      <span>📎</span>
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button
                        onClick={() => removeAttached(i)}
                        className="text-zinc-500 hover:text-white ml-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {isEditing && (
              <div className="flex items-center justify-between max-w-3xl mx-auto mb-2 text-xs text-violet-300 bg-violet-600/10 border border-violet-500/20 rounded-lg px-3 py-1.5">
                <span>Editando mensaje — al enviar se reemplaza la respuesta anterior.</span>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setInput("");
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 bg-zinc-900/80 border border-zinc-700/70 focus-within:border-violet-500/50 rounded-2xl px-3 py-2 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] max-w-3xl mx-auto">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.txt,.md,.py,.js,.ts,.csv,.xlsx,.docx"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-zinc-500 hover:text-zinc-300 transition flex-shrink-0 mb-0.5"
              >
                <Paperclip size={18} />
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  isTranscribing ? "Transcribiendo audio..." : "Escribe un mensaje... (Enter para enviar)"
                }
                disabled={isLoading || isTranscribing}
                rows={1}
                className="flex-1 bg-transparent text-white placeholder-zinc-500 resize-none focus:outline-none text-sm py-1 max-h-[180px] leading-relaxed"
              />

              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={isLoading || isTranscribing}
                className={cn(
                  "flex-shrink-0 mb-0.5 transition",
                  isRecording ? "text-red-400 animate-pulse" : "text-zinc-500 hover:text-zinc-300"
                )}
                title="Mantén presionado para grabar"
              >
                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {isLoading ? (
                <button
                  onClick={stopStreaming}
                  className="bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl p-1.5 flex-shrink-0 transition"
                  title="Detener respuesta"
                >
                  <Square size={16} className="fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() && attachedFiles.length === 0}
                  className="bg-gradient-to-br from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl p-1.5 flex-shrink-0 transition active:scale-95 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
            <p className="text-center text-xs text-zinc-600 mt-2">
              Los GPTs pueden cometer errores. Verifica información importante.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
