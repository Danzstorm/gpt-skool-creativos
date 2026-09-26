"use client";

import { useState, useEffect } from "react";
import type { AppSettings, Profile } from "@/lib/types";
import {
  adminActionClass,
  adminAvatarClass,
  adminPanelClass,
  adminPrimaryClass,
  adminStatusClass,
  initialsOf,
} from "@/components/admin/admin-ui";
import { cn, humanDisplayName } from "@/lib/utils";

// Campos y textos del panel "Marca y comunidad" del prototipo de Martin.
const labelClass = "grid gap-[10px] text-[12px] text-[#9999a5]";
const inputClass =
  "w-full min-w-0 rounded-[8px] border border-solid border-[#ffffff12] bg-[#17171a] p-3 text-[12px] text-[#dddde5] placeholder:text-[#6f6f78] focus:border-[#ffffff2a] focus:outline-none";
const noteClass = "mt-5 mb-3 text-[12px] leading-[1.8] text-[#777781]";

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
    try {
      const res = await fetch("/api/admin/admins");
      const data = await res.json().catch(() => []);
      setAdmins(Array.isArray(data) ? data : []);
    } catch {
      setAdmins([]);
    } finally {
      setLoading(false);
    }
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
        text: `${email.trim()} aún no ha iniciado sesión. Ya tiene acceso habilitado y queda admin automáticamente la primera vez que entre — no hace falta que vuelvas aquí.`,
        kind: "warn",
      });
      setEmail("");
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

  const msgTone =
    msg?.kind === "ok" ? "text-[#7ed8a4]" : msg?.kind === "warn" ? "text-[#e6c568]" : "text-[#c3a0ac]";

  return (
    <section className={cn(adminPanelClass, "mt-5")}>
      <h2 className="text-[16px]">Administradores</h2>
      <p className={noteClass}>
        Separa los permisos de administración del acceso como miembro. La persona debe haber iniciado sesión al
        menos una vez antes de recibir este rol.
      </p>

      <form onSubmit={addAdmin} className="flex flex-wrap gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          aria-label="Correo del nuevo administrador"
          className={cn(inputClass, "max-w-[420px] flex-1 basis-[240px]")}
        />
        <button type="submit" disabled={submitting || !email.trim()} className={cn(adminPrimaryClass, "disabled:opacity-50")}>
          Hacer admin
        </button>
      </form>

      {msg && <p className={cn("mt-3 text-[12px] leading-[1.6]", msgTone)}>{msg.text}</p>}

      {loading ? (
        <p className={noteClass}>Cargando…</p>
      ) : (
        <div className="mt-2">
          {admins.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 border-b border-solid border-b-[#ffffff08] py-[19px] text-[12px] text-[#b6b6bf] last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* Google a veces guarda el correo como nombre: humanDisplayName lo descarta. */}
                <span className={adminAvatarClass}>{initialsOf(humanDisplayName(a.full_name), a.email ?? "")}</span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-[#eeeef2]">{humanDisplayName(a.full_name) || a.email}</div>
                  {humanDisplayName(a.full_name) && (
                    <small className="mt-[5px] block truncate text-[11px] text-[#777781]">{a.email}</small>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn(adminStatusClass.base, adminStatusClass.neutral, "max-[650px]:hidden")}>Administrador</span>
                <button type="button" onClick={() => revoke(a)} className={adminActionClass} title="Quitar admin">
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminSettingsPage() {
  const [form, setForm] = useState<AppSettings>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Si la carga inicial falla, el formulario quedaba en blanco — indistinguible
  // de "aún no se configuró nada". El admin podía rellenar un solo campo,
  // guardar, y el PATCH salía con community_name/skool_url/support_email
  // vacíos, borrando la marca de la plataforma para los 600 miembros. Ahora el
  // formulario no se muestra (ni se puede guardar) hasta que la carga real
  // haya funcionado.
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        setForm({
          community_name: data.community_name ?? "",
          logo_url: data.logo_url ?? "",
          skool_url: data.skool_url ?? "",
          support_email: data.support_email ?? "",
          default_monthly_message_limit: data.default_monthly_message_limit,
        });
        setLoadError(false);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "No se pudieron guardar los ajustes");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudieron guardar los ajustes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-[13px] text-[#777781]">Cargando…</p>;
  }

  if (loadError) {
    return (
      <div className={cn(adminPanelClass, "text-center text-[13px] text-[#e6c568]")}>
        <p>No se pudieron cargar los ajustes. La configuración actual no se perdió.</p>
        <button onClick={() => window.location.reload()} className={cn(adminActionClass, "mt-3")}>
          Reintentar
        </button>
      </div>
    );
  }

  const field = (key: "community_name" | "skool_url" | "support_email" | "logo_url") => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div>
      <form onSubmit={handleSubmit} className={adminPanelClass}>
        <h2 className="text-[16px]">Marca y comunidad</h2>
        <div className="mt-6 grid grid-cols-2 gap-[22px] max-[700px]:grid-cols-1">
          <label className={labelClass}>
            Nombre de comunidad
            <input required placeholder="Creativos" className={inputClass} {...field("community_name")} />
          </label>
          <label className={labelClass}>
            Enlace de Skool
            <input type="url" placeholder="https://www.skool.com/tu-comunidad" className={inputClass} {...field("skool_url")} />
          </label>
          <label className={labelClass}>
            Correo de soporte
            <input type="email" placeholder="soporte@tudominio.com" className={inputClass} {...field("support_email")} />
          </label>
          <label className={labelClass}>
            Mensajes por mes
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
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Logo (URL)
            <input type="url" placeholder="https://…" className={inputClass} {...field("logo_url")} />
          </label>
        </div>
        <p className={noteClass}>
          El límite global se aplica salvo que el miembro tenga uno individual (editable en Miembros). El nombre y el
          enlace de Skool se usan en el login y en la vista sin acceso.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={cn(adminPrimaryClass, "disabled:opacity-50")}>
            {saving ? "Guardando…" : "Guardar ajustes"}
          </button>
          <span role="status" className="text-[12px]">
            {saved && <span className="text-[#7ed8a4]">Guardado.</span>}
            {saveError && <span className="text-[#c3a0ac]">{saveError}</span>}
          </span>
        </div>
      </form>

      <AdminsSection />
    </div>
  );
}
