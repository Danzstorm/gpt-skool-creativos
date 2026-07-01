"use client";

import { useState, useEffect } from "react";
import type { GptWithAssistantId } from "@/lib/types";
import { Plus, Pencil, Trash2, Eye, EyeOff, X } from "lucide-react";

const CATEGORIES = ["General", "Imágenes", "Marketing", "Copywriting", "Diseño", "Ventas", "Productividad", "Educación"];
const MODELS = ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"];

const DEFAULT_FORM = {
  name: "",
  description: "",
  category: "General",
  system_prompt: "",
  model: "gpt-4.1",
  tools_enabled: { file_search: true, code_interpreter: false },
  vision_enabled: true,
  conversation_starters: [] as string[],
  sort_order: 0,
};

export default function AdminGptsPage() {
  const [gpts, setGpts] = useState<GptWithAssistantId[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
      model: "gpt-4.1",
      tools_enabled: gpt.tools_enabled,
      vision_enabled: gpt.vision_enabled,
      conversation_starters: gpt.conversation_starters ?? [],
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
        model: full.model ?? "gpt-4.1",
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">GPTs</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition"
        >
          <Plus size={16} /> Nuevo GPT
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-5">
                {editingId ? "Editar GPT" : "Nuevo GPT"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Categoría</label>
                    <input
                      list="categorias"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="General"
                      className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <datalist id="categorias">
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Modelo</label>
                    <select
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    >
                      {MODELS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Orden</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    System Prompt {editingId && <span className="text-gray-500">(dejar vacío = no cambiar)</span>}
                    {!editingId && <span className="text-red-400"> *</span>}
                  </label>
                  <textarea
                    value={form.system_prompt}
                    onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                    required={!editingId}
                    rows={6}
                    placeholder="Eres un asistente de marketing experto en..."
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-none font-mono"
                  />
                </div>

                <p className="text-xs text-gray-500 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5">
                  Todos los GPTs incluyen las mismas capacidades: lectura de archivos, intérprete de
                  código y visión (imágenes). No es necesario configurarlo.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Sugerencias de inicio{" "}
                    <span className="text-gray-500">(botones clicables en la pantalla del GPT)</span>
                  </label>
                  <div className="space-y-2">
                    {form.conversation_starters.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={s}
                          onChange={(e) => updateStarter(i, e.target.value)}
                          placeholder="Ej: Crea el character sheet de una mujer de 30 años..."
                          className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeStarter(i)}
                          className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-gray-800 transition flex-shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {form.conversation_starters.length < 6 && (
                      <button
                        type="button"
                        onClick={addStarter}
                        className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition"
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
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition"
                  >
                    {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear GPT"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition"
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
        <div className="text-gray-400 text-center py-12">Cargando...</div>
      ) : gpts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">🤖</div>
          <p>No hay GPTs. Crea el primero.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gpts.map((gpt) => (
            <div
              key={gpt.id}
              className={`bg-gray-900 border rounded-2xl p-5 flex items-center gap-4 ${
                gpt.is_active ? "border-gray-800" : "border-gray-800 opacity-60"
              }`}
            >
              <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                ✦
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold truncate">{gpt.name}</h3>
                  <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">
                    {gpt.category}
                  </span>
                  {!gpt.is_active && (
                    <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
                      Inactivo
                    </span>
                  )}
                </div>
                {gpt.description && (
                  <p className="text-gray-400 text-sm mt-0.5 truncate">{gpt.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleActive(gpt)}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition"
                  title={gpt.is_active ? "Desactivar" : "Activar"}
                >
                  {gpt.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => openEdit(gpt)}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => deleteGpt(gpt)}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-gray-800 transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
