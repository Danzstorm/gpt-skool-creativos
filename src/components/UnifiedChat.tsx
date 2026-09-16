"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Gpt, Project, ThreadSummary, Theme } from "@/lib/types";
import { Menu, ArrowDown, ChevronDown, Folder, PanelLeftOpen, SquarePen } from "lucide-react";
import Sparkle from "./Sparkle";
import GptGlyph from "./chat/GptGlyph";
import ChatSidebar from "./chat/ChatSidebar";
import MessageBubble from "./chat/MessageBubble";
import Composer, { type ComposerHandle } from "./chat/Composer";
import GptChatsModal from "./chat/GptChatsModal";
import ProjectInstructionsModal from "./chat/ProjectInstructionsModal";
import { assignThreadNumbers } from "@/lib/attachment-labels";
import ThinkingIndicator from "./chat/ThinkingIndicator";
import {
  countAttachments,
  EMPTY_ATTACHMENTS,
  type ThinkingAttachments,
} from "@/lib/thinking-phrases";
import { useChatUploads } from "@/hooks/useChatUploads";
import { useChatSidebar } from "@/hooks/useChatSidebar";
import { useChatStream } from "@/hooks/useChatStream";
import { useThreadWorkspace } from "@/hooks/useThreadWorkspace";

/** Cartel del proyecto donde va a nacer el chat que todavía no se creó. */
function ProjectDestination({ name }: { name: string }) {
  return (
    <p className="my-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400">
      <Folder size={12} className="text-zinc-500" />
      Se guardará en <span className="text-zinc-200">{name}</span>
    </p>
  );
}

interface Props {
  gpts: Gpt[];
  threads: ThreadSummary[];
  initialProjects: Project[];
  initialThreadId?: string | null;
  initialGptId?: string | null;
  profile: {
    fullName: string | null;
    email: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
    theme: Theme;
  };
  /** Hay GEMINI_API_KEY en el servidor; sin ella no se ofrece adjuntar video. */
  videoEnabled: boolean;
}

