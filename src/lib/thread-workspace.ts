import type { Project, ThreadSummary } from "./types";

export function assignThreadProject(
  threads: ThreadSummary[],
  threadId: string,
  projectId: string | null
): ThreadSummary[] {
  return threads.map((t) => (t.id === threadId ? { ...t, project_id: projectId } : t));
}

export function assignThreadsToProject(
  threads: ThreadSummary[],
  threadIds: Iterable<string>,
  projectId: string | null
): ThreadSummary[] {
  const moved = threadIds instanceof Set ? threadIds : new Set(threadIds);
  return threads.map((t) => (moved.has(t.id) ? { ...t, project_id: projectId } : t));
}

export function unassignProjectThreads(
  threads: ThreadSummary[],
  projectId: string
): ThreadSummary[] {
  return threads.map((t) => (t.project_id === projectId ? { ...t, project_id: null } : t));
}

export function renameThreadInList(
  threads: ThreadSummary[],
  id: string,
  title: string
): ThreadSummary[] {
  return threads.map((t) => (t.id === id ? { ...t, title } : t));
}

export function renameProjectInList(projects: Project[], id: string, name: string): Project[] {
  return projects.map((p) => (p.id === id ? { ...p, name } : p));
}

export function applyThreadTitle(
  threads: ThreadSummary[],
  threadId: string,
  title: string
): ThreadSummary[] {
  return renameThreadInList(threads, threadId, title);
}

export function prependThread(
  threads: ThreadSummary[],
  thread: ThreadSummary
): ThreadSummary[] {
  return [thread, ...threads];
}

export function removeThread(threads: ThreadSummary[], id: string): ThreadSummary[] {
  return threads.filter((t) => t.id !== id);
}

/**
 * Título optimista + preview + el hilo activo sube al tope.
 * Si el id no está en la lista, se deja igual (no debería pasar).
 */
export function bumpThreadAfterSend(
  threads: ThreadSummary[],
  threadId: string,
  messageLabel: string,
  nowIso = new Date().toISOString()
): ThreadSummary[] {
  const updated = threads.map((t) =>
    t.id === threadId
      ? {
          ...t,
          title: t.title === "Nueva conversación" ? messageLabel.slice(0, 40) : t.title,
          last_message_preview: messageLabel.slice(0, 80),
          updated_at: nowIso,
        }
      : t
  );
  const active = updated.find((t) => t.id === threadId);
  return active ? [active, ...updated.filter((t) => t.id !== threadId)] : updated;
}

export function chatListUrl(params: string): string {
  return `/chat${params}`;
}
