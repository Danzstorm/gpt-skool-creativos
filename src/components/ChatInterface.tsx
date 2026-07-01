"use client";

import { useState, useRef, useEffect } from "react";
import type { Gpt } from "@/lib/types";
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  X,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Check,
  Copy,
  Menu,
  Square,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface Message {
  role: "user" | "assistant";
  content: string;
  files?: UploadedFile[];
}

interface UploadedFile {
  name: string;
  openai_file_id: string;
  type: "image" | "document";
}

interface ThreadSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  gpt: Gpt;
  threads: ThreadSummary[];
  activeThreadId: string;
  initialMessages?: Message[];
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative group/code my-2">
      <button
        onClick={copy}
        className="absolute top-2 right-2 flex items-center gap-1 text-xs text-gray-400 hover:text-white bg-gray-800/80 rounded-lg px-2 py-1 opacity-0 group-hover/code:opacity-100 transition"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copiado" : "Copiar"}
      </button>
      <pre className="bg-gray-950 border border-gray-800 rounded-xl p-3 overflow-x-auto text-xs font-mono">
        {children}
      </pre>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-purple-400 underline">
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className || "") || String(children).includes("\n");
            if (isBlock) return <CodeBlock>{String(children).replace(/\n$/, "")}</CodeBlock>;
            return <code className="bg-gray-950 border border-gray-800 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatInterface({ gpt, threads, activeThreadId, initialMessages = [] }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string>(activeThreadId);
  const [threadList, setThreadList] = useState<ThreadSummary[]>(threads);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  function setUrlThread(id: string) {
    window.history.replaceState(null, "", `/chat/${gpt.id}?t=${id}`);
  }

  async function selectThread(id: string) {
    if (id === threadId || isLoadingHistory) return;
    setSidebarOpen(false);
    setThreadId(id);
    setUrlThread(id);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/threads/${id}/messages`);
      const data = res.ok ? await res.json() : [];
      setMessages(data);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function handleNewChat() {
    setSidebarOpen(false);
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gptId: gpt.id }),
    });
    if (!res.ok) return;
    const newThread: ThreadSummary = await res.json();
    setThreadList((prev) => [newThread, ...prev]);
    setThreadId(newThread.id);
    setUrlThread(newThread.id);
    setMessages([]);
  }

  function stopStreaming() {
    abortRef.current?.abort();
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

    if (id === threadId) {
      if (remaining.length > 0) {
        selectThread(remaining[0].id);
      } else {
        handleNewChat();
      }
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
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
          type: file.type.startsWith("image/") ? "image" : "document",
        },
      ]);
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      audioChunksRef.current.push(e.data);
    };

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

  async function sendMessage() {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    const messageText = input.trim();
    const userMessage: Message = {
      role: "user",
      content: messageText,
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachedFiles([]);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    // Título optimista si sigue siendo el default
    setThreadList((prev) =>
      prev.map((t) =>
        t.id === threadId && t.title === "Nueva conversación"
          ? { ...t, title: messageText.slice(0, 40) }
          : t
      )
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          gptId: gpt.id,
          threadId,
          message: messageText,
          fileIds: userMessage.files?.map((f) => f.openai_file_id) ?? [],
        }),
      });

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
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const errMsg =
        err instanceof Error && err.message.includes("Demasiados")
          ? err.message
          : "Error al obtener respuesta. Intenta de nuevo.";
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        // Si se detuvo con contenido parcial, conservarlo; si venía vacío, marcar detenido
        if (aborted) {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || "_(respuesta detenida)_",
          };
        } else {
          updated[updated.length - 1] = { ...last, content: errMsg };
        }
        return updated;
      });
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-[calc(100vh-57px)] relative">
      {/* Backdrop móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 top-[57px] bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar de conversaciones */}
      <aside
        className={cn(
          "w-64 flex-col border-r border-gray-800 bg-gray-950 z-30",
          "md:flex md:relative md:translate-x-0",
          "fixed top-[57px] bottom-0 left-0 flex transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-3 border-b border-gray-800">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-white text-sm font-medium rounded-xl px-3 py-2.5 transition"
          >
            <Plus size={16} />
            Nuevo chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threadList.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-xl px-3 py-2 cursor-pointer text-sm transition",
                t.id === threadId
                  ? "bg-purple-600/20 text-white"
                  : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
              )}
              onClick={() => selectThread(t.id)}
            >
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
                  className="flex-1 bg-gray-800 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
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
                    className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteThread(t.id);
                    }}
                    className="p-1 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="border-b border-gray-800 px-4 py-3 bg-gray-950 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white transition md:hidden"
            aria-label="Abrir conversaciones"
          >
            <Menu size={20} />
          </button>
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-white transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="w-8 h-8 bg-purple-600/20 border border-purple-500/30 rounded-lg flex items-center justify-center text-sm flex-shrink-0">
            {gpt.icon_url ? (
              <img src={gpt.icon_url} alt="" className="w-6 h-6 rounded" />
            ) : (
              "✦"
            )}
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">{gpt.name}</h2>
            {gpt.category && (
              <span className="text-xs text-purple-400">{gpt.category}</span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {isLoadingHistory && (
            <div className="space-y-4 animate-pulse">
              <div className="flex justify-end">
                <div className="h-10 w-2/5 bg-gray-800 rounded-2xl rounded-br-sm" />
              </div>
              <div className="flex justify-start gap-2">
                <div className="w-7 h-7 bg-gray-800 rounded-lg flex-shrink-0" />
                <div className="h-20 w-3/5 bg-gray-800 rounded-2xl rounded-bl-sm" />
              </div>
              <div className="flex justify-end">
                <div className="h-10 w-1/3 bg-gray-800 rounded-2xl rounded-br-sm" />
              </div>
            </div>
          )}

          {messages.length === 0 && !isLoadingHistory && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 bg-purple-600/20 border border-purple-500/30 rounded-2xl flex items-center justify-center text-2xl mb-4">
                {gpt.icon_url ? (
                  <img src={gpt.icon_url} alt="" className="w-10 h-10 rounded-xl" />
                ) : (
                  "✦"
                )}
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{gpt.name}</h3>
              {gpt.description && (
                <p className="text-gray-400 text-sm max-w-sm">{gpt.description}</p>
              )}
              <p className="text-gray-600 text-xs mt-4">
                Escribe un mensaje para comenzar
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 bg-purple-600/20 border border-purple-500/30 rounded-lg flex items-center justify-center text-xs mr-2 flex-shrink-0 mt-0.5">
                  ✦
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3",
                  msg.role === "user"
                    ? "bg-purple-600 text-white rounded-br-sm"
                    : "bg-gray-800 text-gray-100 rounded-bl-sm"
                )}
              >
                {msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.files.map((f, fi) => (
                      <span
                        key={fi}
                        className="text-xs bg-white/10 rounded-lg px-2 py-1"
                      >
                        📎 {f.name}
                      </span>
                    ))}
                  </div>
                )}
                {msg.content ? (
                  msg.role === "assistant" ? (
                    <MessageContent content={msg.content} />
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
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 bg-gray-950 px-4 py-4">
          {/* Archivos adjuntos */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-300"
                >
                  <span>{f.type === "image" ? "🖼️" : "📎"}</span>
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    onClick={() =>
                      setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="text-gray-500 hover:text-white ml-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 rounded-2xl px-3 py-2">
            {/* Botón adjuntar */}
            {(gpt.tools_enabled?.file_search || gpt.vision_enabled) && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={
                    gpt.vision_enabled
                      ? "image/*,application/pdf,.txt,.md,.py,.js,.ts,.csv,.xlsx,.docx"
                      : "application/pdf,.txt,.md,.py,.js,.ts,.csv,.xlsx,.docx"
                  }
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-500 hover:text-gray-300 transition flex-shrink-0 mb-0.5"
                >
                  <Paperclip size={18} />
                </button>
              </>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isTranscribing
                  ? "Transcribiendo audio..."
                  : "Escribe un mensaje... (Enter para enviar)"
              }
              disabled={isLoading || isTranscribing}
              rows={1}
              className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none focus:outline-none text-sm py-1 max-h-[180px] leading-relaxed"
            />

            {/* Botón micrófono */}
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isLoading || isTranscribing}
              className={cn(
                "flex-shrink-0 mb-0.5 transition",
                isRecording
                  ? "text-red-400 animate-pulse"
                  : "text-gray-500 hover:text-gray-300"
              )}
              title="Mantén presionado para grabar"
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            {/* Botón enviar / detener */}
            {isLoading ? (
              <button
                onClick={stopStreaming}
                className="bg-gray-700 hover:bg-gray-600 text-white rounded-xl p-1.5 flex-shrink-0 transition"
                title="Detener respuesta"
              >
                <Square size={16} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim() && attachedFiles.length === 0}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl p-1.5 flex-shrink-0 transition"
              >
                <Send size={16} />
              </button>
            )}
          </div>
          <p className="text-center text-xs text-gray-600 mt-2">
            Los GPTs pueden cometer errores. Verifica información importante.
          </p>
        </div>
      </div>
    </div>
  );
}
