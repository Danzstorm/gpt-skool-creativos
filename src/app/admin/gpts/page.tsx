"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { GptWithAssistantId } from "@/lib/types";
import { Plus, X } from "lucide-react";
import { getGptVisual } from "@/lib/gpt-visual";
import GptTestModal from "@/components/admin/GptTestModal";
import { AdminHeaderActions } from "@/components/admin/AdminChrome";
import { gptCatalogMetricRows, mapGptCatalogMetrics } from "@/lib/admin-gpt-catalog";
import {
  adminActionClass,
  adminPrimaryClass,
  adminRangeCaptionClass,
  adminSummaryTopClass,
} from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

const gptActionClass =
  "border-none p-0 text-[11px] text-[#9999a5] disabled:cursor-default disabled:opacity-35 enabled:hover:text-[#eeeef2]";

const CATEGORIES = ["General", "Imágenes", "Marketing", "Copywriting", "Diseño", "Ventas", "Productividad", "Educación"];
// Ordenados de más económico a más caro por mensaje real (medido, no por precio
// de lista). gpt-5.4-nano cuesta casi lo mismo que gpt-4.1-mini pero es un modelo
// mucho más nuevo; gpt-5.4-mini es el salto de calidad a ~2.5x el costo.
// El reasoning de la familia 5.x se apaga en chat-stream.ts — sin eso son 10x
// más lentos y caros. Ver `reasoningFor`.
//
// gpt-5.6-luna (agregado 2026-09-04) todavía NO está medido como los otros:
// va por precio de lista nomás, junto a gpt-5.4-nano (mismo tramo de costo).
// Si se usa en producción y se mide su costo/latencia real, mover a su lugar.
const MODELS = ["gpt-5.4-nano", "gpt-5.6-luna", "gpt-4.1-mini", "gpt-5.4-mini"];

const DEFAULT_FORM = {
  name: "",
  description: "",
  category: "General",
  system_prompt: "",
  model: "gpt-4.1-mini",
  tools_enabled: { file_search: true, code_interpreter: false },
  vision_enabled: true,
  conversation_starters: [] as string[],
  icon_url: "" as string,
  author: "" as string,
  sort_order: 0,
};

// Redimensiona una imagen a un cuadrado de 256px en el cliente (sin dependencias)
async function resizeSquare(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png", 0.9));
}

