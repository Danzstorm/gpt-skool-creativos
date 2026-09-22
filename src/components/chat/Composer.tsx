import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import { Plus, X, Check, Square } from "lucide-react";
import type { UploadedFile } from "@/lib/types";
import { cn } from "@/lib/utils";
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
import AudioPreview from "./AudioPreview";
import MentionField, { type MentionFieldHandle } from "./MentionField";
import MentionMenu from "./MentionMenu";
import MentionPreview from "./MentionPreview";

/**
 * Cómo se ve el botón de enviar.
 * "plain" = círculo claro de Martin (activo).
 * "gradient" = el efecto anterior. Cambiar esta constante lo enciende de nuevo.
 */
const SEND_LOOK: "plain" | "gradient" = "plain";

function sendLookStyle(enabled: boolean): CSSProperties | undefined {
  if (SEND_LOOK !== "gradient") return undefined;
  return {
    background: enabled ? "var(--brand-gradient)" : "#242428",
    color: enabled ? "#fff" : "#66666f",
  };
}

// Tipos que acepta el <input type="file">. El video va aparte porque depende
// de que Gemini esté configurado (ver `videoEnabled`).
const FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,audio/*,application/pdf,.txt,.md,.py,.js,.ts,.csv,.xlsx,.docx";
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
  /** El GPT vacío del cliente no muestra el disclaimer debajo del composer. */
  hideDisclaimer?: boolean;
}

const DISCLAIMER_STYLE = {
  letterSpacing: 0,
  wordSpacing: "0.12em",
  WebkitTextFillColor: "#62626b",
  background: "none",
  whiteSpace: "pre-wrap",
  fontSize: 11,
  color: "#62626b",
  textAlign: "center",
} as const;

