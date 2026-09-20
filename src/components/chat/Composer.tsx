import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowUp, Plus, Paperclip, Mic, X, Check, Square, Video } from "lucide-react";
import type { UploadedFile } from "@/lib/types";
import { useDismissable } from "@/hooks/useDismissable";
import RecordingWave from "./RecordingWave";
import {
  filterMentionCandidates,
  findCandidateByToken,
  insertMentionToken,
  type MentionCandidate,
} from "@/lib/attachment-mentions";
import { composerFieldDisabled } from "@/lib/composer-input";
import { mentionAt, moveIndex, type MentionQuery } from "@/lib/file-search";
import { VIDEO_ANALYZING_HINT, VIDEO_ANALYZING_LABEL, VIDEO_ATTACH_TITLE } from "@/lib/video-copy";
import AttachmentStill from "./AttachmentStill";
import MentionField, { type MentionFieldHandle } from "./MentionField";
import MentionMenu from "./MentionMenu";
import MentionPreview from "./MentionPreview";

// Tipos que acepta el <input type="file">. El video va aparte porque depende
// de que Gemini esté configurado (ver `videoEnabled`).
const FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.txt,.md,.py,.js,.ts,.csv,.xlsx,.docx";
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";

export interface ComposerHandle {
  setText: (text: string) => void;
}

