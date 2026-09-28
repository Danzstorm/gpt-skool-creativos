import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { executeSelectVersion } from "@/lib/chat-turn";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = await checkRateLimit(`version:${user.id}`, 60, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await params;
  return executeSelectVersion({
    request,
    user: { id: user.id, email: user.email! },
    supabase,
    threadId: id,
  });
}