export default function UnifiedChat({
  gpts,
  threads,
  initialProjects,
  initialThreadId,
  initialGptId,
  profile,
  videoEnabled,
}: Props) {
  const [gptChatsModalId, setGptChatsModalId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(profile.theme);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [instructionsProjectId, setInstructionsProjectId] = useState<string | null>(null);

  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    fetch("/api/me/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }, []);

  const {
    sidebarOpen,
    openSidebar,
    closeSidebar,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    openProjectIds,
    toggleProject,
    openProject,
    chatSearch,
    onSearchChange,
    clearSearch,
  } = useChatSidebar();

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);

  const workspace = useThreadWorkspace({
    threads,
    initialProjects,
    initialThreadId,
    initialGptId,
    closeSidebar,
    openProject,
    clearSearch,
  });

  const {
    threadList,
    projects,
    activeThreadId,
    activeGptId,
    pendingProject,
    renamingId,
    renameValue,
    setRenameValue,
    renamingProjectId,
    projectRenameValue,
    setProjectRenameValue,
    selectGpt: selectGptWorkspace,
    selectThread: selectThreadWorkspace,
    newChat: newChatWorkspace,
    newChatInProject: newChatInProjectWorkspace,
    startRename,
    cancelRename,
    renameThread,
    deleteThread: deleteThreadWorkspace,
    moveToProject,
    createProjectWith,
    startProjectRename,
    cancelProjectRename,
    renameProject,
    saveProjectInstructions,
    deleteProject,
    ensureThread,
    bumpThreadAfterSend,
    applyThreadTitle,
  } = workspace;

  const activeGpt = useMemo(() => gpts.find((g) => g.id === activeGptId), [gpts, activeGptId]);
  const {
    attachedFiles,
    pendingUploads,
    uploadingVideo,
    uploadError,
    isDragging,
    dismissUploadError,
    clearAttachments,
    restoreAttachments,
    uploadFiles,
    attachFromLibrary,
    removeAttached,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useChatUploads(!!activeGpt);

  const initialThread = initialThreadId ? threads.find((t) => t.id === initialThreadId) : null;

  const stream = useChatStream({
    activeGptId,
    activeThreadId,
    initialThreadId: initialThread?.id ?? null,
    attachedFiles,
    pendingUploads,
    clearAttachments,
    restoreAttachments,
    composerRef,
    ensureThread,
    bumpThreadAfterSend,
    applyThreadTitle,
    onUserMessageAppended: () => setShowScrollBtn(false),
  });

  const {
    messages,
    isLoadingHistory,
    isLoading,
    phase,
    thinkingStartedAt,
    isEditing,
    loadHistory,
    clearMessages,
    sendMessage,
    regenerate,
    startEdit,
    cancelEdit,
    stopStreaming,
  } = stream;

  const instructionsProject = useMemo(
    () => (instructionsProjectId ? projects.find((p) => p.id === instructionsProjectId) : undefined),
    [instructionsProjectId, projects]
  );

  const attachmentNumbers = useMemo(
    () => assignThreadNumbers(messages, attachedFiles),
    [messages, attachedFiles]
  );

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

  const selectGpt = useCallback(
    (gptId: string) => {
      selectGptWorkspace(gptId);
      clearMessages();
    },
    [selectGptWorkspace, clearMessages]
  );

  const selectThread = useCallback(
    (t: ThreadSummary) => {
      if (!selectThreadWorkspace(t, isLoadingHistory)) return;
      void loadHistory(t.id);
    },
    [selectThreadWorkspace, isLoadingHistory, loadHistory]
  );

  const newChat = useCallback(() => {
    newChatWorkspace();
    clearMessages();
  }, [newChatWorkspace, clearMessages]);

  const newChatInProject = useCallback(
    (projectId: string) => {
      newChatInProjectWorkspace(projectId);
      clearMessages();
    },
    [newChatInProjectWorkspace, clearMessages]
  );

  const deleteThread = useCallback(
    async (id: string) => {
      const clearedActive = await deleteThreadWorkspace(id);
      if (clearedActive) clearMessages();
    },
    [deleteThreadWorkspace, clearMessages]
  );

  const openGptChats = useCallback((gptId: string) => setGptChatsModalId(gptId), []);
  const closeGptChats = useCallback(() => setGptChatsModalId(null), []);

  const copyMessage = useCallback((index: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
  }, []);

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
    // zoom 1.15 = interfaz de chat 15% más grande (pedido del cliente). El tamaño
    // del shell NO usa unidades de viewport: `fixed inset-0` lo ata al área de
    // cliente, que es lo único que todos los motores miden igual. La versión previa
    // (`width: calc(100vw / 1.15); height: calc(100dvh / 1.15)`) rompía por dos
    // lados: `100vw` incluye la barra de scroll (medido en Chromium: shell de 1176px
    // contra 1161px de área útil → desborde horizontal), y en un navegador sin `dvh`
    // la declaración de alto es inválida, cae a `auto` y el shell colapsa a la altura
    // del contenido — la pantalla rota que reportó el cliente. Con inset el zoom sigue
    // aplicando (el bloque contenedor se resuelve en el espacio ya escalado) y, si el
    // navegador no soporta `zoom`, degrada a interfaz sin escalar pero bien armada.
    <div
      className="fixed inset-0 flex bg-zinc-950 text-zinc-100"
      data-theme={theme}
      style={{ zoom: 1.15 }}
    >
      <ChatSidebar
        gpts={gpts}
        threadList={threadList}
        projects={projects}
        openProjectIds={openProjectIds}
        activeGptId={activeGptId}
        activeThreadId={activeThreadId}
        sidebarOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        profile={profile}
        theme={theme}
        onThemeChange={changeTheme}
        chatSearch={chatSearch}
        onSearchChange={onSearchChange}
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
        onToggleProject={toggleProject}
        onNewChatInProject={newChatInProject}
        onEditProjectInstructions={(project) => setInstructionsProjectId(project.id)}
        onDeleteProject={deleteProject}
        onMoveToProject={moveToProject}
        onCreateProjectWith={createProjectWith}
        renamingProjectId={renamingProjectId}
        projectRenameValue={projectRenameValue}
        onProjectRenameValueChange={setProjectRenameValue}
        onStartProjectRename={startProjectRename}
        onSubmitProjectRename={renameProject}
        onCancelProjectRename={cancelProjectRename}
      />

      <div
        className="flex flex-col flex-1 min-w-0 relative"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDragging && showComposer && (
          <div className="absolute inset-0 z-10 bg-zinc-800/40 border-2 border-dashed border-zinc-600 rounded-2xl m-2 flex items-center justify-center pointer-events-none">
            <p className="text-zinc-200 text-sm font-medium">Suelta imágenes o archivos aquí</p>
          </div>
        )}
        <div className="border-b border-zinc-800/80 px-4 py-2.5 bg-zinc-950/80 backdrop-blur-xl flex items-center gap-3">
          <button
            onClick={openSidebar}
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
              {pendingProject && <ProjectDestination name={pendingProject.name} />}
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
              {/* Sigue visible después de elegir el GPT: el destino recién se
                  aplica al enviar el primer mensaje, y hasta entonces es la
                  única señal de que este chat va a nacer dentro de la carpeta. */}
              {pendingProject && <ProjectDestination name={pendingProject.name} />}
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
                const attachments: ThinkingAttachments =
                  streaming && !msg.content ? countAttachments(messages[i - 1]) : EMPTY_ATTACHMENTS;
                return (
                  <MessageBubble
                    key={i}
                    index={i}
                    message={msg}
                    numbers={attachmentNumbers}
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
                onClick={dismissUploadError}
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
            videoEnabled={videoEnabled}
            onLibraryPick={attachFromLibrary}
            numbers={attachmentNumbers}
            activeThreadId={activeThreadId}
            isUploading={pendingUploads > 0}
            isUploadingVideo={uploadingVideo}
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

      {instructionsProject && (
        <ProjectInstructionsModal
          project={instructionsProject}
          onClose={() => setInstructionsProjectId(null)}
          onSave={saveProjectInstructions}
        />
      )}
    </div>
  );
}
