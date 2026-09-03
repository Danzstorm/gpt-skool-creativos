"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Gpt, Message, UploadedFile, ThreadSummary, Theme } from "@/lib/types";
import { Menu, ArrowDown, ChevronDown, PanelLeftOpen, SquarePen } from "lucide-react";
import Sparkle from "./Sparkle";
import GptGlyph from "./chat/GptGlyph";
import ChatSidebar from "./chat/ChatSidebar";
import MessageBubble from "./chat/MessageBubble";
import Composer, { type ComposerHandle } from "./chat/Composer";
import GptChatsModal from "./chat/GptChatsModal";
import { consumeSSE } from "@/lib/stream-client";
import ThinkingIndicator from "./chat/ThinkingIndicator";
import {
  countAttachments,
  EMPTY_ATTACHMENTS,
  type Phase,
  type ThinkingAttachments,
} from "@/lib/thinking-phrases";
import { downscaleImage } from "@/lib/image-resize";
import { createClient } from "@/lib/supabase/client";
import { MAX_FILES_PER_MESSAGE } from "@/lib/upload-file";
import { MAX_SIZE_BYTES, MAX_SIZE_MB } from "@/lib/upload-limits";

// Solo se usa para subir adjuntos a Storage con URL firmada; el resto de los
// datos del chat viaja por las rutas de /api.
const supabase = createClient();

const SIDEBAR_COLLAPSED_KEY = "chat_sidebar_collapsed";

interface Props {
  gpts: Gpt[];
  threads: ThreadSummary[];
  initialThreadId?: string | null;
  initialGptId?: string | null;
  profile: { fullName: string | null; email: string | null; isAdmin: boolean; theme: Theme };
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
  // Fase que informa el servidor y momento en que se abrió el stream, para el
  // indicador de espera. Viven aquí porque solo runAssistant sabe cuándo
  // empieza y termina un turno.
  const [phase, setPhase] = useState<Phase>("thinking");
  const [thinkingStartedAt, setThinkingStartedAt] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [gptChatsModalId, setGptChatsModalId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(profile.theme);

  // Optimista: cambia al instante en pantalla, guarda en la cuenta en paralelo.
  // Si el PATCH falla, no revertimos — es una preferencia visual, no algo
  // crítico; el próximo cambio exitoso corrige el estado guardado igual.
  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    fetch("/api/me/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }, []);

  // Aplicado post-montaje (no en el estado inicial) para que el SSR/primer
  // render coincida siempre con "expandido" y no genere hydration mismatch;
  // leer localStorage en el lazy initializer de useState rompería esa paridad.
  useEffect(() => {
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
    setUploadError(null);
    if (pendingUploads > 0) {
      setUploadError("Espera a que termine la subida actual antes de adjuntar más archivos.");
      return;
    }

    const remaining = MAX_FILES_PER_MESSAGE - attachedFiles.length;
    if (remaining <= 0) {
      setUploadError(`Puedes adjuntar hasta ${MAX_FILES_PER_MESSAGE} archivos por mensaje.`);
      return;
    }
    const batch = files.slice(0, remaining);
    const skippedCount = files.length - batch.length;
    setPendingUploads(batch.length);

    // En paralelo: antes iban de a uno y adjuntar 3 imágenes tardaba el triple.
    const results = await Promise.all(
      batch.map(async (original) => {
        const fail = (msg: string) => ({ error: `${original.name}: ${msg}` });
        try {
          if (original.size > MAX_SIZE_BYTES) {
            return fail(`supera el límite de ${MAX_SIZE_MB}MB`);
          }
          // Las imágenes se achican igual: no por el límite (ya no aplica) sino
          // porque subir 8MB de foto no mejora la respuesta y se siente lento.
          const file = await downscaleImage(original);

          // Subida en dos pasos para saltar el techo de 4.5MB que Vercel impone
          // al body de sus funciones: el archivo va del navegador directo a
          // Supabase Storage, y el servidor solo lo copia a OpenAI después.
          const signRes = await fetch("/api/upload/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
          });
          if (!signRes.ok) {
            return fail((await signRes.json().catch(() => null))?.error ?? "no se pudo subir");
          }
          const { path, token } = await signRes.json();

          const { error: upErr } = await supabase.storage
            .from("chat-uploads")
            .uploadToSignedUrl(path, token, file);
          if (upErr) return fail("falló la subida, revisa tu conexión");

          const regRes = await fetch("/api/upload/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, name: file.name, type: file.type }),
          });
          if (!regRes.ok) {
            return fail((await regRes.json().catch(() => null))?.error ?? "no se pudo procesar");
          }

          const data = await regRes.json();
          const uploadedAsImage = data.kind === "image";
          const previewBlob =
            uploadedAsImage && !file.type && data.mime
              ? new Blob([file], { type: data.mime })
              : file;
          return {
            file: {
              name: original.name,
              openai_file_id: data.file_id,
              type: (uploadedAsImage ? "image" : "document") as UploadedFile["type"],
              previewUrl: uploadedAsImage ? URL.createObjectURL(previewBlob) : undefined,
            },
          };
        } catch {
          return fail("no se pudo subir");
        }
      })
    );

    setPendingUploads(0);

    const ok = results.flatMap((r) => ("file" in r && r.file ? [r.file] : []));
    if (ok.length > 0) setAttachedFiles((prev) => [...prev, ...ok]);

    // Antes los fallos se descartaban en silencio y el archivo simplemente no
    // aparecía, sin ninguna pista de por qué.
    const errors = [
      ...(skippedCount > 0
        ? [`Se omitieron ${skippedCount} archivos: máximo ${MAX_FILES_PER_MESSAGE} por mensaje.`]
        : []),
      ...results.flatMap((r) => ("error" in r && r.error ? [r.error] : [])),
    ];
    if (errors.length > 0) setUploadError(errors.join(" · "));
  }, [attachedFiles.length, pendingUploads]);

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

