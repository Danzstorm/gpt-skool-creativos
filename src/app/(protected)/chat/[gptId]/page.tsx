import { redirect } from "next/navigation";

// Compatibilidad: los enlaces antiguos /chat/<gptId> ahora abren el chat
// unificado con ese GPT preseleccionado.
export default async function LegacyChatRedirect({
  params,
}: {
  params: Promise<{ gptId: string }>;
}) {
  const { gptId } = await params;
  redirect(`/chat?gpt=${gptId}`);
}
