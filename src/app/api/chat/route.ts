import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { executeChatTurn } from "@/lib/chat-turn";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = await checkRateLimit(`chat:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  return executeChatTurn({
    request,
    user: { id: user.id, email: user.email! },
    supabase,
  });
}
