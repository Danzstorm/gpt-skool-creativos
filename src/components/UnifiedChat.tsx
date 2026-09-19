"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import type { Gpt, Project, ThreadSummary } from "@/lib/types";
import { Menu, ArrowDown, ChevronDown, Folder, PanelLeftOpen, SquarePen, X } from "lucide-react";
import Orb from "@/components/ui/Orb";
import { firstNameOf } from "@/lib/utils";
import { getGptVisual, LOGO_REST_ACCENT } from "@/lib/gpt-visual";
import GptCatalog from "@/components/GptCatalog";
import GptGlyph from "./chat/GptGlyph";
import GptHero from "./chat/GptHero";
import GptPicker from "./chat/GptPicker";
import ChatSidebar from "./chat/ChatSidebar";
import MessageBubble from "./chat/MessageBubble";
import Composer, { type ComposerHandle } from "./chat/Composer";
import GptChatsModal from "./chat/GptChatsModal";
import ProjectInstructionsModal from "./chat/ProjectInstructionsModal";
import { assignThreadNumbers } from "@/lib/attachment-labels";
import { listMentionCandidates } from "@/lib/attachment-mentions";
import ThinkingIndicator from "./chat/ThinkingIndicator";
import {
  countAttachments,
  EMPTY_ATTACHMENTS,
  type ThinkingAttachments,
} from "@/lib/thinking-phrases";
import { useChatUploads } from "@/hooks/useChatUploads";
import { useChatSidebar } from "@/hooks/useChatSidebar";
import { useChatStream } from "@/hooks/useChatStream";
import { useRecentGpts } from "@/hooks/useRecentGpts";
import { useThreadWorkspace } from "@/hooks/useThreadWorkspace";
import { pickRecentGpts } from "@/lib/gpt-recents";

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
  };
  /** Hay GEMINI_API_KEY en el servidor; sin ella no se ofrece adjuntar video. */
  videoEnabled: boolean;
  /** Marca (app_settings) para el lockup del sidebar. */
  communityName: string;
  /** Aviso ya resuelto (texto) que llega por `?notice=` desde /admin. */
  notice?: string | null;
}

