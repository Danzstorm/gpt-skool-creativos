import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp, Plus, Paperclip, Mic, X, Check, Square, Video } from "lucide-react";
import type { UploadedFile } from "@/lib/types";
import { useDismissable } from "@/lib/useDismissable";
import RecordingWave from "./RecordingWave";
import { imageLabel, imageNumber } from "@/lib/attachment-labels";
import { mentionAt, moveIndex, removeMention, type MentionQuery } from "@/lib/file-search";
import FilePicker from "./FilePicker";
import type { LibraryFile } from "@/app/api/files/route";

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
  /**
   * Hay GEMINI_API_KEY en el servidor. Sin ella el video no se puede describir,
   * así que la opción no se muestra: un botón que termina en "no está disponible"
   * después de subir 100MB es peor que no ofrecerlo.
   */
  videoEnabled: boolean;
  isEditing: boolean;
  /** Hilo activo: acota la biblioteca del `@` a los archivos de este chat. */
  activeThreadId: string | null;
  onCancelEdit: () => void;
  attachedFiles: UploadedFile[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Adjunta un archivo ya subido antes, elegido desde el menú `@`. */
  onLibraryPick: (file: LibraryFile) => void;
}

// Composer aislado: el texto y la grabación viven acá, no en el componente padre.
// Así escribir no re-renderiza el resto del chat (sidebar, lista de mensajes).
const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { isLoading, isUploading, isUploadingVideo, videoEnabled, isEditing, activeThreadId, onCancelEdit, attachedFiles, onFilesSelected, onRemoveFile, onSend, onStop, onLibraryPick },
  ref
) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  // El stream vive en estado (y no en un ref) porque la onda necesita
  // re-renderizar para montarse cuando arranca la grabación.
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState("");

  // Menú `@` de la biblioteca de archivos.
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Cancelar y confirmar detienen el mismo recorder; esta bandera es lo único
  // que distingue "descartá el audio" de "transcribilo".
  const cancelledRef = useRef(false);


  const closeMention = useCallback(() => setMention(null), []);
  const mentionRef = useDismissable<HTMLDivElement>(mention !== null, closeMention);

  // Se busca en la biblioteca con un respiro de 180ms: sin él, cada tecla
  // dispara una petición y el servidor recibe una ráfaga por palabra escrita.
  const mentionQuery = mention?.query ?? null;
  useEffect(() => {
    if (mentionQuery === null) return;
    // Chat nuevo, sin hilo todavía: nada propio que referenciar.
    if (!activeThreadId) {
      setLibrary([]);
      setLibraryLoading(false);
      return;
    }
    let cancelled = false;
    setLibraryLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ threadId: activeThreadId, q: mentionQuery });
        const res = await fetch(`/api/files?${params}`);
        if (!res.ok) throw new Error("no se pudo cargar la biblioteca");
        const data: LibraryFile[] = await res.json();
        if (cancelled) return;
        setLibrary(data);
        setActiveIndex(0);
      } catch {
        // Silencioso a propósito: el menú se ve vacío, que es información
        // suficiente. Un error rojo tapando el composer sería peor que no
        // encontrar archivos.
        if (!cancelled) setLibrary([]);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mentionQuery, activeThreadId]);

  /** Recalcula si el cursor está dentro de una mención `@`. */
  function syncMention(el: HTMLTextAreaElement) {
    setMention(mentionAt(el.value, el.selectionStart ?? el.value.length));
  }

  function pickFromLibrary(file: LibraryFile) {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? el.value.length;
    const next = removeMention(el.value, mention, caret);
    setInput(next.text);
    setMention(null);
    onLibraryPick(file);
    // El cursor vuelve a donde estaba el `@`, para poder seguir escribiendo
    // la frase sin buscar el punto con el mouse.
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      autoResize();
    }, 0);
  }

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
    // El menú se atiende PRIMERO. Si no, Enter envía el mensaje en vez de
    // elegir el archivo resaltado — el error clásico de este tipo de menú.
    if (mention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => moveIndex(i, 1, library.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => moveIndex(i, -1, library.length));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
      // Con la lista vacía NO se intercepta: alguien escribió "@zzz" sin
      // resultados y lo que quiere es mandar su mensaje, no elegir nada.
      //
      // Y tampoco mientras se está buscando: en ese momento `library` todavía
      // tiene los resultados de la consulta ANTERIOR, que ya no se ven en
      // pantalla (el menú muestra "Buscando…"). Sin este guardia, escribir
      // `@bri`, seguir tecleando y dar Enter adjuntaba un archivo que el
      // usuario no tenía delante.
      if ((e.key === "Enter" || e.key === "Tab") && !libraryLoading && library.length > 0) {
        e.preventDefault();
        pickFromLibrary(library[activeIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="bg-zinc-950 px-4 pt-2.5 pb-2">
      {(attachedFiles.length > 0 || isUploading) && (
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
                {f.type === "video" ? (
                  <Video size={13} className="text-zinc-400 flex-shrink-0" />
                ) : (
                  <Paperclip size={13} className="text-zinc-400 flex-shrink-0" />
                )}
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button onClick={() => onRemoveFile(i)} className="text-zinc-500 hover:text-ink ml-1">
                  <X size={12} />
                </button>
              </div>
            );
          })}
          {/* El progreso vive acá y no en el placeholder del textarea: ahí
              decía "Analizando video..." y hacía sentir que el campo estaba
              ocupado, cuando escribir siempre estuvo permitido. */}
          {isUploading && (
            <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-400 h-16">
              <span className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
              {isUploadingVideo ? (
                <span>
                  Analizando video...
                  <span className="block text-zinc-500">Puedes seguir escribiendo</span>
                </span>
              ) : (
                <span>Subiendo...</span>
              )}
            </div>
          )}
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

      <div ref={mentionRef} className="relative flex items-end gap-2 bg-zinc-900/80 border border-zinc-700/70 focus-within:border-zinc-500 rounded-2xl px-3.5 py-2 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] max-w-3xl mx-auto">
        {mention && (
          <FilePicker
            files={library}
            activeIndex={activeIndex}
            loading={libraryLoading}
            query={mention.query}
            onPick={pickFromLibrary}
            onHover={setActiveIndex}
          />
        )}
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
          className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition flex-shrink-0"
          title={
            videoEnabled
              ? "Adjuntar imágenes, archivos o video (también puedes pegar o arrastrar)"
              : "Adjuntar imágenes o archivos (también puedes pegar o arrastrar)"
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
            {/* Micrófono y controles de grabación usan la misma caja de 32px que
                el botón de enviar: con items-end, dos alturas distintas dejan los
                centros ópticos desalineados. */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                syncMention(e.target);
                autoResize();
              }}
              // onSelect cubre mover el cursor con el mouse o las flechas hasta
              // dentro de un `@` que ya estaba escrito.
              onSelect={(e) => syncMention(e.currentTarget)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isTranscribing
                  ? "Transcribiendo audio..."
                  : "Escribe un mensaje... (Enter para enviar)"
              }
              disabled={isLoading || isTranscribing}
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
            // Enviar sigue esperando al adjunto: mandar antes dejaría el mensaje
            // sin el archivo que lo motivó. Escribir, en cambio, nunca se bloquea.
            title={isUploading ? "Esperando a que termine el adjunto" : "Enviar"}
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
