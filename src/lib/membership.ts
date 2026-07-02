import { createServiceClient } from "@/lib/supabase/server";

/**
 * Verdadero si el email está en allowed_members y activo.
 * Fuente única de verdad del gate de acceso (magic link y OAuth).
 */
export async function isAllowedMember(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const service = createServiceClient();
  const { data } = await service
    .from("allowed_members")
    .select("is_active")
    .eq("email", email.toLowerCase().trim())
    .single();
  return !!data?.is_active;
}