export default function AdminGptsPage() {
  const [gpts, setGpts] = useState<GptWithAssistantId[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [testingGpt, setTestingGpt] = useState<GptWithAssistantId | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  // Distingue "no se pudo cargar" de "no hay GPTs todavía": antes un 500 caía
  // en el mismo estado vacío ("Crea el primero.") que el catálogo realmente
  // vacío, sin ninguna pista de que el catálogo real seguía intacto.
  const [loadError, setLoadError] = useState(false);
  // Errores de mutaciones fuera del modal (activar/desactivar, borrar,
  // duplicar, subir icono, reordenar): antes fallaban en silencio y la UI
  // quedaba mostrando el estado anterior a la acción sin ninguna explicación.
  const [actionError, setActionError] = useState("");
  // Error del modal de crear/editar: si el guardado falla, el modal se queda
  // abierto con lo que el admin ya escribió (system prompts largos) en vez de
  // cerrarse "con éxito" mientras el cambio en realidad no se guardó.
  const [formError, setFormError] = useState("");

  useEffect(() => {
    loadGpts();
  }, []);

  async function loadGpts() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/gpts");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setGpts(Array.isArray(data) ? data : []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  async function openEdit(gpt: GptWithAssistantId) {
    // Prellenar con lo que ya tenemos; el system prompt y model se traen de OpenAI
    setForm({
      name: gpt.name,
      description: gpt.description || "",
      category: gpt.category,
      system_prompt: "",
      model: "gpt-4.1-mini",
      tools_enabled: gpt.tools_enabled,
      vision_enabled: gpt.vision_enabled,
      conversation_starters: gpt.conversation_starters ?? [],
      icon_url: gpt.icon_url ?? "",
      author: gpt.author ?? "",
      sort_order: gpt.sort_order,
    });
    setEditingId(gpt.id);
    setShowForm(true);

    const res = await fetch(`/api/admin/gpts/${gpt.id}`);
    if (res.ok) {
      const full = await res.json();
      setForm((prev) => ({
        ...prev,
        system_prompt: full.system_prompt ?? "",
        model: full.model ?? "gpt-4.1-mini",
        conversation_starters: full.conversation_starters ?? [],
      }));
    }
  }

  function updateStarter(i: number, value: string) {
    setForm((prev) => {
      const next = [...prev.conversation_starters];
      next[i] = value;
      return { ...prev, conversation_starters: next };
    });
  }

  function addStarter() {
    setForm((prev) => ({ ...prev, conversation_starters: [...prev.conversation_starters, ""] }));
  }

  function removeStarter(i: number) {
    setForm((prev) => ({
      ...prev,
      conversation_starters: prev.conversation_starters.filter((_, idx) => idx !== i),
    }));
  }

  async function handleIconUpload(file: File | undefined) {
    if (!file) return;
    setUploadingIcon(true);
    setFormError("");
    try {
      const blob = await resizeSquare(file);
      const fd = new FormData();
      fd.append("file", blob, "icon.png");
      const res = await fetch("/api/admin/gpts/icon", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "No se pudo subir el icono");
      }
      const { url } = await res.json();
      setForm((prev) => ({ ...prev, icon_url: url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo subir el icono");
    } finally {
      setUploadingIcon(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    const url = editingId ? `/api/admin/gpts/${editingId}` : "/api/admin/gpts";
    const method = editingId ? "PATCH" : "POST";

    const payload = {
      ...form,
      conversation_starters: form.conversation_starters.map((s) => s.trim()).filter(Boolean),
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "No se pudo guardar el GPT");
      }
      // El modal solo se cierra si el guardado realmente ocurrió. Antes se
      // cerraba siempre, así que un 500 se veía idéntico a un guardado
      // exitoso — el admin perdía el system prompt que acababa de escribir
      // sin ninguna señal de que algo había fallado.
      setShowForm(false);
      await loadGpts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el GPT");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(gpt: GptWithAssistantId) {
    setActionError("");
    const res = await fetch(`/api/admin/gpts/${gpt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !gpt.is_active }),
    });
    if (!res.ok) {
      setActionError(`No se pudo ${gpt.is_active ? "desactivar" : "activar"} "${gpt.name}".`);
      return;
    }
    loadGpts();
  }

  async function deleteGpt(gpt: GptWithAssistantId) {
    // threads.gpt_id borra en cascada (threads Y sus messages): eliminar un
    // GPT con conversaciones reales borra esas conversaciones para siempre,
    // sin backup (Supabase está en plan free). El confirm() genérico no lo
    // decía. Si hay algo que perder, se avisa la cifra real y se sugiere
    // Duplicar/desactivar como alternativa no destructiva.
    const n = gpt.thread_count ?? 0;
    const warning =
      n > 0
        ? `¿Eliminar "${gpt.name}"? Esto borra PERMANENTEMENTE ${n} ${n === 1 ? "conversación" : "conversaciones"} de miembros con este GPT — sin forma de recuperarlas.\n\nSi solo quieres ocultarlo del catálogo sin perder esas conversaciones, cancela y usa "Desactivar" en vez de eliminar.`
        : `¿Eliminar "${gpt.name}"? Esta acción no se puede deshacer.`;
    if (!confirm(warning)) return;
    setActionError("");
    const res = await fetch(`/api/admin/gpts/${gpt.id}`, { method: "DELETE" });
    if (!res.ok) {
      setActionError(`No se pudo eliminar "${gpt.name}".`);
      return;
    }
    loadGpts();
  }

  async function duplicateGpt(gpt: GptWithAssistantId) {
    setDuplicatingId(gpt.id);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/gpts/${gpt.id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        setActionError(`No se pudo duplicar "${gpt.name}".`);
        return;
      }
      await loadGpts();
    } finally {
      setDuplicatingId(null);
    }
  }

  async function persistOrder(next: GptWithAssistantId[]) {
    const reordered = next.map((g, i) => ({ ...g, sort_order: i }));
    setGpts(reordered);
    setActionError("");
    const results = await Promise.all(
      reordered.map((g, i) =>
        fetch(`/api/admin/gpts/${g.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: i }),
        })
      )
    );
    if (results.some((r) => !r.ok)) {
      setActionError("El nuevo orden no se guardó del todo. Recarga para ver el orden real.");
    }
  }

  async function moveUp(index: number) {
    if (index <= 0) return;
    const gpt = gpts[index];
    setMovingId(gpt.id);
    try {
      const next = [...gpts];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      await persistOrder(next);
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div>
      <AdminHeaderActions>
        <button type="button" className={adminPrimaryClass} onClick={openCreate}>
          ＋ Nuevo GPT
        </button>
      </AdminHeaderActions>

      {showForm && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="modal-panel bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="leading-[calc(1.75/1.25)] text-white">
                {editingId ? "Editar GPT" : "Nuevo GPT"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-xl bg-zinc-800 border border-zinc-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {form.icon_url ? (
                      <Image src={form.icon_url} alt="" fill sizes="64px" className="object-cover" />
                    ) : (
                      (() => {
                        const { Icon } = getGptVisual(form.category, form.name);
                        return <Icon size={26} className="text-zinc-500" />;
                      })()
                    )}
                  </div>
                  <div>
                    <label className="inline-block bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2 cursor-pointer transition">
                      {uploadingIcon ? "Subiendo..." : "Subir icono"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleIconUpload(e.target.files?.[0])}
                      />
                    </label>
                    {form.icon_url && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, icon_url: "" })}
                        className="ml-2 text-zinc-400 hover:text-red-400 text-sm"
                      >
                        Quitar
                      </button>
                    )}
                    <p className="text-xs text-zinc-500 mt-1">Se recorta a cuadrado 256px.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Nombre *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Autor <span className="text-zinc-500">(opcional, se muestra como &ldquo;By {"{autor}"}&rdquo;)</span>
                  </label>
                  <input
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                    placeholder="Ej: Martín Velarde"
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Categoría</label>
                    <input
                      list="categorias"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="General"
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    />
                    <datalist id="categorias">
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Modelo</label>
                    <select
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    >
                      {MODELS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Orden</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    System Prompt {editingId && <span className="text-zinc-500">(dejar vacío = no cambiar)</span>}
                    {!editingId && <span className="text-red-400"> *</span>}
                  </label>
                  <textarea
                    value={form.system_prompt}
                    onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                    required={!editingId}
                    rows={6}
                    placeholder="Eres un asistente de marketing experto en..."
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-none font-mono"
                  />
                </div>

                <p className="text-xs text-zinc-500 bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-2.5">
                  Todos los GPTs incluyen las mismas capacidades: lectura de archivos, intérprete de
                  código y visión (imágenes). No es necesario configurarlo.
                </p>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Sugerencias de inicio{" "}
                    <span className="text-zinc-500">(botones clicables en la pantalla del GPT)</span>
                  </label>
                  <div className="space-y-2">
                    {form.conversation_starters.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={s}
                          onChange={(e) => updateStarter(i, e.target.value)}
                          placeholder="Ej: Crea el character sheet de una mujer de 30 años..."
                          className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                        />
                        <button
                          type="button"
                          onClick={() => removeStarter(i)}
                          className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition flex-shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {form.conversation_starters.length < 6 && (
                      <button
                        type="button"
                        onClick={addStarter}
                        className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition"
                      >
                        <Plus size={14} /> Agregar sugerencia
                      </button>
                    )}
                  </div>
                </div>

                {formError && (
                  <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-2.5 text-red-300 text-sm">
                    {formError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className={cn(adminPrimaryClass, "disabled:opacity-50")}
                  >
                    {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear GPT"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className={adminActionClass}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mb-4 flex items-start gap-3 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-2.5 text-red-300 text-sm">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError("")} className="text-red-400/70 hover:text-red-300">
            ✕
          </button>
        </div>
      )}

      <div className={adminSummaryTopClass}>
        <div>
          GPTs
          <small className={adminRangeCaptionClass}>Uso por herramienta · últimos 30 días</small>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-400 text-center py-12">Cargando...</div>
      ) : loadError ? (
        <div className="text-center py-16 text-amber-400">
          <div className="text-4xl mb-3">⚠️</div>
          <p>No se pudieron cargar los GPTs. El catálogo real sigue intacto.</p>
          <button onClick={loadGpts} className="mt-4 text-sm text-amber-300 underline hover:text-amber-200">
            Reintentar
          </button>
        </div>
      ) : gpts.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">🤖</div>
          <p>No hay GPTs. Crea el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1">
          {gpts.map((gpt, i) => {
            const metrics = mapGptCatalogMetrics({
              usage: gpt.usage_30d ?? null,
              usageAvailable: gpt.usage_30d != null,
            });
            return (
              <article
                key={gpt.id}
                className="rounded-[15px] border border-solid border-[#ffffff10] bg-[#111113] p-[22px]"
              >
                <div className="flex items-center justify-between gap-3 max-[700px]:flex-wrap">
                  <span
                    className={cn(
                      "inline-block rounded-[20px] px-[10px] py-[6px] text-[10px] whitespace-nowrap",
                      gpt.is_active ? "bg-[#9fcbae0c] text-[#a3b8ab]" : "bg-[#ff165e09] text-[#c3a0ac]"
                    )}
                  >
                    {gpt.is_active ? "Activo" : "Inactivo"}
                  </span>
                  <div>
                    <button type="button" className={adminActionClass} onClick={() => openEdit(gpt)}>
                      Editar
                    </button>
                    <button type="button" className={adminActionClass} onClick={() => setTestingGpt(gpt)}>
                      Probar
                    </button>
                  </div>
                </div>
                <h2 className="mt-[22px] mb-3">{gpt.name}</h2>
                <p className="min-h-[44px] text-[12px] leading-[1.8] text-[#858590]">{gpt.description || ""}</p>
                <dl className="mt-[18px] mb-6 grid grid-cols-2 gap-4">
                  {gptCatalogMetricRows(metrics).map((row) => (
                    <div key={row.label}>
                      <dt className="text-[10px] text-[#81818d]">{row.label}</dt>
                      <dd className="mt-[7px] text-[14px] text-[#d5c3d0]">{row.display}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex gap-[14px] border-t border-solid border-t-[#ffffff08] pt-[17px]">
                  <button
                    type="button"
                    className={gptActionClass}
                    onClick={() => duplicateGpt(gpt)}
                    disabled={duplicatingId === gpt.id}
                  >
                    {duplicatingId === gpt.id ? "Duplicando…" : "Duplicar"}
                  </button>
                  <button type="button" className={gptActionClass} onClick={() => toggleActive(gpt)}>
                    {gpt.is_active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    className={gptActionClass}
                    onClick={() => moveUp(i)}
                    disabled={i === 0 || movingId === gpt.id}
                    aria-label={`Subir ${gpt.name}`}
                    title={i === 0 ? "Ya está primero" : "Subir"}
                  >
                    ↑
                  </button>
                  <button type="button" className={gptActionClass} onClick={() => deleteGpt(gpt)}>
                    Eliminar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {testingGpt && (
        <GptTestModal
          gptId={testingGpt.id}
          gptName={testingGpt.name}
          onClose={() => setTestingGpt(null)}
        />
      )}
    </div>
  );
}
