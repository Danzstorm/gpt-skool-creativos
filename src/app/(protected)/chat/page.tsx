import { createClient } from "@/lib/supabase/server";
import type { Gpt, Project, ThreadSummary } from "@/lib/types";
import UnifiedChat from "@/components/UnifiedChat";

interface Props {
  searchParams: Promise<{ c?: string; gpt?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const { c: threadId, gpt: gptId } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // GPTs disponibles + conversaciones del usuario + sus proyectos + su perfil
  // (nombre/admin para el footer del sidebar), en paralelo.
  //
  // Los proyectos viajan con el render, no en un fetch posterior: el sidebar
  // agrupa por `project_id` contra la lista de proyectos que tiene en mano, y
  // mientras esa lista está vacía TODOS los chats se pintan sueltos y ninguna
  // carpeta existe. Cargarlos después convertía cada entrada a /chat en un
  // parpadeo con los proyectos vacíos.
  const [{ data: gpts }, { data: threads }, { data: projects }, { data: profile }] =
    await Promise.all([
      supabase.from("gpts_public").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("threads")
        .select("id, title, gpt_id, project_id, created_at, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("projects")
        .select("id, name, instructions, created_at, updated_at")
        .order("updated_at", { ascending: false }),
      user
        ? supabase.from("profiles").select("full_name, is_admin, theme").eq("id", user.id).single()
        : Promise.resolve({ data: null }),
    ]);

  return (
    <UnifiedChat
      key={threadId ?? gptId ?? "new"}
      gpts={(gpts as Gpt[]) ?? []}
      threads={(threads as ThreadSummary[]) ?? []}
      initialProjects={(projects as Project[]) ?? []}
      initialThreadId={threadId ?? null}
      initialGptId={gptId ?? null}
      // Sin key de Gemini el video no se puede describir: la UI no lo ofrece y
      // /api/upload/sign lo rechaza antes de firmar la subida.
      videoEnabled={!!process.env.GEMINI_API_KEY}
      profile={{
        fullName: profile?.full_name ?? null,
        email: user?.email ?? null,
        isAdmin: profile?.is_admin ?? false,
        theme: profile?.theme ?? "violeta",
      }}
    />
  );
}
