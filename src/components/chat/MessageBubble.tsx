import { memo } from "react";
import { Copy, Check, RotateCcw, Pencil, Paperclip } from "lucide-react";
import type { Gpt, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import MessageContent from "../MessageContent";
import { imageLabel, type ThreadNumbers } from "@/lib/attachment-labels";
import type { MentionCandidate } from "@/lib/attachment-mentions";
import MentionedText from "./MentionedText";

interface Props {
  message: Message;
  /**
   * Numeración de los adjuntos en el hilo entero — la misma que recibió el
   * modelo. Llega por prop en vez de calcularse acá porque depende de TODA la
   * conversación, y este componente solo ve su propio mensaje.
   */
  numbers: ThreadNumbers;
  mentions: MentionCandidate[];
  index: number;
  activeGpt?: Gpt;
  isLast: boolean;
  streaming: boolean;
  // Qué mostrar mientras la burbuja del asistente sigue vacía. Se recibe ya
  // renderizado en vez de los datos para armarlo: así este componente sigue
  // siendo presentacional y no se entera de fases, contadores ni adjuntos.
  thinkingSlot?: React.ReactNode;
  canRegenerate: boolean;
  canEdit: boolean;
  isCopied: boolean;
  onCopy: (index: number, content: string) => void;
  onRegenerate: () => void;
  onEdit: (index: number) => void;
}

// Patrón ChatGPT: el usuario va en una burbuja alineada a la derecha; el
// asistente NO lleva burbuja ni avatar por mensaje — su contenido fluye como
// texto en la columna (el único "recuadro" es el bloque de código que arma
// MessageContent). Así se gana altura y se quita el ruido del glyph repetido.
function MessageBubble({
  message: msg,
  numbers,
  mentions,
  index,
  isLast,
  streaming,
  thinkingSlot,
  canRegenerate,
  canEdit,
  isCopied,
  onCopy,
  onRegenerate,
  onEdit,
}: Props) {
  const isUser = msg.role === "user";

  const files = msg.files && msg.files.length > 0 && (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {msg.files.map((f, fi) => {
        // La misma etiqueta que ve el usuario en el composer y que el servidor
        // le manda al modelo. Sin esto, la numeración desaparecía al enviar y
        // el usuario perdía la referencia justo cuando iba a usarla para
        // escribir el siguiente mensaje ("en la imagen 2…").
        const position = numbers.images.get(f.openai_file_id) ?? null;
        return f.type === "image" && f.previewUrl ? (
          <div key={fi} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.previewUrl}
              alt={position !== null ? imageLabel(position) : "imagen"}
              className="w-24 h-24 object-cover rounded-lg border border-white/[0.08]"
            />
          </div>
        ) : (
          <span key={fi} className="inline-flex items-center gap-1 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1">
            <Paperclip size={12} className="flex-shrink-0" />
            {f.name}
          </span>
        );
      })}
    </div>
  );

  // Antes exigía msg.content, así que un mensaje que falló sin llegar a
  // generar nada quedaba sin ninguna acción posible — ni siquiera regenerar.
  // El usuario tenía que recargar la página para reintentar.
  const actions = !streaming && (msg.content || msg.error) && (
    <div
      className={cn(
        // En desktop se ocultan con `hidden` (no `opacity-0`) para NO ocupar
        // altura entre mensajes; aparecen al hover. En móvil siempre visibles.
        "flex md:hidden md:group-hover:flex gap-0.5",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {msg.content && (
        <button
          onClick={() => onCopy(index, msg.content)}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] transition"
          title="Copiar"
        >
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
      {!isUser && isLast && canRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] transition"
          title="Regenerar"
        >
          <RotateCcw size={14} />
        </button>
      )}
      {isUser && canEdit && (
        <button
          onClick={() => onEdit(index)}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] transition"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );

  // Asistente: ancho completo de la columna, sin burbuja ni avatar.
  // `msg-in` anima una sola vez por montaje: las keys son índices estables y el
  // streaming muta el texto in place, así que no se re-dispara por token.
  if (!isUser) {
    return (
      <div className="group msg-in">
        {files}
        {msg.content ? (
          <div className="flex items-end text-zinc-100">
            <MessageContent content={msg.content} />
            {streaming && (
              <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 mb-1 rounded-sm animate-pulse" />
            )}
          </div>
        ) : streaming ? (
          // Solo mientras hay streaming activo de verdad. Antes se mostraban
          // sin mirar `streaming`, así que un fallo con contenido vacío dejaba
          // los puntos rebotando para siempre — sin spinner, sin botón de
          // detener y sin ninguna acción disponible más que recargar la página.
          //
          // Los tres puntos quedan de reserva para quien no pase `thinkingSlot`
          // (el chat de prueba del admin). Ojo: `delay-100`/`delay-200` son
          // utilidades de transition-delay, no de animation-delay, así que los
          // tres rebotan sincronizados y se ven como un solo `···` parpadeando.
          (thinkingSlot ?? (
            <span className="inline-flex gap-1 text-zinc-400">
              <span className="animate-bounce delay-0">·</span>
              <span className="animate-bounce delay-100">·</span>
              <span className="animate-bounce delay-200">·</span>
            </span>
          ))
        ) : (
          msg.error && <p className="text-sm text-red-400">{msg.error}</p>
        )}
        {msg.content && msg.error && (
          <p className="mt-1.5 text-sm text-red-400">{msg.error}</p>
        )}
        <div className="mt-1">{actions}</div>
      </div>
    );
  }

  // Usuario: burbuja compacta alineada a la derecha. `msg-in`: misma nota que
  // arriba, una sola animación por montaje.
  return (
    <div className="group msg-in flex justify-end">
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div className="rounded-2xl rounded-br-sm bg-white/[0.06] border border-white/[0.08] text-zinc-100 px-4 py-2.5">
          {files}
          <MentionedText text={msg.content} mentions={mentions} />
        </div>
        {actions}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
