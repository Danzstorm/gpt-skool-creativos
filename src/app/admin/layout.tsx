import { createClient } from "@/lib/supabase/server";
import { getAppSettings } from "@/lib/app-settings";
import { redirect } from "next/navigation";
import AdminChrome from "@/components/admin/AdminChrome";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/chat?notice=profile_pending");
  if (!profile.is_admin) redirect("/chat?notice=not_admin");

  const settings = await getAppSettings();

  return (
    <AdminChrome communityName={settings.community_name}>
      {children}
    </AdminChrome>
  );
}
