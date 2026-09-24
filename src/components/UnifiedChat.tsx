"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import type { Gpt, Project, ThreadSummary } from "@/lib/types";
import { ArrowDown, Folder, X } from "lucide-react";
import EnergyCanvas from "@/components/ui/EnergyCanvas";
import { cn, firstNameOf } from "@/lib/utils";
import { getGptVisual, LOGO_REST_ACCENT } from "@/lib/gpt-visual";
import ProtoIcon from "./chat/ProtoIcon";
import GptCatalog from "@/components/GptCatalog";
import GptHero from "./chat/GptHero";
import ChatSidebar from "./chat/ChatSidebar";
import MessageBubble from "./chat/MessageBubble";
import Composer, { type ComposerHandle } from "./chat/Composer";
import ProjectInstructionsModal from "./chat/ProjectInstructionsModal";
import { assignThreadNumbers } from "@/lib/attachment-labels";
import { listMentionCandidates } from "@/lib/attachment-mentions";
import ThinkingIndicator from "./chat/ThinkingIndicator";
import {
  PINNED_THREADS_KEY,
  parsePinnedThreadIds,
  togglePinnedThreadId,
} from "@/lib/pinned-threads";
import {
  countAttachments,
  EMPTY_ATTACHMENTS,
  type ThinkingAttachments,
} from "@/lib/thinking-phrases";
import { useChatUploads } from "@/hooks/useChatUploads";
import { useChatSidebar } from "@/hooks/useChatSidebar";
import { useChatStream } from "@/hooks/useChatStream";
import { useThreadWorkspace } from "@/hooks/useThreadWorkspace";
import { pickSidebarGpts } from "@/lib/gpt-recents";

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
  const [previewAccent, setPreviewAccent] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [instructionsProjectId, setInstructionsProjectId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [hiddenThreadIds, setHiddenThreadIds] = useState<string[]>([]);
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>([]);
  const [undo, setUndo] = useState<{
    label: string;
    restore: () => void;
    commit: () => void;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRef = useRef(undo);

  useEffect(() => {
    undoRef.current = undo;
  }, [undo]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPinnedIds(parsePinnedThreadIds(localStorage.getItem(PINNED_THREADS_KEY)));
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
        undoRef.current?.commit();
      }
    };
  }, []);

  const {
    sidebarOpen,
    openSidebar,
    closeSidebar,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
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
    waitForVideoAnalysis,
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
    waitForVideoAnalysis,
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

  const openAllGpts = useCallback(() => {
    newChatWorkspace();
    clearMessages();
  }, [newChatWorkspace, clearMessages]);

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

  const armUndo = useCallback(
    (next: { label: string; restore: () => void; commit: () => void }) => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
        undoRef.current?.commit();
      }
      setUndo(next);
      undoTimer.current = setTimeout(() => {
        next.commit();
        setUndo(null);
        undoTimer.current = null;
      }, 5000);
    },
    []
  );

  const togglePin = useCallback(
    (id: string) => {
      const previous = pinnedIds;
      const next = togglePinnedThreadId(previous, id);
      setPinnedIds(next);
      localStorage.setItem(PINNED_THREADS_KEY, JSON.stringify(next));
      armUndo({
        label: next.includes(id) ? "Chat fijado" : "Chat desfijado",
        restore: () => {
          setPinnedIds(previous);
          localStorage.setItem(PINNED_THREADS_KEY, JSON.stringify(previous));
        },
        commit: () => {},
      });
    },
    [armUndo, pinnedIds]
  );

  const deleteThread = useCallback(
    (id: string) => {
      setHiddenThreadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      if (id === activeThreadId) {
        newChatWorkspace();
        clearMessages();
      }
      armUndo({
        label: "Chat borrado",
        restore: () => setHiddenThreadIds((prev) => prev.filter((hiddenId) => hiddenId !== id)),
        commit: () => {
          void deleteThreadWorkspace(id, { confirm: false });
        },
      });
    },
    [activeThreadId, armUndo, clearMessages, deleteThreadWorkspace, newChatWorkspace]
  );

  const requestDeleteProject = useCallback(
    (id: string) => {
      setHiddenProjectIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      armUndo({
        label: "Proyecto borrado",
        restore: () => setHiddenProjectIds((prev) => prev.filter((hiddenId) => hiddenId !== id)),
        commit: () => {
          void deleteProject(id, { confirm: false });
        },
      });
    },
    [armUndo, deleteProject]
  );

  const cancelUndo = useCallback(() => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    undoRef.current?.restore();
    setUndo(null);
  }, []);

  const copyMessage = useCallback((index: number, content: string) => {
    void navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1300);
  }, []);

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  const showComposer = !!activeGpt;
  const showGptIntro = Boolean(activeGpt && messages.length === 0 && !isLoadingHistory);
  const hasChatMessages = messages.length > 0;
  const chatTitle =
    threadList.find((thread) => thread.id === activeThreadId)?.title || activeGpt?.name || "";
  const selectedAccent = activeGpt
    ? getGptVisual(activeGpt.category, activeGpt.name, activeGpt.description).accentHex
    : null;
  const pageAccent = previewAccent ?? selectedAccent ?? LOGO_REST_ACCENT;
  const firstName = firstNameOf(profile.fullName);
  const visibleProjects = useMemo(
    () => projects.filter((project) => !hiddenProjectIds.includes(project.id)),
    [projects, hiddenProjectIds]
  );
  const visibleThreads = useMemo(
    () =>
      threadList
        .filter((thread) => !hiddenThreadIds.includes(thread.id))
        .map((thread) =>
          thread.project_id && hiddenProjectIds.includes(thread.project_id)
            ? { ...thread, project_id: null }
            : thread
        ),
    [threadList, hiddenThreadIds, hiddenProjectIds]
  );
  const recentGpts = useMemo(
    () => pickSidebarGpts(gpts, activeGptId),
    [gpts, activeGptId]
  );

  return (
    <div
      className="app flex min-h-screen"
    >
      <ChatSidebar
        communityName={communityName}
        gpts={gpts}
        recentGpts={recentGpts}
        threadList={visibleThreads}
        projects={visibleProjects}
        openProjectIds={openProjectIds}
        activeGptId={activeGptId}
        activeThreadId={activeThreadId}
        sidebarOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        sidebarWidth={sidebarWidth}
        onResizeWidth={setSidebarWidth}
        pinnedIds={pinnedIds}
        onTogglePin={togglePin}
        profile={profile}
        chatSearch={chatSearch}
        onSearchChange={onSearchChange}
        onSelectGpt={selectGpt}
        onOpenAllGpts={openAllGpts}
        onSelectThread={selectThread}
        onNewChat={newChat}
        onCloseSidebar={closeSidebar}
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
        onDeleteProject={requestDeleteProject}
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
        className="main flex min-h-screen min-w-0 flex-1 flex-col bg-[#060606]"
        style={{ "--page-accent": pageAccent } as CSSProperties}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div
          className={cn(
            "relative flex h-0 min-h-0 shrink-0 items-center justify-between overflow-visible border-0 bg-transparent px-0 text-xs text-[#aaa] shadow-none",
            // Expandir: el topbar queda height:0 bajo home/chat; subimos stacking
            // y devolvemos pointer-events al control del borde.
            sidebarCollapsed && "relative z-50 !h-0 !min-h-0 overflow-visible pointer-events-none"
          )}
        >
          <button
            type="button"
            className={cn(
              "absolute left-[18px] top-[18px] z-[5] hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-[7px] text-[#9898a0] transition-colors hover:bg-white/[0.03] hover:text-[#eee] motion-reduce:transition-none max-[650px]:flex min-[651px]:left-5 min-[651px]:top-[var(--panel-toggle-top,42px)] min-[651px]:h-[30px] min-[651px]:w-[30px] min-[651px]:text-[#9a9aa4] min-[651px]:hover:bg-transparent min-[651px]:hover:text-[#9a9aa4] [&_svg]:h-[21px] [&_svg]:w-[21px] [&_svg]:shrink-0 min-[651px]:[&_svg]:h-4 min-[651px]:[&_svg]:w-4",
              sidebarOpen && "max-[650px]:!hidden",
              sidebarCollapsed &&
                "!visible !flex !pointer-events-auto !z-[60] [-webkit-text-fill-color:#9a9aa4]"
            )}
            style={
              undefined
            }
            onClick={() => {
              // Martin runtime.js: ≤650 → mobile-open; desktop → toggle collapsed.
              // Antes: si no estaba collapsed llamaba openSidebar() y en desktop
              // el click del borde no devolvía la barra.
              if (window.innerWidth <= 650) {
                if (sidebarOpen) closeSidebar();
                else openSidebar();
              } else {
                toggleSidebarCollapsed();
              }
            }}
            aria-label={sidebarCollapsed ? "Expandir panel" : "Abrir panel"}
          >
            <ProtoIcon name="menu" className="h-4 w-4 shrink-0" />
          </button>
          {hasChatMessages && (
            <div id="breadcrumb" className="hidden">
              <span>{chatTitle}</span>
            </div>
          )}
        </div>

        {isDragging && showComposer && (
          <div className="absolute inset-0 z-10 m-2 flex items-center justify-center rounded-2xl border-2 border-dashed pointer-events-none" style={{ borderColor: "#ba9cff66", background: "#ba9cff14" }}>
            <p className="text-sm font-medium">Suelta imágenes o archivos aquí</p>
          </div>
        )}

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

        {!activeGpt && (
          <div id="homeView" className="workspace">
            <div className="intro relative mb-[35px] h-auto max-h-none shrink-0 overflow-visible pt-[6px] text-center min-[651px]:mb-[58px]">
              {/* Important sizes override the shared legacy .brand-energy rule until the GPT intro is migrated. */}
              <div className="brand-energy gpt-home-energy !relative !mt-[-12px] !mb-[16px] !mx-auto !h-[82px] !w-[82px] !overflow-visible" aria-hidden>
                <EnergyCanvas size={82} speed={0.0009} />
              </div>
              <h1
                className="relative m-0 mb-[15px] bg-none text-[37px] leading-[1.2] font-[300] tracking-[-1.3px] text-[#f1f1f1] [font-family:'Plus_Jakarta_Sans',sans-serif] [-webkit-text-fill-color:#f1f1f1] [background-clip:border-box] [-webkit-background-clip:border-box] min-[651px]:top-[16px]"
              >
                {firstName ? `Bienvenido de nuevo, ${firstName}.` : "Bienvenido de nuevo."}
              </h1>
              <p
                className="relative m-0 bg-none text-[13px] leading-[1.6] font-normal tracking-normal text-[#999] [font-family:var(--font-display),'Plus_Jakarta_Sans',sans-serif] [word-spacing:normal] [-webkit-text-fill-color:#999] max-[650px]:mx-auto max-[650px]:max-w-[260px] min-[651px]:top-[16px]"
              >
                Elige tu asistente creativo para empezar a crear.
              </p>
              {pendingProject && <ProjectDestination name={pendingProject.name} />}
            </div>
            <GptCatalog gpts={gpts} onSelect={selectGpt} onPreview={setPreviewAccent} />
          </div>
        )}

        {activeGpt && (
          <div
            id="chatView"
            className={cn(
              "chat flex w-full !max-w-[940px] min-h-0 flex-1 flex-col overflow-y-auto !px-[38px] !pt-[22px] !pb-0 !relative [scroll-padding-bottom:140px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-[650px]:!px-4 max-[650px]:!pt-4",
              showGptIntro && "justify-center",
              hasChatMessages && "chat-has-messages !overflow-hidden"
            )}
          >
            {showGptIntro && (
              <GptHero gpt={activeGpt} onStarter={sendMessage}>
                {pendingProject && <ProjectDestination name={pendingProject.name} />}
              </GptHero>
            )}

            {!showGptIntro && (
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="messages"
              >
                {hasChatMessages &&
                  messages.map((msg, i) => {
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
                        className={i === 0 ? "mt-auto" : undefined}
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
                <div ref={bottomRef} />
              </div>
            )}

            {showScrollBtn && hasChatMessages && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-28 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                aria-label="Bajar al final"
              >
                <ArrowDown size={16} />
              </button>
            )}

            {showComposer && (
              <div
                className={cn(
                  "chat-dock relative z-[1] w-full shrink-0 overflow-visible !border-0 !bg-transparent !shadow-none",
                  // Martin: con la intro visible el composer lleva 50px debajo.
                  showGptIntro ? "!px-0 !pt-0 !pb-[50px]" : "!p-0"
                )}
              >
                {uploadError && (
                  <div className="mx-auto mb-2 w-full max-w-3xl">
                    <div className="flex items-start gap-3 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
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
                <Composer
                  ref={composerRef}
                  isLoading={isLoading}
                  videoEnabled={videoEnabled}
                  mentions={mentionables}
                  isUploading={pendingUploads > 0 || attachedFiles.some((file) => file.pending)}
                  isUploadingVideo={uploadingVideo}
                  pendingCount={pendingUploads}
                  isEditing={isEditing}
                  onCancelEdit={cancelEdit}
                  attachedFiles={attachedFiles}
                  onFilesSelected={uploadFiles}
                  onRemoveFile={removeAttached}
                  onSend={sendMessage}
                  onStop={stopStreaming}
                  hideDisclaimer={showGptIntro}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={cancelUndo}>
            Deshacer
          </button>
        </div>
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