interface Props {
  isLoading: boolean;
  isUploading: boolean;
  /** Un video del batch actual está subiéndose/analizándose (tarda más que un archivo normal). */
  isUploadingVideo?: boolean;
  /** Archivos de esta tanda (y las que se sumaron) todavía en vuelo. */
  pendingCount?: number;
  /**
   * Hay GEMINI_API_KEY en el servidor. Sin ella el video no se puede describir,
   * así que la opción no se muestra: un botón que termina en "no está disponible"
   * después de subir 100MB es peor que no ofrecerlo.
   */
  videoEnabled: boolean;
  isEditing: boolean;
  onCancelEdit: () => void;
  attachedFiles: UploadedFile[];
  /** Adjuntos del hilo + bandeja, para el menú `@` y el preview del token. */
  mentions: MentionCandidate[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}

// Composer aislado: el texto y la grabación viven acá, no en el componente padre.
// Así escribir no re-renderiza el resto del chat (sidebar, lista de mensajes).
const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { isLoading, isUploading, isUploadingVideo, pendingCount, videoEnabled, isEditing, onCancelEdit, attachedFiles, mentions, onFilesSelected, onRemoveFile, onSend, onStop },
  ref
) {
  const analyzingAttached = attachedFiles.some((file) => file.analyzing);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  // El stream vive en estado (y no en un ref) porque la onda necesita
  // re-renderizar para montarse cuando arranca la grabación.
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState("");

  // Menú `@` de los adjuntos del hilo actual + los pendientes de la bandeja.
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tokenPreview, setTokenPreview] = useState<{ token: string; rect: DOMRect } | null>(null);

  const mentionFieldRef = useRef<MentionFieldHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Cancelar y confirmar detienen el mismo recorder; esta bandera es lo único
  // que distingue "descartá el audio" de "transcribilo".
  const cancelledRef = useRef(false);

  const closeMention = useCallback(() => setMention(null), []);
  const mentionRef = useDismissable<HTMLDivElement>(mention !== null, closeMention);

  const mentionOptions = useMemo(
    () => (mention ? filterMentionCandidates(mentions, mention.query) : []),
    [mention, mentions]
  );

  function syncMention() {
    const field = mentionFieldRef.current;
    if (!field) return;
    const next = mentionAt(field.getValue(), field.getCaret());
    const same = mention?.start === next?.start && mention?.query === next?.query;
    if (!same) setActiveIndex(0);
    setMention(next);
  }

  function pickMention(file: MentionCandidate) {
    const field = mentionFieldRef.current;
    if (!field || !mention) return;
    const next = insertMentionToken(field.getValue(), mention.start, field.getCaret(), file.token);
    setInput(next.text);
    field.apply(next.text, next.caret);
    setMention(null);
    setTokenPreview(null);
    field.focus();
  }

  useImperativeHandle(ref, () => ({
    setText(text: string) {
      setInput(text);
      setTimeout(() => {
        mentionFieldRef.current?.apply(text, text.length);
        mentionFieldRef.current?.focus();
      }, 0);
    },
  }));

  function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFilesSelected(Array.from(files));
  }

  // Un único botón de adjuntar, sin submenú por tipo. Los tres accesos
  // (Imágenes / Archivos / Video) no hacían nada distinto entre sí: solo
  // recortaban el `accept` que ya declara el <input>, a cambio de un click de
  // más y de una decisión que no le toca al usuario ("¿un PDF es archivo o
  // imagen?"). El tipo lo resuelve el servidor por el MIME real, no el menú.
  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length > 0) {
      e.preventDefault();
      onFilesSelected(imgs);
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text) {
      e.preventDefault();
      document.execCommand("insertText", false, text);
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
          setInput((prev) => {
            const next = prev ? `${prev} ${text}` : text;
            setTimeout(() => mentionFieldRef.current?.apply(next, next.length), 0);
            return next;
          });
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
    mentionFieldRef.current?.apply("", 0);
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // El menú se atiende PRIMERO. Si no, Enter envía el mensaje en vez de
    // elegir el archivo resaltado — el error clásico de este tipo de menú.
    if (mention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 2, Math.max(0, mentionOptions.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 2, 0));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((i) => moveIndex(i, 1, mentionOptions.length));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((i) => moveIndex(i, -1, mentionOptions.length));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
      // Con la lista vacía NO se intercepta: alguien escribió "@zzz" sin
      // resultados y lo que quiere es mandar su mensaje, no elegir nada.
      if ((e.key === "Enter" || e.key === "Tab") && mentionOptions.length > 0) {
        e.preventDefault();
        pickMention(mentionOptions[activeIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="bg-transparent">
      {(attachedFiles.length > 0 || isUploading) && (
        <div className="flex flex-wrap gap-2 mb-3 max-w-3xl mx-auto">
          {attachedFiles.map((f, i) => {
            const visual = f.type === "image" || (f.type === "video" && f.previewUrl);
            return visual ? (
              <div key={i} className="relative group/thumb">
                <span className="relative block h-16 w-16 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                  <AttachmentStill
                    file={{
                      kind: f.type,
                      previewUrl: f.previewUrl,
                      durationSeconds: f.durationSeconds,
                    }}
                    className="h-16 w-16 object-cover"
                    iconSize={16}
                  />
                  {f.analyzing && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                      <span className="h-3 w-3 rounded-full border-2 border-zinc-500 border-t-zinc-200 animate-spin" />
                    </span>
                  )}
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
                className="flex h-16 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300"
              >
                {f.type === "video" ? (
                  <Video size={13} className="text-zinc-400 flex-shrink-0" />
                ) : (
                  <Paperclip size={13} className="text-zinc-400 flex-shrink-0" />
                )}
                <span className="max-w-[120px] truncate">{f.name}</span>
                {f.analyzing && <span className="text-zinc-500">analizando…</span>}
                <button onClick={() => onRemoveFile(i)} className="text-zinc-500 hover:text-ink ml-1">
                  <X size={12} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={openFilePicker}
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300"
            title="Adjuntar más archivos"
            aria-label="Adjuntar más archivos"
          >
            <Plus size={18} />
          </button>
          {/* El progreso vive acá y no en el placeholder del textarea: ahí
              decía "Analizando video..." y hacía sentir que el campo estaba
              ocupado, cuando escribir siempre estuvo permitido. */}
          {(isUploading || analyzingAttached) && (
            <div className="flex h-16 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400">
              <span className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
              {isUploadingVideo || analyzingAttached ? (
                <span>
                  {VIDEO_ANALYZING_LABEL}
                  <span className="block text-zinc-500">{VIDEO_ANALYZING_HINT}</span>
                </span>
              ) : (
                <span>
                  {pendingCount && pendingCount > 1
                    ? `Subiendo ${pendingCount} archivos...`
                    : "Subiendo..."}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {isEditing && (
        <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-xl border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs text-zinc-200">
          <span>Editando mensaje — al enviar se reemplaza la respuesta anterior.</span>
          <button
            onClick={() => {
              onCancelEdit();
              setInput("");
              mentionFieldRef.current?.apply("", 0);
            }}
            className="text-zinc-400 hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      )}

      {micError && (
        <div className="max-w-3xl mx-auto mb-2 text-xs rounded-xl px-3 py-1.5 flex items-center gap-2 text-amber-200 bg-amber-500/10 border border-amber-500/30">
          {micError}
        </div>
      )}

      <div ref={mentionRef} className="mention-composer relative mx-auto max-w-3xl">
        {mention && (
          <MentionMenu
            files={mentionOptions}
            activeIndex={activeIndex}
            query={mention.query}
            onPick={pickMention}
            onHover={setActiveIndex}
            onPreview={(el, token) =>
              setTokenPreview({ token, rect: el.getBoundingClientRect() })
            }
            onPreviewEnd={() => setTokenPreview(null)}
          />
        )}
        {tokenPreview && findCandidateByToken(mentions, tokenPreview.token) && (
          <MentionPreview
            candidate={findCandidateByToken(mentions, tokenPreview.token)!}
            anchor={tokenPreview.rect}
          />
        )}
      <div className="frost flex items-end gap-2 rounded-3xl px-4 py-2.5 transition-colors focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/25">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={videoEnabled ? `${FILE_ACCEPT},${VIDEO_ACCEPT}` : FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleFileUpload(e.target.files);
            e.currentTarget.value = "";
          }}
        />

        <button
          onClick={openFilePicker}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
          // Arrastrar archivos acá no existe (el único drag&drop es mover chats
          // a una carpeta en el sidebar) y `handlePaste` solo acepta image/*,
          // así que el globo nombra pegar únicamente para imágenes.
          title={
            videoEnabled
              ? VIDEO_ATTACH_TITLE
              : "Adjuntar varias imágenes o archivos (las imágenes también se pegan con Ctrl+V)"
          }
          aria-label="Adjuntar"
        >
          <Plus size={17} />
        </button>

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
            {/* Micrófono y controles de grabación usan la misma caja de 36px que
                el botón de enviar: con items-end, dos alturas distintas dejan los
                centros ópticos desalineados. */}
            <MentionField
              ref={mentionFieldRef}
              value={input}
              mentions={mentions}
              disabled={composerFieldDisabled({ isLoading, isTranscribing })}
              placeholder={
                isTranscribing
                  ? "Transcribiendo audio..."
                  : "Escribe un mensaje... (Enter para enviar)"
              }
              onChange={setInput}
              onCaret={syncMention}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onTokenPreview={(el, token) =>
                setTokenPreview({ token, rect: el.getBoundingClientRect() })
              }
              onTokenPreviewEnd={() => setTokenPreview(null)}
            />

            <button
              onClick={startRecording}
              disabled={isLoading || isTranscribing || isUploading}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
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
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              title="Descartar grabación"
              aria-label="Descartar grabación"
            >
              <X size={18} />
            </button>
            <button
              onClick={() => stopRecording(false)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-zinc-100 transition hover:bg-brand/20 active:scale-95"
              title="Listo, transcribir"
              aria-label="Terminar grabación y transcribir"
            >
              <Check size={19} />
            </button>
          </>
        ) : isLoading ? (
          <button
            onClick={onStop}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-100 transition hover:bg-zinc-700"
            title="Detener respuesta"
          >
            <Square size={14} className="fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={isUploading || (!input.trim() && attachedFiles.length === 0)}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-[#E00032] active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:hover:bg-zinc-800"
            // Enviar sigue esperando al adjunto: mandar antes dejaría el mensaje
            // sin el archivo que lo motivó. Escribir, en cambio, nunca se bloquea.
            title={
              isUploading || analyzingAttached
                ? "Esperando a que termine el adjunto"
                : "Enviar"
            }
            aria-label="Enviar"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
      </div>
      <p className="mt-1 text-center text-[11px] leading-4 text-zinc-600">
        Los GPTs pueden cometer errores. Verifica información importante.
      </p>
    </div>
  );
});

export default memo(Composer);
