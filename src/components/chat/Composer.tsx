import { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp, Plus, Image as ImageIcon, Paperclip, Mic, X, Check, Square } from "lucide-react";
import type { UploadedFile } from "@/lib/types";
import { useDismissable } from "@/lib/useDismissable";
import RecordingWave from "./RecordingWave";
import { imageLabel, imageNumber } from "@/lib/attachment-labels";

export interface ComposerHandle {
  setText: (text: string) => void;
}

interface Props {
  isLoading: boolean;
  isUploading: boolean;
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
  { isLoading, isUploading, isEditing, onCancelEdit, attachedFiles, onFilesSelected, onRemoveFile, onSend, onStop },
  ref
) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  // El stream vive en estado (y no en un ref) porque la onda necesita
  // re-renderizar para montarse cuando arranca la grabación.
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Cancelar y confirmar detienen el mismo recorder; esta bandera es lo único
  // que distingue "descartá el audio" de "transcribilo".
  const cancelledRef = useRef(false);

  const closeAttachMenu = useCallback(() => setAttachMenuOpen(false), []);
  const attachMenuRef = useDismissable<HTMLDivElement>(attachMenuOpen, closeAttachMenu);

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

  function openFilePicker(accept: string) {
    setAttachMenuOpen(false);
    const el = fileInputRef.current;
    if (!el) return;
    el.accept = accept;
    el.click();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length > 0) {
      e.preventDefault();
      onFilesSelected(imgs);
    }
  }

  function stopRecording(cancel: boolean) {
    cancelledRef.current = cancel;
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setRecordingStream(null);
  }

  async function startRecording() {
    if (isRecording) return;

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
      // El micrófono se libera pase lo que pase, también al cancelar.
      stream.getTracks().forEach((t) => t.stop());

      if (cancelledRef.current) {
        cancelledRef.current = false;
        audioChunksRef.current = [];
        return;
      }

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
    setRecordingStream(stream);
  }

  function submit() {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading || isUploading) return;
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
    <div className="bg-zinc-950 px-4 pt-2.5 pb-2">
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 max-w-3xl mx-auto">
          {attachedFiles.map((f, i) => {
            // La numeración sale de la misma función que usa el servidor para
            // rotular las imágenes que le manda al modelo: si se calcularan por
            // separado, el usuario vería "imagen 2" mientras el modelo habla
            // de otra.
            const position = imageNumber(attachedFiles, i);
            return f.type === "image" ? (
              <div key={i} className="relative group/thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.previewUrl}
                  alt={f.name}
                  className="w-16 h-16 object-cover rounded-xl border border-zinc-700"
                />
                <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/70 text-white rounded px-1">
                  {position !== null ? imageLabel(position) : "imagen"}
                </span>
                <button
                  onClick={() => onRemoveFile(i)}
                  className="absolute -top-1.5 -right-1.5 bg-zinc-800 border border-zinc-600 rounded-full p-0.5 text-zinc-300 hover:text-ink opacity-0 group-hover/thumb:opacity-100 transition"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 h-16"
              >
                <Paperclip size={13} className="text-zinc-400 flex-shrink-0" />
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button onClick={() => onRemoveFile(i)} className="text-zinc-500 hover:text-ink ml-1">
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
            className="text-zinc-400 hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      )}

      {micError && (
        <div className="max-w-3xl mx-auto mb-2 text-xs rounded-lg px-3 py-1.5 border flex items-center gap-2 text-amber-300 bg-amber-500/10 border-amber-500/20">
          {micError}
        </div>
      )}

      <div className="flex items-end gap-2 bg-zinc-900/80 border border-zinc-700/70 focus-within:border-zinc-500 rounded-2xl px-3.5 py-2 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] max-w-3xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.txt,.md,.py,.js,.ts,.csv,.xlsx,.docx"
          className="hidden"
          onChange={(e) => {
            handleFileUpload(e.target.files);
            e.currentTarget.value = "";
          }}
        />

        <div ref={attachMenuRef} className="relative flex-shrink-0">
          {attachMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden py-1">
              <button
                type="button"
                onClick={() => openFilePicker("image/jpeg,image/png,image/webp,image/gif")}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-ink transition text-left"
              >
                <ImageIcon size={15} />
                Imágenes
              </button>
              <button
                type="button"
                onClick={() =>
                  openFilePicker("application/pdf,.txt,.md,.py,.js,.ts,.csv,.xlsx,.docx")
                }
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-ink transition text-left"
              >
                <Paperclip size={15} />
                Archivos
              </button>
            </div>
          )}
          <button
            onClick={() => setAttachMenuOpen((v) => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition"
            title="Adjuntar imágenes o archivos (también puedes pegar o arrastrar)"
            aria-label="Adjuntar"
          >
            <Plus size={17} />
          </button>
        </div>

        {/* Grabando: la onda ocupa el centro (donde va el texto) y el micrófono
            desaparece, porque detener pasa a ser el botón de la derecha. */}
        {isRecording && recordingStream ? (
          <>
            <RecordingWave stream={recordingStream} />
            <span className="sr-only" role="status" aria-live="polite">
              Grabando audio
            </span>
          </>
        ) : (
          <>
            {/* Micrófono y controles de grabación usan la misma caja de 32px que
                el botón de enviar: con items-end, dos alturas distintas dejan los
                centros ópticos desalineados. */}
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
                isTranscribing
                  ? "Transcribiendo audio..."
                  : isUploading
                    ? "Procesando imágenes..."
                    : "Escribe un mensaje... (Enter para enviar)"
              }
              disabled={isLoading || isTranscribing || isUploading}
              rows={1}
              className="flex-1 bg-transparent text-ink placeholder-zinc-500 resize-none focus:outline-none text-[15px] py-1.5 max-h-[180px] leading-normal"
            />

            <button
              onClick={startRecording}
              disabled={isLoading || isTranscribing || isUploading}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition"
              title="Toca para grabar"
              aria-label="Grabar audio"
            >
              <Mic size={18} />
            </button>
          </>
        )}

        {isRecording ? (
          <>
            <button
              onClick={() => stopRecording(true)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-ink hover:bg-zinc-800/60 transition"
              title="Descartar grabación"
              aria-label="Descartar grabación"
            >
              <X size={18} />
            </button>
            <button
              onClick={() => stopRecording(false)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-zinc-200 hover:text-ink hover:bg-zinc-800/60 transition active:scale-95"
              title="Listo, transcribir"
              aria-label="Terminar grabación y transcribir"
            >
              <Check size={19} />
            </button>
          </>
        ) : isLoading ? (
          <button
            onClick={onStop}
            className="bg-zinc-700 hover:bg-zinc-600 text-ink rounded-full p-2 flex-shrink-0 transition"
            title="Detener respuesta"
          >
            <Square size={14} className="fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={isUploading || (!input.trim() && attachedFiles.length === 0)}
            className="bg-cta hover:bg-cta-active disabled:bg-zinc-700 disabled:text-zinc-500 text-cta-fg disabled:cursor-not-allowed rounded-full p-2 flex-shrink-0 transition active:scale-95"
            aria-label="Enviar"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p className="text-center text-[11px] text-zinc-600 mt-1.5">
        Los GPTs pueden cometer errores. Verifica información importante.
      </p>
    </div>
  );
});

export default memo(Composer);
