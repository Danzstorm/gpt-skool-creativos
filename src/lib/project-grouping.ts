import type { Project, ThreadSummary } from "./types";

export interface ProjectGroup {
  project: Project;
  threads: ThreadSummary[];
  // Con búsqueda activa el proyecto se abre solo: un resultado escondido detrás
  // de un chevron plegado es, para quien busca, un resultado que no existe.
  forceOpen: boolean;
}

export interface GroupedThreads {
  groups: ProjectGroup[];
  /** Conversaciones fuera de todo proyecto — la lista "Chats" de siempre. */
  loose: ThreadSummary[];
}

/**
 * Reparte las conversaciones entre sus proyectos y la lista suelta, aplicando
 * la búsqueda del sidebar.
 *
 * Vive fuera del componente porque es la única parte de la sección Proyectos
 * con reglas propias (qué se esconde al buscar, qué se abre solo), y así se
 * puede testear sin montar el sidebar entero.
 */
export function groupThreadsByProject(
  threads: ThreadSummary[],
  projects: Project[],
  query: string,
  gptNameById: Map<string, string>
): GroupedThreads {
  const q = query.trim().toLowerCase();
  const matches = (t: ThreadSummary) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    (gptNameById.get(t.gpt_id)?.toLowerCase().includes(q) ?? false);

  const known = new Set(projects.map((p) => p.id));
  const byProject = new Map<string, ThreadSummary[]>();
  const loose: ThreadSummary[] = [];

  for (const t of threads) {
    // Un project_id que no está en `projects` (proyecto recién borrado en otra
    // pestaña, estado a medio refrescar) mandaría el chat a un grupo que no se
    // pinta: se trata como suelto para que nunca desaparezca del sidebar.
    if (t.project_id && known.has(t.project_id)) {
      const bucket = byProject.get(t.project_id);
      if (bucket) bucket.push(t);
      else byProject.set(t.project_id, [t]);
    } else if (matches(t)) {
      loose.push(t);
    }
  }

  const groups: ProjectGroup[] = [];
  for (const project of projects) {
    const all = byProject.get(project.id) ?? [];
    if (!q) {
      groups.push({ project, threads: all, forceOpen: false });
      continue;
    }
    // Si el nombre del proyecto matchea, la carpeta entera es el resultado: se
    // muestran todos sus chats, no solo los que repiten el término.
    const nameMatches = project.name.toLowerCase().includes(q);
    const found = nameMatches ? all : all.filter(matches);
    if (!nameMatches && found.length === 0) continue;
    groups.push({ project, threads: found, forceOpen: true });
  }

  return { groups, loose };
}
