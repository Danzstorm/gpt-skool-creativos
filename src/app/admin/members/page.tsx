"use client";

import { useState, useEffect, useRef } from "react";
import type { AllowedMember, WebhookEvent, AuthEvent } from "@/lib/types";
// `History` se importa con alias: el nombre choca con el tipo global History del DOM.
import { UserX, UserCheck, Trash2, Download, History as HistoryIcon } from "lucide-react";
import Papa from "papaparse";
import { AdminHeaderActions } from "@/components/admin/AdminChrome";
import { adminActionClass, adminPrimaryClass } from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

// Los valores crudos de auth_events son para grep; acá se leen de un vistazo.
const AUTH_EVENT_LABELS: Record<string, { text: string; tone: string }> = {
  login_ok: { text: "Entró", tone: "bg-green-900/30 text-green-400" },
  login_rejected_not_member: { text: "No está en la lista", tone: "bg-amber-900/30 text-amber-400" },
  login_rejected_revoked: { text: "Revocado", tone: "bg-red-900/30 text-red-400" },
  login_rejected_email_mismatch: { text: "Otro correo", tone: "bg-amber-900/30 text-amber-400" },
  callback_error: { text: "Error de acceso", tone: "bg-red-900/30 text-red-400" },
  signout_user: { text: "Cerró sesión", tone: "bg-zinc-800 text-zinc-400" },
  signout_gate_revoked: { text: "Expulsado", tone: "bg-red-900/30 text-red-400" },
  session_expired: { text: "Sesión caducada", tone: "bg-zinc-800 text-zinc-400" },
};