  // consumeStream ya traduce 429/409/403 a mensajes en español (líneas arriba)
  // y el frame `error` que manda chat-stream.ts también viene en español —
  // esos casos llegan aquí como Error con mensaje ya listo para mostrar. Lo
  // único que queda crudo es un fallo del propio fetch (red caída, DNS, CORS):
  // el navegador nunca los traduce y el texto varía por navegador
  // ("Failed to fetch" en Chrome, "NetworkError..." en Firefox, "Load failed"
  // en Safari). Esos se detectan y se reemplazan por un mensaje genérico.
  function friendlyStreamError(err: unknown): string {
    if (err instanceof Error) {
      const raw = err.message.toLowerCase();
      const isRawNetworkError =
        raw.includes("fetch") || raw.includes("network") || raw.includes("load failed");
      if (isRawNetworkError) return "Se perdió la conexión. Intenta de nuevo.";
      return err.message;
    }
    return "No se pudo completar la respuesta. Intenta de nuevo.";
  }

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
      // El proxy y el límite de cuota comparten el 403. Sin distinguirlos, a un
      // miembro dado de baja se le decía que había agotado sus mensajes del mes
      // y se quedaba en el chat con una sesión ya cerrada.
      if (data?.code === "membership_revoked") {
        // Navegación completa a propósito: fuerza pasar por el proxy en vez de
        // quedarse con el árbol de React de una sesión que ya no existe.
        window.location.assign("/unauthorized?reason=revoked");
        return;
      }
      throw new Error(data?.error || "Alcanzaste tu límite de mensajes de este mes.");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Error al enviar mensaje");
    }

    await consumeSSE(
      res,
      (text) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + text,
          };
          return updated;
        });
      },
      // El servidor puede mandar una fase que este cliente todavía no conozca
      // (si un deploy va antes que el otro). phraseFor cae al relleno sola, así
      // que no hace falta validar acá.
      (next) => setPhase(next as Phase)
    );
  }

  // Agrega un placeholder de asistente y streamea la respuesta desde `url`
  async function runAssistant(url: string, body: object) {
    setIsLoading(true);
    setPhase("thinking");
    setThinkingStartedAt(Date.now());
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
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        // Nunca se pisa `content`: si el stream ya había escrito 3 párrafos
        // antes de cortarse, esos párrafos se conservan y el aviso va aparte.
        // Antes `content: errMsg` reemplazaba todo lo generado por un mensaje
        // de error crudo (a veces en inglés, "Failed to fetch") con el mismo
        // estilo visual que una respuesta real del GPT.
        updated[updated.length - 1] = aborted
          ? { ...last, content: last.content || "_(respuesta detenida)_" }
          : { ...last, error: friendlyStreamError(err) };
        return updated;
      });
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (
        (!text.trim() && attachedFiles.length === 0) ||
        isLoading ||
        pendingUploads > 0 ||
        !activeGptId
      ) return;

      const messageText = text.trim();
      const imageCount = attachedFiles.filter((f) => f.type === "image").length;
      const attachmentLabel =
        attachedFiles.length === 1
          ? imageCount === 1 ? "Imagen adjunta" : "Archivo adjunto"
          : imageCount === attachedFiles.length
            ? `${attachedFiles.length} imágenes adjuntas`
            : `${attachedFiles.length} archivos adjuntos`;
      const messageLabel = messageText || attachmentLabel;
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
                title: t.title === "Nueva conversación" ? messageLabel.slice(0, 40) : t.title,
                last_message_preview: messageLabel.slice(0, 80),
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
    [activeGptId, activeThreadId, attachedFiles, isEditing, isLoading, pendingUploads]
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
    // Editar debe conservar las imágenes/documentos del turno. El backend
    // borra el turno anterior completo antes de reponerlo; enviarlo sin estos
    // archivos cambiaba silenciosamente el contexto del modelo.
    setAttachedFiles(m.files ? [...m.files] : []);
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
    // bg-zinc-950 en el root: el área principal (mensajes, empty-state) no fija
    // fondo propio y antes dejaba pasar el `--background` oscuro del <body> —
    // invisible en temas oscuros, pero en Papel el sidebar se volvía crema y el
    // centro seguía negro (split roto). Tematizar el root cubre toda la superficie.
    // zoom 1.15 = interfaz de chat 15% más grande (pedido del cliente). Se compensa
    // width/height (÷1.15) para que el shell siga llenando EXACTO el viewport y no
    // desborde con scroll de página; el scroll real vive en el área de mensajes.
    <div
      className="flex relative bg-zinc-950 text-zinc-100"
      data-theme={theme}
      style={{ zoom: 1.15, width: "calc(100vw / 1.15)", height: "calc(100dvh / 1.15)" }}
    >
      <ChatSidebar
        gpts={gpts}
        threadList={threadList}
        activeGptId={activeGptId}
        activeThreadId={activeThreadId}
        sidebarOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        profile={profile}
        theme={theme}
        onThemeChange={changeTheme}
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
        <div className="border-b border-zinc-800/80 px-4 py-2.5 bg-zinc-950/80 backdrop-blur-xl flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-zinc-400 hover:text-ink transition md:hidden"
            aria-label="Abrir panel"
          >
            <Menu size={20} />
          </button>
          {sidebarCollapsed && (
            <div className="hidden md:flex items-center gap-1 -ml-1">
              <button
                onClick={toggleSidebarCollapsed}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-ink hover:bg-zinc-800/60 transition"
                title="Expandir panel"
                aria-label="Expandir panel"
              >
                <PanelLeftOpen size={18} />
              </button>
              <button
                onClick={newChat}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-ink hover:bg-zinc-800/60 transition"
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
              <h2 className="text-zinc-100 font-medium text-sm truncate">{activeGpt.name}</h2>
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
          className="flex-1 overflow-y-auto px-4 py-4"
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
            <div className="flex flex-col items-center justify-center h-full py-12 max-w-2xl mx-auto w-full">
              <div className="w-12 h-12 rounded-2xl border border-zinc-800 flex items-center justify-center mb-4">
                <Sparkle className="w-5 h-5 text-zinc-600" />
              </div>
              <h3 className="font-display text-xl font-medium tracking-tight text-ink mb-1">
                ¿Con qué GPT quieres trabajar?
              </h3>
              <p className="text-sm text-zinc-500 mb-7">Elige uno para empezar una conversación nueva.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {gpts.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => selectGpt(g.id)}
                    className="flex items-center gap-3 text-left border border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-900 rounded-2xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 cursor-pointer"
                  >
                    <GptGlyph gpt={g} size="lg" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-100 truncate">{g.name}</div>
                      {g.description && (
                        <div className="text-xs text-zinc-500 truncate">{g.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeGpt && messages.length === 0 && !isLoadingHistory && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 max-w-2xl mx-auto">
              <div className="mb-5">
                <GptGlyph gpt={activeGpt} size="xl" />
              </div>
              <h3 className="font-display text-2xl font-medium tracking-tight text-ink mb-2">{activeGpt.name}</h3>
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
                      className="text-left border border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-900 rounded-2xl px-4 py-3 text-sm text-zinc-300 hover:text-zinc-100 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 cursor-pointer"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.length > 0 && (
            <div className="max-w-3xl mx-auto w-full space-y-5">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const streaming = isLoading && isLast && msg.role === "assistant";
                // Los adjuntos salen del mensaje de usuario anterior, que es el
                // que provocó esta espera. No hace falta pasarlos por
                // runAssistant: ya están en el estado.
                const attachments: ThinkingAttachments =
                  streaming && !msg.content ? countAttachments(messages[i - 1]) : EMPTY_ATTACHMENTS;
                return (
                  <MessageBubble
                    key={i}
                    index={i}
                    message={msg}
                    activeGpt={activeGpt}
                    isLast={isLast}
                    streaming={streaming}
                    thinkingSlot={
                      streaming && !msg.content ? (
                        <ThinkingIndicator
                          phase={phase}
                          attachments={attachments}
                          startedAt={thinkingStartedAt}
                        />
                      ) : undefined
                    }
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

        {showComposer && uploadError && (
          <div className="mx-auto w-full max-w-3xl px-4">
            <div className="mb-2 flex items-start gap-3 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
              <span className="flex-1">{uploadError}</span>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="shrink-0 text-red-400/70 transition hover:text-red-300"
                aria-label="Cerrar aviso"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {showComposer && (
          <Composer
            ref={composerRef}
            isLoading={isLoading}
            isUploading={pendingUploads > 0}
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
