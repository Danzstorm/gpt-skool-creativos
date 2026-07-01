"use client";

import { useState, useRef, useEffect } from "react";
import type { Gpt } from "@/lib/types";
import { Send, Paperclip, Mic, MicOff, X, ArrowLeft } from "lucide-react";
import Link from "next/link";
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

interface Props {
  gpt: Gpt;
  initialThreadId: string | null;
  initialMessages?: Message[];
}

export default function ChatInterface({ gpt, initialThreadId, initialMessages = [] }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
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

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachedFiles([]);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gptId: gpt.id,
          threadId,
          message: userMessage.content,
          fileIds: userMessage.files?.map((f) => f.openai_file_id) ?? [],
        }),
      });

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

          if (parsed.threadId && !threadId) {
            setThreadId(parsed.threadId);
          }

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
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Error al obtener respuesta. Intenta de nuevo.",
        };
        return updated;
      });
    } finally {
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
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3 bg-gray-950 flex items-center gap-3">
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
        {messages.length === 0 && (
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
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
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
                <p className="whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </p>
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

          {/* Botón enviar */}
          <button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl p-1.5 flex-shrink-0 transition"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-2">
          Los GPTs pueden cometer errores. Verifica información importante.
        </p>
      </div>
    </div>
  );
}
