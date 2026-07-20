"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { GptWithAssistantId } from "@/lib/types";
import { Plus, Pencil, Trash2, Eye, EyeOff, X, GripVertical, Copy, FlaskConical } from "lucide-react";
import { getGptVisual } from "@/lib/gpt-visual";
import GptTestModal from "@/components/admin/GptTestModal";

const CATEGORIES = ["General", "Imágenes", "Marketing", "Copywriting", "Diseño", "Ventas", "Productividad", "Educación"];
// Ordenados de más económico a más caro por mensaje real (medido, no por precio
// de lista). gpt-5.4-nano cuesta casi lo mismo que gpt-4.1-mini pero es un modelo
// mucho más nuevo; gpt-5.4-mini es el salto de calidad a ~2.5x el costo.
// El reasoning de la familia 5.4 se apaga en chat-stream.ts — sin eso son 10x
// más lentos y caros. Ver `reasoningFor`.
const MODELS = ["gpt-5.4-nano", "gpt-4.1-mini", "gpt-5.4-mini"];

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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [testingGpt, setTestingGpt] = useState<GptWithAssistantId | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    loadGpts();
  }, []);

  async function loadGpts() {
    setLoading(true);
    const res = await fetch("/api/admin/gpts");
    const data = await res.json();
    setGpts(Array.isArray(data) ? data : []);
    setLoading(false);
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
    try {
      const blob = await resizeSquare(file);
      const fd = new FormData();
      fd.append("file", blob, "icon.png");
      const res = await fetch("/api/admin/gpts/icon", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setForm((prev) => ({ ...prev, icon_url: url }));
      }
    } finally {
      setUploadingIcon(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const url = editingId ? `/api/admin/gpts/${editingId}` : "/api/admin/gpts";
    const method = editingId ? "PATCH" : "POST";

    const payload = {
      ...form,
      conversation_starters: form.conversation_starters.map((s) => s.trim()).filter(Boolean),
    };

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    setShowForm(false);
    loadGpts();
  }

  async function toggleActive(gpt: GptWithAssistantId) {
    await fetch(`/api/admin/gpts/${gpt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !gpt.is_active }),
    });
    loadGpts();
  }

  async function deleteGpt(gpt: GptWithAssistantId) {
    if (!confirm(`¿Eliminar "${gpt.name}"? Esta acción no se puede deshacer.`)) return;
    await fetch(`/api/admin/gpts/${gpt.id}`, { method: "DELETE" });
    loadGpts();
  }

  async function duplicateGpt(gpt: GptWithAssistantId) {
    setDuplicatingId(gpt.id);
    try {
      await fetch(`/api/admin/gpts/${gpt.id}/duplicate`, { method: "POST" });
      await loadGpts();
    } finally {
      setDuplicatingId(null);
    }
  }

  // Reordenar por drag & drop: mueve el arrastrado a la posición soltada y
  // persiste el nuevo sort_order de todos (best-effort, en paralelo).
  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...gpts];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    const reordered = next.map((g, i) => ({ ...g, sort_order: i }));
    setGpts(reordered);
    setDragIndex(null);
    reordered.forEach((g, i) => {
      fetch(`/api/admin/gpts/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: i }),
      });
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">GPTs</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold rounded-xl px-4 py-2.5 text-sm transition"
        >
          <Plus size={16} /> Nuevo GPT
        </button>
      </div>

      {showForm && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="modal-panel bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-5">
                {editingId ? "Editar GPT" : "Nuevo GPT"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-xl bg-zinc-800 border border-zinc-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {form.icon_url ? (
                      <Image src={form.icon_url} alt="" fill sizes="64px" className="object-cover" />
                    ) : (
                      (() => {
                        const { Icon } = getGptVisual(form.category);
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
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm resize-none"
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
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
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
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
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
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
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
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
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
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm resize-none font-mono"
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
                          className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
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

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-900 font-semibold rounded-xl px-5 py-2.5 text-sm transition"
                  >
                    {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear GPT"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-400 text-center py-12">Cargando...</div>
      ) : gpts.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">🤖</div>
          <p>No hay GPTs. Crea el primero.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-zinc-600 text-xs -mt-1 mb-1">Arrastra para reordenar el catálogo.</p>
          {gpts.map((gpt, i) => (
            <div
              key={gpt.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => setDragIndex(null)}
              className={`bg-zinc-900 border rounded-2xl p-5 flex items-center gap-4 transition ${
                gpt.is_active ? "border-zinc-800" : "border-zinc-800 opacity-60"
              } ${dragIndex === i ? "opacity-40" : ""}`}
            >
              <span className="text-zinc-600 cursor-grab active:cursor-grabbing flex-shrink-0" title="Arrastrar para reordenar">
                <GripVertical size={16} />
              </span>
              {(() => {
                const { Icon, accentClasses } = getGptVisual(gpt.category);
                return (
                  <div
                    className={`relative w-10 h-10 rounded-xl bg-gradient-to-br border flex items-center justify-center flex-shrink-0 overflow-hidden ${accentClasses}`}
                  >
                    {gpt.icon_url ? (
                      <Image src={gpt.icon_url} alt="" fill sizes="40px" className="object-cover" />
                    ) : (
                      <Icon size={18} />
                    )}
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold truncate">{gpt.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border bg-gradient-to-br ${getGptVisual(gpt.category).accentClasses}`}
                  >
                    {gpt.category}
                  </span>
                  {!gpt.is_active && (
                    <span className="text-xs text-zinc-500 bg-zinc-700 px-2 py-0.5 rounded-full">
                      Inactivo
                    </span>
                  )}
                </div>
                {gpt.description && (
                  <p className="text-zinc-400 text-sm mt-0.5 truncate">{gpt.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setTestingGpt(gpt)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                  title="Probar GPT"
                >
                  <FlaskConical size={16} />
                </button>
                <button
                  onClick={() => duplicateGpt(gpt)}
                  disabled={duplicatingId === gpt.id}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-50"
                  title="Duplicar"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => toggleActive(gpt)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                  title={gpt.is_active ? "Desactivar" : "Activar"}
                >
                  {gpt.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => openEdit(gpt)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => deleteGpt(gpt)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
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
