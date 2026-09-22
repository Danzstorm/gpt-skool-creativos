import { revalidatePath } from "next/cache";

/** /chat arma el catálogo en el RSC; sin esto un CRUD deja la home con GPTs viejos. */
export function revalidateChatGpts() {
  revalidatePath("/chat");
}
