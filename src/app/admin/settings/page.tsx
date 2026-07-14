"use client";

import { useState, useEffect } from "react";
import type { AppSettings, Profile } from "@/lib/types";
import { UserPlus, ShieldOff } from "lucide-react";

const DEFAULT_FORM: AppSettings = {
  community_name: "",
  logo_url: "",
  skool_url: "",
  support_email: "",
  default_monthly_message_limit: null,
};

function AdminsSection() {
  const [admins, setAdmins] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "warn" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/admins");
    const data = await res.json();
    setAdmins(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setMsg(null);
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setMsg({ text: data.error || "No se pudo agregar.", kind: "error" });
      return;
    }
    if (data.status === "pending") {
      setMsg({
        text: `${email.trim()} aún no ha iniciado sesión. Ya tiene acceso habilitado — en cuanto entre una vez a la plataforma, vuelve aquí y agrégalo de nuevo para completar el admin.`,
        kind: "warn",
      });
    } else {
      setMsg({ text: `${email.trim()} ahora es admin.`, kind: "ok" });
      setEmail("");
      load();
    }
  }

  async function revoke(admin: Profile) {
    if (!confirm(`¿Quitar admin a ${admin.email}?`)) return;
    await fetch(`/api/admin/admins/${admin.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-white mb-1">Administradores</h2>
      <p className="text-sm text-zinc-400 mb-4">
        Cualquier admin puede dar acceso de admin a otro correo. La persona necesita iniciar sesión
        al menos una vez antes de poder marcarse como admin.
      </p>

      <form onSubmit={addAdmin} className="flex gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="flex items-center gap-2 bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-900 font-semibold rounded-xl px-4 py-2.5 text-sm transition"
        >
          <UserPlus size={15} /> Hacer admin
        </button>
      </form>

      {msg && (
        <p
          className={`text-xs mb-4 rounded-lg px-3 py-2 border ${
            msg.kind === "ok"
              ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
              : msg.kind === "warn"
                ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
                : "text-red-300 bg-red-500/10 border-red-500/20"
          }`}
        >
          {msg.text}
        </p>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm">Cargando...</div>
      ) : (
        <div className="space-y-2">
          {admins.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-white text-sm truncate">{a.email}</div>
                {a.full_name && <div className="text-zinc-500 text-xs truncate">{a.full_name}</div>}
              </div>
              <button
                onClick={() => revoke(a)}
                className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition flex-shrink-0"
                title="Quitar admin"
              >
                <ShieldOff size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const [form, setForm] = useState<AppSettings>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setForm({
          community_name: data.community_name ?? "",
          logo_url: data.logo_url ?? "",
          skool_url: data.skool_url ?? "",
          support_email: data.support_email ?? "",
          default_monthly_message_limit: data.default_monthly_message_limit,
        });
      }
      setLoading(false);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return <div className="text-zinc-400 text-center py-12">Cargando...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ajustes</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          Marca y configuración general de la plataforma — para replicar esto con otro cliente,
          esto es lo único que cambia.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Nombre de la comunidad</label>
          <input
            value={form.community_name}
            onChange={(e) => setForm({ ...form, community_name: e.target.value })}
            placeholder="Creativos"
            className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Reemplaza el wordmark &ldquo;Creativos&rdquo; en header, landing y login.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Logo URL</label>
          <input
            value={form.logo_url ?? ""}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="https://..."
            className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">URL de la comunidad Skool</label>
          <input
            value={form.skool_url ?? ""}
            onChange={(e) => setForm({ ...form, skool_url: e.target.value })}
            placeholder="https://www.skool.com/tu-comunidad"
            className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Usada en el botón &ldquo;Unirme al Skool&rdquo; de landing/login y en el mensaje de acceso denegado.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email de soporte</label>
          <input
            value={form.support_email ?? ""}
            onChange={(e) => setForm({ ...form, support_email: e.target.value })}
            placeholder="soporte@tudominio.com"
            className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Límite mensual de mensajes por defecto
          </label>
          <input
            type="number"
            min={0}
            value={form.default_monthly_message_limit ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                default_monthly_message_limit: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="Sin límite"
            className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Aplica a todos los miembros salvo que tengan un límite propio (editable en Miembros). Vacío = sin
            límite.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-900 font-semibold rounded-xl px-5 py-2.5 text-sm transition"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          {saved && <span className="text-emerald-400 text-sm">Guardado.</span>}
        </div>
      </form>

      <div className="max-w-xl border-t border-zinc-800 mt-10 pt-8">
        <AdminsSection />
      </div>
    </div>
  );
}
