import { useCallback, useMemo, useState } from "react";
import type { Project, ThreadSummary } from "@/lib/types";
import {
  applyThreadTitle as applyThreadTitleInList,
  assignThreadProject,
  assignThreadsToProject,
  bumpThreadAfterSend as bumpThreadInList,
  chatListUrl,
  prependThread,
  removeThread,
  renameProjectInList,
  renameThreadInList,
  unassignProjectThreads,
} from "@/lib/thread-workspace";

export type UseThreadWorkspaceOptions = {
  threads: ThreadSummary[];
  initialProjects: Project[];
  initialThreadId?: string | null;
  initialGptId?: string | null;
  closeSidebar: () => void;
  openProject: (id: string) => void;
  clearSearch: () => void;
};

function pushUrl(params: string) {
  window.history.replaceState(null, "", chatListUrl(params));
}

export function useThreadWorkspace({
  threads,
  initialProjects,
  initialThreadId,
  initialGptId,
  closeSidebar,
  openProject,
  clearSearch,
}: UseThreadWorkspaceOptions) {
  const [threadList, setThreadList] = useState<ThreadSummary[]>(threads);
  const initialThread = initialThreadId ? threads.find((t) => t.id === initialThreadId) : null;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThread?.id ?? null);
  const [activeGptId, setActiveGptId] = useState<string | null>(
    initialThread?.gpt_id ?? initialGptId ?? null
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [projectRenameValue, setProjectRenameValue] = useState("");
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

  const pendingProject = useMemo(
    () => (pendingProjectId ? projects.find((p) => p.id === pendingProjectId) : undefined),
    [pendingProjectId, projects]
  );

  const selectGpt = useCallback(
    (gptId: string) => {
      closeSidebar();
      setActiveGptId(gptId);
      setActiveThreadId(null);
      pushUrl(`?gpt=${gptId}`);
    },
    [closeSidebar]
  );

  const selectThread = useCallback(
    (t: ThreadSummary, isLoadingHistory: boolean): boolean => {
      if (t.id === activeThreadId || isLoadingHistory) return false;
      closeSidebar();
      setPendingProjectId(null);
      setActiveThreadId(t.id);
      setActiveGptId(t.gpt_id);
      pushUrl(`?c=${t.id}`);
      return true;
    },
    [activeThreadId, closeSidebar]
  );

  const newChat = useCallback(() => {
    closeSidebar();
    setPendingProjectId(null);
    setActiveThreadId(null);
    setActiveGptId(null);
    pushUrl("");
  }, [closeSidebar]);

  const newChatInProject = useCallback(
    (projectId: string) => {
      closeSidebar();
      setPendingProjectId(projectId);
      setActiveThreadId(null);
      setActiveGptId(null);
      pushUrl("");
    },
    [closeSidebar]
  );

  const startRename = useCallback((t: ThreadSummary) => {
    setRenamingId(t.id);
    // Vacío como el prototipo: submit vacío / Escape conserva el título.
    setRenameValue("");
  }, []);
  const cancelRename = useCallback(() => setRenamingId(null), []);

  const renameThread = useCallback(
    async (id: string) => {
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
        setThreadList((prev) => renameThreadInList(prev, id, updated.title));
      }
    },
    [renameValue, renamingId]
  );

  const deleteThread = useCallback(
    async (id: string, opts?: { confirm?: boolean }): Promise<boolean> => {
      if (opts?.confirm !== false) {
        if (!confirm("¿Borrar esta conversación? Esta acción no se puede deshacer.")) return false;
      }
      await fetch(`/api/threads/${id}`, { method: "DELETE" });
      setThreadList((prev) => removeThread(prev, id));
      if (id === activeThreadId) {
        newChat();
        return true;
      }
      return false;
    },
    [activeThreadId, newChat]
  );

  const moveToProject = useCallback(
    async (threadId: string, projectId: string | null) => {
      const previous = threadList.find((t) => t.id === threadId)?.project_id ?? null;
      if (previous === projectId) return;
      setThreadList((prev) => assignThreadProject(prev, threadId, projectId));
      if (projectId) openProject(projectId);

      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        setThreadList((prev) => assignThreadProject(prev, threadId, previous));
      }
    },
    [threadList, openProject]
  );

  const createProjectWith = useCallback(
    async (threadIds: string[]) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nuevo Proyecto", threadIds }),
      });
      if (!res.ok) return;
      const created: Project & { moved_thread_ids: string[] } = await res.json();

      setProjects((prev) => [created, ...prev]);
      setThreadList((prev) =>
        assignThreadsToProject(prev, created.moved_thread_ids, created.id)
      );
      openProject(created.id);
      clearSearch();
      setRenamingProjectId(created.id);
      setProjectRenameValue("");
    },
    [clearSearch, openProject]
  );

  const startProjectRename = useCallback((project: Project) => {
    setRenamingProjectId(project.id);
    setProjectRenameValue("");
  }, []);
  const cancelProjectRename = useCallback(() => setRenamingProjectId(null), []);

  const renameProject = useCallback(
    async (id: string) => {
      if (renamingProjectId !== id) return;
      const name = projectRenameValue.trim();
      setRenamingProjectId(null);
      if (!name) return;

      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const updated: Project = await res.json();
        setProjects((prev) => renameProjectInList(prev, id, updated.name));
      }
    },
    [projectRenameValue, renamingProjectId]
  );

  const saveProjectInstructions = useCallback(async (id: string, instructions: string) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions }),
    });
    if (!res.ok) throw new Error("No se pudieron guardar las instrucciones");
    const updated: Project = await res.json();
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const deleteProject = useCallback(async (id: string, opts?: { confirm?: boolean }) => {
    if (opts?.confirm !== false) {
      if (
        !confirm(
          "¿Borrar este proyecto? Las conversaciones de adentro no se borran: vuelven a la lista de chats."
        )
      ) {
        return;
      }
    }
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setThreadList((prev) => unassignProjectThreads(prev, id));
    setPendingProjectId((pending) => (pending === id ? null : pending));
  }, []);

  const ensureThread = useCallback(
    async (gptId: string): Promise<string | null> => {
      const createThread = (projectId: string | null) =>
        fetch("/api/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gptId, projectId }),
        });

      let res = await createThread(pendingProjectId);
      if (res.status === 404 && pendingProjectId) res = await createThread(null);
      if (!res.ok) return null;

      const created: ThreadSummary & { title: string } = await res.json();
      const newThread: ThreadSummary = {
        id: created.id,
        title: created.title,
        gpt_id: gptId,
        project_id: created.project_id ?? null,
        created_at: created.created_at,
        updated_at: created.updated_at,
      };
      setActiveThreadId(newThread.id);
      setPendingProjectId(null);
      setThreadList((prev) => prependThread(prev, newThread));
      pushUrl(`?c=${newThread.id}`);
      return newThread.id;
    },
    [pendingProjectId]
  );

  const bumpThreadAfterSend = useCallback((threadId: string, messageLabel: string) => {
    setThreadList((prev) => bumpThreadInList(prev, threadId, messageLabel));
  }, []);

  const applyThreadTitle = useCallback((threadId: string, title: string) => {
    setThreadList((prev) => applyThreadTitleInList(prev, threadId, title));
  }, []);

  return {
    threadList,
    projects,
    activeThreadId,
    activeGptId,
    pendingProjectId,
    pendingProject,
    renamingId,
    renameValue,
    setRenameValue,
    renamingProjectId,
    projectRenameValue,
    setProjectRenameValue,
    selectGpt,
    selectThread,
    newChat,
    newChatInProject,
    startRename,
    cancelRename,
    renameThread,
    deleteThread,
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
  };
}