export default function AdminMembersPage() {
  const [members, setMembers] = useState<AllowedMember[]>([]);
  const [loading, setLoading] = useState(false);
  // Antes un 500 del backend caía en el mismo estado vacío que "no hay
  // miembros todavía", cuyo texto invita a re-importar el CSV — sobre una
  // base que en realidad tenía los 597 miembros intactos. Se distingue para
  // no invitar a una reimportación innecesaria (o destructiva) por un error
  // transitorio de carga.
  const [loadError, setLoadError] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [authEvents, setAuthEvents] = useState<AuthEvent[]>([]);
  const [authFilter, setAuthFilter] = useState("");
  type ParsedMember = {
    email: string;
    full_name: string;
    tier?: string | null;
    ltv?: number | null;
    price?: number | null;
    recurring_interval?: string | null;
    joined_date?: string | null;
    invited_by?: string | null;
  };
  const [preview, setPreview] = useState<ParsedMember[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [revokedAfterImport, setRevokedAfterImport] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMembers();
    loadWebhookEvents();
    loadAuthEvents();
  }, []);

  async function loadMembers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/members");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadWebhookEvents() {
    try {
      const res = await fetch("/api/admin/webhook-events");
      if (!res.ok) return;
      const data = await res.json();
      setWebhookEvents(Array.isArray(data) ? data : []);
    } catch {
      // Auditoría Zapier es secundaria: no tumbar la tabla de miembros.
    }
  }

  async function loadAuthEvents(email?: string) {
    try {
      const qs = email ? `?email=${encodeURIComponent(email)}` : "";
      const res = await fetch(`/api/admin/auth-events${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setAuthEvents(Array.isArray(data) ? data : []);
    } catch {
      // Historial de accesos es secundario: no tumbar la tabla de miembros.
    }
  }

  function exportCsv() {
    const csv = Papa.unparse(
      members.map((m) => ({
        email: m.email,
        full_name: m.full_name ?? "",
        is_active: m.is_active,
        tier: m.tier ?? "",
        ltv: m.ltv ?? "",
        price: m.price ?? "",
        recurring_interval: m.recurring_interval ?? "",
        joined_date: m.joined_date ?? "",
        invited_by: m.invited_by ?? "",
        source: m.source,
        monthly_message_limit: m.monthly_message_limit ?? "",
        added_at: m.added_at,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `miembros-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCsvFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const parsed = rows
          .map((row) => {
            const email =
              row["Email"] || row["email"] || row["EMAIL"] ||
              Object.values(row).find((v) => v?.includes("@")) || "";

            // Skool exporta FirstName + LastName por separado
            const firstName = row["FirstName"] || row["First Name"] || "";
            const lastName = row["LastName"] || row["Last Name"] || "";
            const skoolName = [firstName, lastName].filter(Boolean).join(" ").trim();

            const full_name =
              skoolName ||
              row["Name"] || row["Full Name"] || row["name"] || row["Nombre"] || "";

            const num = (v: string | undefined) => {
              const n = parseFloat((v || "").replace(/[^0-9.-]/g, ""));
              return Number.isFinite(n) ? n : null;
            };
            const dateVal = (v: string | undefined) => {
              const d = v?.trim();
              return d ? d.slice(0, 10) : null; // ISO-ish; Postgres date parsea el prefijo YYYY-MM-DD
            };

            return {
              email: email.trim().toLowerCase(),
              full_name: full_name.trim(),
              tier: row["Tier"]?.trim() || null,
              ltv: num(row["LTV"]),
              price: num(row["Price"]),
              recurring_interval: row["Recurring Interval"]?.trim() || null,
              joined_date: dateVal(row["JoinedDate"] || row["Joined Date"]),
              invited_by: row["Invited By"]?.trim() || null,
            };
          })
          .filter((m) => m.email.includes("@"));
        setPreview(parsed);
      },
    });
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: preview, sync: true }),
    });
    const data = await res.json().catch(() => ({}));
    setImporting(false);
    setPreview(null);
    setRevokedAfterImport(data?.revokedEmails ?? []);
    if (data?.warning) {
      setImportMsg(data.warning);
    } else {
      setImportMsg(
        `Importados: ${data?.imported ?? 0}${data?.revoked ? ` · revocados: ${data.revoked}` : ""}.`
      );
    }
    loadMembers();
  }

  async function reactivate(member: AllowedMember) {
    await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    setRevokedAfterImport((prev) => prev.filter((e) => e !== member.email));
    loadMembers();
  }

  async function addSingle() {
    if (!newEmail) return;
    await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: [{ email: newEmail, full_name: newName }] }),
    });
    setNewEmail("");
    setNewName("");
    setShowAddForm(false);
    loadMembers();
  }

  async function toggleActive(member: AllowedMember) {
    await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !member.is_active }),
    });
    loadMembers();
  }

  async function updateQuota(member: AllowedMember, raw: string) {
    const value = raw.trim() === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    if (value === member.monthly_message_limit) return;
    await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_message_limit: value }),
    });
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, monthly_message_limit: value } : m)));
  }

  async function deleteMember(member: AllowedMember) {
    if (!confirm(`¿Eliminar a ${member.email}?`)) return;
    await fetch(`/api/admin/members/${member.id}`, { method: "DELETE" });
    loadMembers();
  }

  const filtered = members.filter(
    (m) =>
      !search ||
      m.email.includes(search.toLowerCase()) ||
      m.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Diff de la importación: qué cambia realmente si se confirma (mismo criterio
  // que la ruta /api/admin/members al sincronizar).
  const csvEmails = new Set(preview?.map((m) => m.email) ?? []);
  const existingByEmail = new Map(members.map((m) => [m.email, m]));
  const newCount = preview ? preview.filter((m) => !existingByEmail.has(m.email)).length : 0;
  const updateCount = preview ? preview.length - newCount : 0;
  const skoolActive = members.filter((m) => m.source === "skool_csv" && m.is_active);
  const toRevoke = preview ? skoolActive.filter((m) => !csvEmails.has(m.email)) : [];
  const partialImportWarning =
    !!preview && skoolActive.length > 20 && preview.length < skoolActive.length * 0.6;

  const activeCount = members.filter((m) => m.is_active).length;
  const totalLtv = members.reduce((sum, m) => sum + (m.ltv ?? 0), 0);
  const tierCounts = members.reduce<Record<string, number>>((acc, m) => {
    const t = m.tier || "sin tier";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const fmtMoney = (n: number) =>
    n.toLocaleString("es", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div>
      <AdminHeaderActions>
        <button type="button" className={adminPrimaryClass} onClick={() => setShowAddForm(!showAddForm)}>
          ＋ Agregar
        </button>
        <button type="button" className={adminPrimaryClass} onClick={() => fileInputRef.current?.click()}>
          ＋ Importar CSV
        </button>
        <button
          type="button"
          className={adminActionClass}
          onClick={exportCsv}
          disabled={members.length === 0}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </AdminHeaderActions>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
      />
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-zinc-400 text-sm mt-0.5">
          {activeCount} activos de {members.length} total
        </p>
      </div>

      {importMsg && (
        <div className="mb-4 flex items-start justify-between gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm rounded-xl px-4 py-3">
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg("")} className="text-amber-300/70 hover:!text-white flex-shrink-0">
            ✕
          </button>
        </div>
      )}

      {/* Transparencia post-import: quién quedó revocado, por si el export de Skool
          vino incompleto y hay que restaurar a alguien vigente manualmente. */}
      {revokedAfterImport.length > 0 && (
        <div className="mb-4 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-red-300 font-medium">
              {revokedAfterImport.length} miembro(s) revocado(s) en este import
            </p>
            <button
              onClick={() => setRevokedAfterImport([])}
              className="text-red-300/70 hover:!text-white text-xs"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5">
            {members
              .filter((m) => revokedAfterImport.includes(m.email))
              .map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs text-zinc-300">
                  <span>{m.email}</span>
                  <button
                    onClick={() => reactivate(m)}
                    className="!text-zinc-400 hover:!text-white underline underline-offset-2"
                  >
                    Reactivar
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Resumen de métricas */}
      {members.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs text-zinc-500">Miembros</div>
            <div className="text-xl font-bold text-white mt-0.5">{members.length}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs text-zinc-500">Activos</div>
            <div className="text-xl font-bold text-green-400 mt-0.5">{activeCount}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs text-zinc-500">LTV total</div>
            <div className="text-xl font-bold text-white mt-0.5">{fmtMoney(totalLtv)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs text-zinc-500">Por tier</div>
            <div className="text-xs text-zinc-300 mt-1 space-y-0.5">
              {Object.entries(tierCounts).map(([t, n]) => (
                <div key={t} className="flex justify-between">
                  <span className="capitalize">{t}</span>
                  <span className="text-zinc-500">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Agregar miembro individual */}
      {showAddForm && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 mb-6">
          <h3 className="text-white font-semibold mb-4">Agregar miembro</h3>
          <div className="flex flex-wrap gap-3">
            <input
              type="email"
              placeholder="email@ejemplo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
            />
            <input
              type="text"
              placeholder="Nombre (opcional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
            />
            <button
              type="button"
              onClick={addSingle}
              disabled={!newEmail}
              className={cn(adminPrimaryClass, "disabled:opacity-50")}
            >
              Agregar
            </button>
          </div>
        </div>
      )}

      {/* Preview de importación CSV: diff real contra lo que ya hay en la DB */}
      {preview && (
        <div className="bg-zinc-900 border border-yellow-600/30 rounded-2xl p-5 mb-6">
          <h3 className="text-white font-semibold mb-2">
            Vista previa — {preview.length} miembros detectados
          </h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <div className="text-lg font-bold text-green-400">{newCount}</div>
              <div className="text-xs text-zinc-400">nuevos</div>
            </div>
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <div className="text-lg font-bold text-zinc-200">{updateCount}</div>
              <div className="text-xs text-zinc-400">actualizados</div>
            </div>
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <div className="text-lg font-bold text-red-400">{toRevoke.length}</div>
              <div className="text-xs text-zinc-400">a revocar</div>
            </div>
          </div>

          {partialImportWarning ? (
            <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              ⚠️ Este archivo trae muchas menos filas que los miembros activos de Skool actuales
              ({preview.length} vs {skoolActive.length}). Parece un export parcial — al confirmar NO se
              revocará a nadie por seguridad. Sube el export completo si quieres sincronizar bajas.
            </p>
          ) : (
            <p className="text-amber-400/90 text-xs mb-4">
              ⚠️ Sincronización: los {toRevoke.length} miembros importados antes por CSV que no están en
              este archivo serán <strong>revocados</strong> (se asume que dejaron Skool). Las altas
              manuales no se tocan.
            </p>
          )}

          {toRevoke.length > 0 && !partialImportWarning && (
            <details className="mb-4">
              <summary className="text-red-400 text-xs cursor-pointer">
                Ver quiénes serán revocados ({toRevoke.length})
              </summary>
              <div className="max-h-32 overflow-y-auto mt-2 space-y-0.5">
                {toRevoke.map((m) => (
                  <div key={m.id} className="text-xs text-zinc-400">
                    {m.email}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
            {preview.slice(0, 20).map((m, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-zinc-300">
                <span className="text-zinc-500 w-5 text-right">{i + 1}</span>
                <span>{m.email}</span>
                {m.full_name && <span className="text-zinc-500">— {m.full_name}</span>}
                {!existingByEmail.has(m.email) && (
                  <span className="text-[10px] bg-green-500/10 text-green-400 rounded-full px-1.5 py-0.5">
                    nuevo
                  </span>
                )}
              </div>
            ))}
            {preview.length > 20 && (
              <p className="text-zinc-500 text-sm">... y {preview.length - 20} más</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={confirmImport}
              disabled={importing}
              className={cn(adminPrimaryClass, "disabled:opacity-50")}
            >
              {importing ? "Importando..." : `Confirmar import (${preview.length})`}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className={adminActionClass}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar por email o nombre..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm mb-4"
      />

      {/* Lista */}
      {loading ? (
        <div className="text-zinc-400 text-center py-12">Cargando...</div>
      ) : loadError ? (
        <div className="text-center py-16 text-amber-400">
          <div className="text-4xl mb-3">⚠️</div>
          <p>No se pudieron cargar los miembros. Los datos siguen intactos.</p>
          <button
            onClick={loadMembers}
            className="mt-4 text-sm !text-amber-300 underline hover:text-amber-200"
          >
            Reintentar
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">👥</div>
          <p>No hay miembros. Importa un CSV de Skool o agrega uno manualmente.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.14em] text-[#74747f]">
                <th className="px-4 py-3 font-medium">Miembro</th>
                <th className="hidden px-3 py-3 font-medium sm:table-cell">Estado</th>
                <th className="hidden px-3 py-3 font-medium md:table-cell">Cupo</th>
                <th className="px-3 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
          {filtered.map((member) => (
              <tr
                key={member.id}
                className={`border-b border-white/[0.04] last:border-0 ${
                  member.is_active ? "" : "opacity-60"
                }`}
              >
                <td className="px-4 py-3">
                  <div className="truncate text-[#eeeef2]">{member.full_name || member.email}</div>
                  {member.full_name && (
                    <div className="truncate text-xs text-[#8e909c]">{member.email}</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1.5 sm:hidden">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        member.is_active
                          ? "bg-[#39b97418] text-[#7ed8a4]"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {member.is_active ? "Activo" : "Revocado"}
                    </span>
                  </div>
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <div className="flex flex-wrap items-center gap-1.5">
              {member.tier && (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] capitalize text-zinc-300">
                  {member.tier}
                </span>
              )}
              {member.ltv != null && (
                      <span className="text-[11px] tabular-nums text-[#8e909c]" title="Lifetime value">
                  {fmtMoney(member.ltv)}
                </span>
              )}
              {member.is_active && !member.has_logged_in && (
                <span
                        className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[11px] text-amber-400"
                  title="Tiene acceso habilitado pero todavía no ha iniciado sesión ninguna vez"
                >
                  Nunca entró
                </span>
              )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                  member.is_active
                          ? "bg-[#39b97418] text-[#7ed8a4]"
                          : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {member.is_active ? "Activo" : "Revocado"}
              </span>
            </div>
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
              <input
                type="number"
                min={0}
                defaultValue={member.monthly_message_limit ?? ""}
                onBlur={(e) => updateQuota(member, e.target.value)}
                placeholder="∞"
                title="Límite mensual de mensajes (vacío = usa el default global de Ajustes)"
                    className="w-16 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-center text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => {
                  setAuthFilter(member.email);
                  loadAuthEvents(member.email);
                }}
                title="Ver su historial de accesos"
                      className="hidden rounded-xl p-2 !text-zinc-400 transition hover:bg-zinc-800 hover:!text-white sm:block"
              >
                <HistoryIcon size={15} />
              </button>
                <button
                  onClick={() => toggleActive(member)}
                      className="rounded-xl p-2 !text-zinc-400 transition hover:bg-zinc-800 hover:!text-white"
                  title={member.is_active ? "Revocar acceso" : "Restaurar acceso"}
                >
                  {member.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
                <button
                  onClick={() => deleteMember(member)}
                      className="rounded-xl p-2 !text-zinc-400 transition hover:bg-zinc-800 hover:!text-red-400"
                >
                  <Trash2 size={15} />
                </button>
            </div>
                </td>
              </tr>
          ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Historial de accesos: responde "¿por qué se salió X?" sin tener que
          leer los logs crudos de GoTrue. Cada entrada, rechazo y cierre de
          sesión queda registrado con su motivo. */}
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-300">
            Accesos {authFilter && <span className="text-zinc-500">— {authFilter}</span>}
          </h2>
          {authFilter && (
            <button
              onClick={() => {
                setAuthFilter("");
                loadAuthEvents();
              }}
              className="text-xs !text-zinc-400 hover:!text-white transition"
            >
              Ver todos
            </button>
          )}
        </div>
        {authEvents.length === 0 ? (
          <p className="text-xs text-zinc-600">Sin eventos registrados todavía.</p>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/80 max-h-80 overflow-y-auto">
            {authEvents.map((ev) => {
              const label = AUTH_EVENT_LABELS[ev.event] ?? {
                text: ev.event,
                tone: "bg-zinc-800 text-zinc-400",
              };
              return (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${label.tone}`}>
                    {label.text}
                  </span>
                  <span className="text-zinc-300 truncate flex-1">{ev.email ?? "—"}</span>
                  {ev.provider && (
                    <span className="text-zinc-500 flex-shrink-0 hidden sm:inline">{ev.provider}</span>
                  )}
                  {ev.reason && (
                    <span className="text-zinc-500 truncate max-w-[220px] hidden md:inline" title={ev.reason}>
                      {ev.reason}
                    </span>
                  )}
                  <span className="text-zinc-600 flex-shrink-0">
                    {new Date(ev.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Auditoría de integración: confirma que Zapier/Skool realmente está
          llegando al webhook, y con qué resultado. */}
      {webhookEvents.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-300 mb-2">Actividad de integración (Zapier/Skool)</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/80 max-h-80 overflow-y-auto">
            {webhookEvents.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span
                  className={`px-2 py-0.5 rounded-full font-medium ${
                    ev.success ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"
                  }`}
                >
                  {ev.success ? "OK" : "Error"}
                </span>
                <span className="text-zinc-500 w-24 flex-shrink-0">{ev.source}</span>
                <span className="text-zinc-400 flex-shrink-0">{ev.action ?? "—"}</span>
                <span className="text-zinc-300 truncate flex-1">{ev.email ?? "—"}</span>
                {ev.error && <span className="text-red-400/80 truncate max-w-[200px]">{ev.error}</span>}
                <span className="text-zinc-600 flex-shrink-0">
                  {new Date(ev.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