// Composer aislado: el texto y la grabación viven acá, no en el componente padre.
// Así escribir no re-renderiza el resto del chat (sidebar, lista de mensajes).
const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { isLoading, isUploading, isUploadingVideo, pendingCount, videoEnabled, isEditing, onCancelEdit, attachedFiles, mentions, onFilesSelected, onRemoveFile, onSend, onStop, hideDisclaimer },
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

  const sendIdle = isUploading || (!input.trim() && attachedFiles.length === 0);

  return (
    <form
      className={cn(
        "composer w-full !m-0 !border-0 !bg-transparent !shadow-none",
        hideDisclaimer ? "!p-0" : "!px-0 !pt-2 !pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      )}
      id="composer"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <div className="composer-shell overflow-visible !border-0 !bg-transparent !shadow-none">
      {(attachedFiles.length > 0 || isUploading) && (
        <div className="attachments" id="attachments">
          {attachedFiles.map((f, i) => {
            const tileKey = f.clientId ?? f.openai_file_id ?? String(i);
            const visual = f.type === "image" || f.type === "video";
            return f.type === "audio" ? (
              <div key={tileKey} className="attachment attach-tile">
                <AudioPreview src={f.mediaUrl || f.previewUrl} name={f.name} />
                <button type="button" onClick={() => onRemoveFile(i)} aria-label="Quitar adjunto">
                  ×
                </button>
              </div>
            ) : visual ? (
              <div key={tileKey} className="attachment attach-tile">
                <AttachmentStill
                  file={{
                    kind: f.type,
                    previewUrl: f.previewUrl,
                    mediaUrl: f.mediaUrl,
                    durationSeconds: f.durationSeconds,
                  }}
                  loop={f.type === "video"}
                  energy={f.type === "image"}
                  className="h-16 w-16 object-cover"
                  iconSize={16}
                />
                {f.analyzing && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                    <span className="h-3 w-3 rounded-full border-2 border-zinc-500 border-t-zinc-200 animate-spin" />
                  </span>
                )}
                <button type="button" onClick={() => onRemoveFile(i)} aria-label="Quitar adjunto">
                  ×
                </button>
              </div>
            ) : (
              <div key={tileKey} className="flex h-16 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs">
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button type="button" onClick={() => onRemoveFile(i)} className="text-zinc-500 hover:text-ink ml-1">
                  <X size={12} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={openFilePicker}
            className="attachment-add attach-tile"
            title="Adjuntar más archivos"
            aria-label="Adjuntar más archivos"
          >
            <Plus size={18} />
          </button>
          {(isUploading || analyzingAttached) && (
            <div className="flex h-16 items-center gap-2 px-3 py-1.5 text-xs text-zinc-400">
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
            type="button"
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

      <div ref={mentionRef} className="mention-composer relative">
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
      <div className="composer-row flex min-h-16 items-center gap-2.5 overflow-visible rounded-[22px] !border !border-white/[0.09] !bg-[#111113] px-3 py-3 shadow-[0_8px_30px_#0004]">
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

        {attachedFiles.length === 0 && (
          <button
            type="button"
            onClick={openFilePicker}
            className="attach-button !flex h-9 w-9 shrink-0 items-center justify-center rounded-full !bg-transparent text-[#dedee3]"
            title={
              videoEnabled
                ? VIDEO_ATTACH_TITLE
                : "Adjuntar varias imágenes o archivos (las imágenes también se pegan con Ctrl+V)"
            }
            aria-label="Agregar archivos"
          >
            <Plus size={22} strokeWidth={1.6} className="shrink-0" aria-hidden />
          </button>
        )}

        {isRecording && recordingStream ? (
          <>
            <RecordingWave stream={recordingStream} />
            <span className="sr-only" role="status" aria-live="polite">
              Grabando audio
            </span>
          </>
        ) : (
          <>
            <MentionField
              ref={mentionFieldRef}
              value={input}
              mentions={mentions}
              disabled={composerFieldDisabled({ isLoading, isTranscribing })}
              placeholder={
                isTranscribing
                  ? "Transcribiendo audio..."
                  : "Escribe tu idea…"
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
              type="button"
              onClick={startRecording}
              disabled={isLoading || isTranscribing || isUploading}
              className="mic-button !flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              title="Toca para grabar"
              aria-label="Grabar audio"
              aria-pressed={isRecording}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-5 w-5 shrink-0 fill-none stroke-current"
                strokeWidth={1.6}
              >
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
              </svg>
            </button>
          </>
        )}

        {isRecording ? (
          <>
            <button type="button" onClick={() => stopRecording(true)} aria-label="Descartar grabación">
              <X size={18} />
            </button>
            <button
              type="button"
              className="send relative isolate !flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
              style={sendLookStyle(true)}
              onClick={() => stopRecording(false)}
              aria-label="Terminar grabación y transcribir"
            >
              <Check size={18} className="relative z-[1] shrink-0" />
            </button>
          </>
        ) : isLoading ? (
          <button
            type="button"
            className="send relative isolate !flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
            style={sendLookStyle(true)}
            onClick={onStop}
            title="Detener respuesta"
            aria-label="Detener"
          >
            <Square size={14} className="relative z-[1] fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            className="send relative isolate !flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
            style={sendLookStyle(!sendIdle)}
            disabled={sendIdle}
            title={isUploading || analyzingAttached ? "Esperando a que termine el adjunto" : "Enviar mensaje"}
            aria-label="Enviar mensaje"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="relative z-[1] h-5 w-5 shrink-0 fill-none stroke-current"
              strokeWidth={1.6}
            >
              <path d="M12 19V5m-6 6 6-6 6 6" />
            </svg>
          </button>
        )}
      </div>
      </div>
      </div>
      {!hideDisclaimer && (
        <p className="mt-3 bg-transparent text-center" style={DISCLAIMER_STYLE}>
          Los GPTs pueden cometer errores. Verifica información importante.
        </p>
      )}
    </form>
  );
});

export default memo(Composer);
