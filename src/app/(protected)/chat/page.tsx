import { createClient } from "@/lib/supabase/server";
import { getAppSettings } from "@/lib/app-settings";
import type { Gpt, Project, ThreadSummary } from "@/lib/types";
import UnifiedChat from "@/components/UnifiedChat";

// Motivos por los que /admin puede devolver a alguien aquí. Sin esto, quien
// intenta entrar al panel aterriza en el chat sin una palabra y no sabe si le
// falta el permiso o si algo se rompió.
const NOTICES: Record<string, string> = {
  profile_pending:
    "Tu perfil todavía se está creando. Vuelve a intentar entrar al panel en unos segundos.",
  not_admin: "No tienes permisos de administrador en esta comunidad.",
};

interface Props {
  searchParams: Promise<{ c?: string; gpt?: string; notice?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const { c: threadId, gpt: gptId, notice } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // GPTs disponibles + conversaciones del usuario + sus proyectos + su perfil
  // (nombre/admin para el footer del sidebar) + marca (nombre de la comunidad
  // para el lockup del sidebar; tiene fallback propio), en paralelo.
  //
  // Los proyectos viajan con el render, no en un fetch posterior: el sidebar
  // agrupa por `project_id` contra la lista de proyectos que tiene en mano, y
  // mientras esa lista está vacía TODOS los chats se pintan sueltos y ninguna
  // carpeta existe. Cargarlos después convertía cada entrada a /chat en un
  // parpadeo con los proyectos vacíos.
  const [{ data: gpts }, { data: threads }, { data: projects }, { data: profile }, settings] =
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
        ? supabase.from("profiles").select("full_name, is_admin").eq("id", user.id).single()
        : Promise.resolve({ data: null }),
      getAppSettings(),
    ]);

  return (
    <UnifiedChat
      key={threadId ?? gptId ?? "new"}
      gpts={(gpts as Gpt[]) ?? []}
      threads={(threads as ThreadSummary[]) ?? []}
      initialProjects={(projects as Project[]) ?? []}
      initialThreadId={threadId ?? null}
      initialGptId={gptId ?? null}
      communityName={settings.community_name}
      notice={notice ? (NOTICES[notice] ?? null) : null}
      // Sin key de Gemini el video no se puede describir: la UI no lo ofrece y
      // /api/upload/sign lo rechaza antes de firmar la subida.
      videoEnabled={!!process.env.GEMINI_API_KEY}
      profile={{
        fullName: profile?.full_name ?? null,
        email: user?.email ?? null,
        // Foto de Google: Supabase la guarda en user_metadata al entrar por
        // OAuth. Se lee de la sesión y no de `profiles` a propósito — la URL
        // caduca/cambia. Puede faltar en cuentas creadas antes, por magic link.
        avatarUrl:
          (user?.user_metadata?.avatar_url as string | undefined) ??
          (user?.user_metadata?.picture as string | undefined) ??
          null,
        isAdmin: profile?.is_admin ?? false,
      }}
    />
  );
}