export default function UnifiedChat({
  gpts,
  threads,
  initialProjects,
  initialThreadId,
  initialGptId,
  profile,
  videoEnabled,
  communityName,
  notice: initialNotice,
}: Props) {
  // Solo valor inicial: al elegir un GPT el `?notice=` desaparece de la URL
  // (replaceState) y el banner se cierra a mano, no se re-sincroniza.
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const [gptChatsModalId, setGptChatsModalId] = useState<string | null>(null);
  const [gptPickerOpen, setGptPickerOpen] = useState(false);
  const [heroCatalogExpanded, setHeroCatalogExpanded] = useState(false);
  const [previewAccent, setPreviewAccent] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [instructionsProjectId, setInstructionsProjectId] = useState<string | null>(null);

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

  const { recentIds, touchRecent } = useRecentGpts();

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
  const mentionables = useMemo(
    () => listMentionCandidates(messages, attachedFiles, attachmentNumbers),
    [messages, attachedFiles, attachmentNumbers]
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
      touchRecent(gptId);
      selectGptWorkspace(gptId);
      clearMessages();
      setGptPickerOpen(false);
    },
    [selectGptWorkspace, clearMessages, touchRecent]
  );

  const selectThread = useCallback(
    (t: ThreadSummary) => {
      if (!selectThreadWorkspace(t, isLoadingHistory)) return;
      touchRecent(t.gpt_id);
      void loadHistory(t.id);
    },
    [selectThreadWorkspace, isLoadingHistory, loadHistory, touchRecent]
  );

  const openGptPicker = useCallback(() => setGptPickerOpen(true), []);
  const closeGptPicker = useCallback(() => setGptPickerOpen(false), []);
  const expandHeroCatalog = useCallback(() => setHeroCatalogExpanded(true), []);
  const openAllGpts = useCallback(() => {
    if (activeGptId) {
      setGptPickerOpen(true);
      return;
    }
    if (!heroCatalogExpanded) {
      setHeroCatalogExpanded(true);
      return;
    }
    setGptPickerOpen(true);
  }, [activeGptId, heroCatalogExpanded]);

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
  const selectedAccent = activeGpt
    ? getGptVisual(activeGpt.category, activeGpt.name, activeGpt.description).accentHex
    : null;
  const pageAccent = previewAccent ?? selectedAccent ?? LOGO_REST_ACCENT;
  const showCraftWash = Boolean(
    previewAccent || (activeGpt && messages.length === 0 && !isLoadingHistory)
  );
  const firstName = firstNameOf(profile.fullName);
  const gptChatsModalGpt = gptChatsModalId ? gpts.find((g) => g.id === gptChatsModalId) : null;
  const gptChatsModalThreads = useMemo(
    () => (gptChatsModalId ? threadList.filter((t) => t.gpt_id === gptChatsModalId) : []),
    [threadList, gptChatsModalId]
  );
  const recentGpts = useMemo(
    () => pickRecentGpts(gpts, recentIds, threadList, activeGptId),
    [gpts, recentIds, threadList, activeGptId]
  );

  return (
    <div className="fixed inset-0 flex bg-zinc-950 text-zinc-100">
      <ChatSidebar
        communityName={communityName}
        gpts={gpts}
        recentGpts={recentGpts}
        threadList={threadList}
        projects={projects}
        openProjectIds={openProjectIds}
        activeGptId={activeGptId}
        activeThreadId={activeThreadId}
        sidebarOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        profile={profile}
        chatSearch={chatSearch}
        onSearchChange={onSearchChange}
        onSelectGpt={selectGpt}
        onOpenAllGpts={openAllGpts}
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
        className={`chat-main flex flex-col flex-1 min-w-0 relative${showCraftWash ? " is-accented" : ""}${
          activeGpt && messages.length === 0 && !isLoadingHistory ? " is-gpt-empty" : ""
        }`}
        style={{ "--page-accent": pageAccent } as CSSProperties}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="chat-veil" aria-hidden />
        {isDragging && showComposer && (
          <div className="absolute inset-0 z-10 m-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand/40 bg-brand/10 pointer-events-none">
            <p className="text-sm font-medium text-zinc-100">Suelta imágenes o archivos aquí</p>
          </div>
        )}
        <div className="relative z-[1] flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
          <button
            onClick={openSidebar}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-ink md:hidden"
            aria-label="Abrir panel"
          >
            <Menu size={20} />
          </button>
          {sidebarCollapsed && (
            <div className="hidden md:flex items-center gap-1 -ml-1">
              <Orb size="xs" className="mr-1" />
              <button
                onClick={toggleSidebarCollapsed}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-ink"
                title="Expandir panel"
                aria-label="Expandir panel"
              >
                <PanelLeftOpen size={18} />
              </button>
              <button
                onClick={newChat}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-ink"
                title="Nuevo chat"
                aria-label="Nuevo chat"
              >
                <SquarePen size={18} />
              </button>
            </div>
          )}
          {activeGpt ? (
            <button
              type="button"
              onClick={openGptPicker}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 py-1 -ml-2 transition hover:bg-zinc-900"
              title="Cambiar de GPT"
              aria-haspopup="dialog"
              aria-expanded={gptPickerOpen}
            >
              <GptGlyph gpt={activeGpt} size="sm" />
              <h2 className="text-zinc-100 font-medium text-sm truncate">{activeGpt.name}</h2>
              <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={openGptPicker}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 py-1 -ml-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
              aria-haspopup="dialog"
              aria-expanded={gptPickerOpen}
            >
              <h2 className="text-sm font-medium">Elige un GPT</h2>
              <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
            </button>
          )}
        </div>

        {notice && (
          <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 text-amber-200/70 transition hover:text-amber-100"
              aria-label="Cerrar aviso"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative z-[1] flex-1 overflow-y-auto px-4 py-4"
        >
          {isLoadingHistory && (
            <div className="space-y-4 animate-pulse max-w-2xl mx-auto w-full">
              <div className="flex justify-end">
                <div className="h-10 w-2/5 bg-white/[0.06] rounded-2xl rounded-br-sm" />
              </div>
              <div className="flex justify-start gap-2">
                <div className="w-7 h-7 bg-white/[0.06] rounded-lg flex-shrink-0" />
                <div className="h-20 w-3/5 bg-white/[0.06] rounded-2xl rounded-bl-sm" />
              </div>
            </div>
          )}

          {!activeGpt && !isLoadingHistory && (
            <div className="flex w-full max-w-6xl mx-auto flex-col items-center py-10 md:py-14">
              <div className="relative mb-8 flex flex-col items-center text-center md:mb-10">
                <div className="hero-bloom" aria-hidden />
                <Orb size="xl" className="relative z-[1] mb-6" />
                <p className="mb-3 text-sm leading-normal text-zinc-500">
                  {firstName ? `Bienvenido de nuevo, ${firstName}` : "Bienvenido de nuevo"}
                </p>
                <h1 className="font-display italic text-center text-[1.75rem] font-semibold tracking-tight text-zinc-100 md:text-4xl">
                  ¿Qué vas a crear hoy?
                </h1>
                {pendingProject && <ProjectDestination name={pendingProject.name} />}
              </div>
              <div className="relative z-[1] w-full">
                <GptCatalog
                  gpts={gpts}
                  onSelect={selectGpt}
                  onPreview={setPreviewAccent}
                  expanded={heroCatalogExpanded}
                  onExpand={expandHeroCatalog}
                />
              </div>
            </div>
          )}

          {activeGpt && messages.length === 0 && !isLoadingHistory && (
            <GptHero gpt={activeGpt} onStarter={sendMessage}>
              {/* Sigue visible después de elegir el GPT: el destino recién se
                  aplica al enviar el primer mensaje, y hasta entonces es la
                  única señal de que este chat va a nacer dentro de la carpeta. */}
              {pendingProject && <ProjectDestination name={pendingProject.name} />}
            </GptHero>
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
                    mentions={mentionables}
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

        {showScrollBtn && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-28 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
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
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {showComposer && (
          <div className="relative z-[1]">
          <Composer
            ref={composerRef}
            isLoading={isLoading}
            videoEnabled={videoEnabled}
            mentions={mentionables}
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
          </div>
        )}
      </div>

      {gptPickerOpen && (
        <GptPicker
          gpts={gpts}
          activeGptId={activeGptId}
          onClose={closeGptPicker}
          onSelect={selectGpt}
        />
      )}

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
