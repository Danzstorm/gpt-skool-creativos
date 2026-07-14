"use client";

import { useCallback, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { consumeSSE } from "@/lib/stream-client";
import { useDismissable } from "@/lib/useDismissable";
import { cn } from "@/lib/utils";

interface Props {
  gptId: string;
  gptName: string;
  onClose: () => void;
}

interface TestMessage {
  role: "user" | "assistant";
  content: string;
}

// Chat efímero para que el admin pruebe un GPT (activo o borrador) antes de
// publicarlo a los alumnos. Se pierde al cerrar el modal — no escribe en
// threads/messages reales.
export default function GptTestModal({ gptId, gptName, onClose }: Props) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const panelRef = useDismissable<HTMLDivElement>(!isLoading, onClose);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/gpts/${gptId}/test-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: conversationIdRef.current }),
      });
      const convId = res.headers.get("x-conversation-id");
      if (convId) conversationIdRef.current = convId;
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Error al probar el GPT");
      }
      await consumeSSE(res, (token) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + token,
          };
          return updated;
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al probar el GPT";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: msg };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [gptId, input, isLoading]);

  return (
    <div className="modal-backdrop fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        className="modal-panel w-full max-w-lg h-[70vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-800/80">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Probar: {gptName}</h2>
            <p className="text-xs text-zinc-500">Conversación de prueba — no se guarda</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-8">
              Escribe un mensaje para probar el system prompt y modelo actuales.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-zinc-700 text-white rounded-br-sm"
                    : "bg-zinc-800/80 text-zinc-100 rounded-bl-sm border border-zinc-700/50"
                )}
              >
                {m.content || (m.role === "assistant" && isLoading ? "···" : "")}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-800/80 p-3 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Mensaje de prueba... (Enter para enviar)"
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500 max-h-24"
          />
          <button
            onClick={send}
            disabled={isLoading || !input.trim()}
            className="bg-zinc-100 hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded-full p-2 flex-shrink-0 transition"
            aria-label="Enviar"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
