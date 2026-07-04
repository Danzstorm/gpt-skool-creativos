import { forwardRef, memo, useImperativeHandle, useRef, useState } from "react";
import { Send, Paperclip, Mic, MicOff, X, Square } from "lucide-react";
import type { UploadedFile } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ComposerHandle {
  setText: (text: string) => void;
}

interface Props {
  isLoading: boolean;
  isEditing: boolean;
  onCancelEdit: () => void;
  attachedFiles: UploadedFile[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}

// Composer aislado: el texto y la grabación viven acá, no en el componente padre.
// Así escribir no re-renderiza el resto del chat (sidebar, lista de mensajes).
const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { isLoading, isEditing, onCancelEdit, attachedFiles, onFilesSelected, onRemoveFile, onSend, onStop },
  ref
) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  useImperativeHandle(ref, () => ({
    setText(text: string) {
      setInput(text);
      setTimeout(() => {
        autoResize();
        textareaRef.current?.focus();
      }, 0);
    },
  }));

  function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFilesSelected(Array.from(files));
  }

  function handlePaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length > 0) {
      e.preventDefault();
      onFilesSelected(imgs);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    setMicError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("El micrófono requiere HTTPS o localhost. En red local (IP) el navegador lo bloquea.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      if (blob.size === 0) return;
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        if (res.ok) {
          const { text } = await res.json();
          setInput((prev) => (prev ? `${prev} ${text}` : text));
          setTimeout(autoResize, 0);
        } else {
          setMicError("No se pudo transcribir el audio. Intenta de nuevo.");
        }
      } finally {
        setIsTranscribing(false);
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  function submit() {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;
    const text = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-zinc-800/80 bg-zinc-950 px-4 py-4">
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 max-w-3xl mx-auto">
          {attachedFiles.map((f, i) => {
            const imageIndex = attachedFiles.filter((x, xi) => x.type === "image" && xi <= i).length;
            return f.type === "image" ? (
              <div key={i} className="relative group/thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.previewUrl}
                  alt={f.name}
                  className="w-16 h-16 object-cover rounded-xl border border-zinc-700"
                />
                <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/70 text-white rounded px-1">
                  img {imageIndex}
                </span>
                <button
                  onClick={() => onRemoveFile(i)}
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
                <button onClick={() => onRemoveFile(i)} className="text-zinc-500 hover:text-white ml-1">
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
              onCancelEdit();
              setInput("");
            }}
            className="text-zinc-400 hover:text-white"
          >
            Cancelar
          </button>
        </div>
      )}

      {(micError || isRecording) && (
        <div
          className={cn(
            "max-w-3xl mx-auto mb-2 text-xs rounded-lg px-3 py-1.5 border",
            micError
              ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
              : "text-red-300 bg-red-500/10 border-red-500/20"
          )}
        >
          {micError || "🎙️ Grabando... toca el micrófono para detener y transcribir."}
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
          title="Adjuntar imágenes o documentos (también puedes pegar o arrastrar)"
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
          placeholder={isTranscribing ? "Transcribiendo audio..." : "Escribe un mensaje... (Enter para enviar)"}
          disabled={isLoading || isTranscribing}
          rows={1}
          className="flex-1 bg-transparent text-white placeholder-zinc-500 resize-none focus:outline-none text-sm py-1 max-h-[180px] leading-relaxed"
        />

        <button
          onClick={toggleRecording}
          disabled={isLoading || isTranscribing}
          className={cn(
            "flex-shrink-0 mb-0.5 transition",
            isRecording ? "text-red-400 animate-pulse" : "text-zinc-500 hover:text-zinc-300"
          )}
          title={isRecording ? "Toca para detener y transcribir" : "Toca para grabar"}
        >
          {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        {isLoading ? (
          <button
            onClick={onStop}
            className="bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl p-1.5 flex-shrink-0 transition"
            title="Detener respuesta"
          >
            <Square size={16} className="fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
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
  );
});

export default memo(Composer);
