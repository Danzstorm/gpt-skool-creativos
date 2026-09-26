"use client";

import { useState, useEffect, useRef } from "react";
import type { AllowedMember, WebhookEvent, AuthEvent } from "@/lib/types";
// `History` se importa con alias: el nombre choca con el tipo global History del DOM.
import { Trash2, Download, History as HistoryIcon } from "lucide-react";
import Papa from "papaparse";
import { AdminHeaderActions } from "@/components/admin/AdminChrome";
import {
  adminActionClass,
  adminAvatarClass,
  adminPanelClass,
  adminPrimaryClass,
  adminStatClass,
  adminStatusClass,
  adminTdClass,
  adminThClass,
  initialsOf,
} from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

// Los valores crudos de auth_events son para grep; acá se leen de un vistazo.
const AUTH_EVENT_LABELS: Record<string, { text: string; tone: string }> = {
  login_ok: { text: "Entró", tone: adminStatusClass.active },
  login_rejected_not_member: { text: "No está en la lista", tone: adminStatusClass.pending },
  login_rejected_revoked: { text: "Revocado", tone: adminStatusClass.expired },
  login_rejected_email_mismatch: { text: "Otro correo", tone: adminStatusClass.pending },
  callback_error: { text: "Error de acceso", tone: adminStatusClass.expired },
  signout_user: { text: "Cerró sesión", tone: adminStatusClass.neutral },
  signout_gate_revoked: { text: "Expulsado", tone: adminStatusClass.expired },
  session_expired: { text: "Sesión caducada", tone: adminStatusClass.neutral },
};

// Estados del prototipo de Martin: activo, pendiente (con acceso pero nunca
// entró) y sin membresía (acceso retirado).
type MemberStatus = "active" | "pending" | "revoked";
type StatusFilter = "all" | MemberStatus;
const STATUS: Record<MemberStatus, { text: string; tone: string }> = {
  active: { text: "Activo", tone: adminStatusClass.active },
  pending: { text: "Pendiente", tone: adminStatusClass.pending },
  revoked: { text: "Sin membresía", tone: adminStatusClass.expired },
};
function memberStatus(m: AllowedMember): MemberStatus {
  if (!m.is_active) return "revoked";
  return m.has_logged_in ? "active" : "pending";
}

// Con ~1000 miembros, pintar todas las filas de una vez dejaba la página en
// decenas de miles de px; se muestran de a tandas.
const PAGE_SIZE = 50;
const fieldClass =
  "min-w-0 rounded-[8px] border border-solid border-[#ffffff10] bg-[#161619] px-4 py-[13px] text-[13px] text-[#cfcfd7] placeholder:text-[#6f6f78] focus:border-[#ffffff2a] focus:outline-none";
const thPad = "px-[22px] max-[650px]:px-[14px]";
const tdPad = "px-[22px] py-[19px] max-[650px]:p-[14px]";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activityRef = useRef<HTMLElement>(null);

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

  const pendingCount = members.filter((m) => m.is_active && !m.has_logged_in).length;
  const revokedCount = members.length - activeCount;
  const tierLine = Object.entries(tierCounts)
    .map(([t, n]) => `${t} ${n}`)
    .join(" · ");
  const statusCounts = { all: members.length, active: activeCount - pendingCount, pending: pendingCount, revoked: revokedCount };
  const byStatus = filtered.filter((m) => statusFilter === "all" || memberStatus(m) === statusFilter);
  const shown = byStatus.slice(0, visible);

  return (
    <div>
      <AdminHeaderActions>
        <button type="button" className={adminActionClass} onClick={() => fileInputRef.current?.click()}>
          Importar CSV
        </button>
        <button
          type="button"
          className={cn(adminActionClass, "inline-flex items-center gap-1.5 disabled:opacity-40")}
          onClick={exportCsv}
          disabled={members.length === 0}
        >
          <Download size={14} /> Exportar CSV
        </button>
        <button type="button" className={adminPrimaryClass} onClick={() => setShowAddForm(!showAddForm)}>
          ＋ Añadir miembro
        </button>
      </AdminHeaderActions>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleCsvFile(e.target.files[0]);
          e.target.value = "";
        }}
      />

      {importMsg && (
        <div className={cn(adminPanelClass, "mb-5 flex items-start justify-between gap-3 px-[22px] py-4 text-[13px] text-[#e6c568]")}>
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg("")} className={adminActionClass} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {/* Transparencia post-import: quién quedó revocado, por si el export de Skool
          vino incompleto y hay que restaurar a alguien vigente manualmente. */}
      {revokedAfterImport.length > 0 && (
        <div className={cn(adminPanelClass, "mb-5 px-[22px] py-4")}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] text-[#c3a0ac]">{revokedAfterImport.length} miembro(s) revocado(s) en este import</p>
            <button onClick={() => setRevokedAfterImport([])} className={adminActionClass} aria-label="Cerrar aviso">
              ✕
            </button>
          </div>
          {members
            .filter((m) => revokedAfterImport.includes(m.email))
            .map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1 text-[12px] text-[#b6b6bf]">
                <span>{m.email}</span>
                <button onClick={() => reactivate(m)} className={adminActionClass}>
                  Dar acceso
                </button>
              </div>
            ))}
        </div>
      )}

      {members.length > 0 && (
        <div className="mb-8 grid grid-cols-4 gap-[14px] max-[900px]:grid-cols-2">
          {[
            { label: "Miembros", value: members.length, hint: `LTV total ${fmtMoney(totalLtv)}` },
            { label: "Accesos activos", value: activeCount, hint: tierLine, capitalize: true },
            { label: "Sin membresía", value: revokedCount, hint: "Acceso retirado" },
            { label: "Pendientes", value: pendingCount, hint: "Con acceso, nunca entraron" },
          ].map((s) => (
            <div key={s.label} className={adminStatClass}>
              <span className="block text-[12px] leading-[1.5] text-[#9999a2]">{s.label}</span>
              <strong className="mt-[14px] block text-[30px] font-normal">{s.value}</strong>
              <small
                className={cn("mt-[10px] block truncate text-[10px] leading-[1.6] text-[#74747f]", "capitalize" in s && "capitalize")}
                title={s.hint}
              >
                {s.hint}
              </small>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className={cn(adminPanelClass, "mb-5")}>
          <h2 className="mb-4 text-[16px]">Añadir miembro</h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={cn(fieldClass, "min-w-[200px] flex-1")}
            />
            <input
              type="text"
              placeholder="Nombre (opcional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={cn(fieldClass, "min-w-[200px] flex-1")}
            />
            <button
              type="button"
              onClick={addSingle}
              disabled={!newEmail}
              className={cn(adminPrimaryClass, "disabled:opacity-50")}
            >
              Añadir
            </button>
          </div>
        </div>
      )}

      {/* Preview de importación CSV: diff real contra lo que ya hay en la DB */}
      {preview && (
        <div className={cn(adminPanelClass, "mb-5")}>
          <h2 className="mb-4 text-[16px]">Revisar importación · {preview.length} miembros en el archivo</h2>
          <div className="mb-4 grid grid-cols-3 gap-[10px]">
            {[
              { label: "Nuevos", value: newCount, tone: "text-[#7ed8a4]" },
              { label: "Sin cambios o actualizados", value: updateCount, tone: "text-[#eeeef2]" },
              { label: "Accesos a retirar", value: toRevoke.length, tone: "text-[#c3a0ac]" },
            ].map((s) => (
              <div key={s.label} className={adminStatClass}>
                <span className="block text-[12px] leading-[1.5] text-[#9999a2]">{s.label}</span>
                <strong className={cn("mt-[10px] block text-[24px] font-normal", s.tone)}>{s.value}</strong>
              </div>
            ))}
          </div>

          {partialImportWarning ? (
            <p className="mb-4 text-[12px] leading-[1.6] text-[#c3a0ac]">
              Este archivo trae muchas menos filas que los miembros activos de Skool ({preview.length} contra{" "}
              {skoolActive.length}). Parece un export parcial: al confirmar no se retira el acceso a nadie. Sube el
              export completo para aplicar bajas.
            </p>
          ) : (
            <p className="mb-4 text-[12px] leading-[1.6] text-[#e6c568]">
              Los {toRevoke.length} miembros importados antes por CSV que no están en este archivo perderán el acceso
              (se asume que dejaron Skool). Las altas manuales no se tocan.
            </p>
          )}

          {toRevoke.length > 0 && !partialImportWarning && (
            <details className="mb-4">
              <summary className="cursor-pointer text-[12px] text-[#c3a0ac]">Ver quiénes pierden el acceso ({toRevoke.length})</summary>
              <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto">
                {toRevoke.map((m) => (
                  <div key={m.id} className="text-[12px] text-[#92929e]">
                    {m.email}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="mb-4 max-h-48 space-y-1 overflow-y-auto">
            {preview.slice(0, 20).map((m, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px] text-[#b6b6bf]">
                <span className="w-5 text-right text-[#686873]">{i + 1}</span>
                <span>{m.email}</span>
                {m.full_name && <span className="text-[#777781]">· {m.full_name}</span>}
                {!existingByEmail.has(m.email) && (
                  <span className={cn(adminStatusClass.base, adminStatusClass.active, "px-2 py-0.5 text-[10px]")}>nuevo</span>
                )}
              </div>
            ))}
            {preview.length > 20 && <p className="text-[12px] text-[#686873]">… y {preview.length - 20} más</p>}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={confirmImport}
              disabled={importing}
              className={cn(adminPrimaryClass, "disabled:opacity-50")}
            >
              {importing ? "Importando..." : `Confirmar importación (${preview.length})`}
            </button>
            <button type="button" onClick={() => setPreview(null)} className={adminActionClass}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-[16px] border border-solid border-[#ffffff10] bg-[#0e0e10]">
        <div className="flex items-center gap-3 p-[22px] max-[900px]:flex-wrap">
          <h2 className="mr-auto shrink-0 whitespace-nowrap text-[16px] max-[900px]:w-full">Miembros</h2>
          <input
            type="text"
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar miembros"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className={cn(fieldClass, "min-w-[180px] max-w-[600px] flex-[1_1_340px] max-[650px]:max-w-none max-[650px]:min-w-0 max-[650px]:basis-full")}
          />
          <select
            aria-label="Filtrar acceso"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setVisible(PAGE_SIZE);
            }}
            className={cn(fieldClass, "shrink-0 p-[11px] text-[12px]")}
          >
            <option value="all">Todos los estados ({statusCounts.all})</option>
            <option value="active">Activo ({statusCounts.active})</option>
            <option value="pending">Pendiente ({statusCounts.pending})</option>
            <option value="revoked">Sin membresía ({statusCounts.revoked})</option>
          </select>
        </div>

        {loading ? (
          <p className="border-t border-solid border-t-[#ffffff08] px-[22px] py-12 text-center text-[13px] text-[#777781]">Cargando…</p>
        ) : loadError ? (
          <div className="border-t border-solid border-t-[#ffffff08] px-[22px] py-12 text-center text-[13px] text-[#e6c568]">
            <p>No se pudieron cargar los miembros. Los datos siguen intactos.</p>
            <button onClick={loadMembers} className={cn(adminActionClass, "mt-3")}>
              Reintentar
            </button>
          </div>
        ) : byStatus.length === 0 ? (
          <p className="border-t border-solid border-t-[#ffffff08] px-[22px] py-12 text-center text-[13px] text-[#777781]">
            {members.length === 0
              ? "No hay miembros. Importa un CSV de Skool o añade uno manualmente."
              : "Nadie coincide con la búsqueda."}
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left max-[650px]:table-fixed">
              <thead>
                <tr>
                  <th className={cn(adminThClass, thPad)}>Miembro</th>
                  <th className={cn(adminThClass, thPad, "max-[650px]:hidden")}>Acceso</th>
                  <th className={cn(adminThClass, thPad, "max-[800px]:hidden")}>Cupo</th>
                  <th className={cn(adminThClass, thPad, "max-[650px]:w-[124px]")}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((member) => {
                  const status = memberStatus(member);
                  return (
                    <tr key={member.id}>
                      <td className={cn(adminTdClass, tdPad)}>
                        <div className="flex items-center gap-3">
                          <span className={adminAvatarClass}>{initialsOf(member.full_name, member.email)}</span>
                          <div className="min-w-0">
                            <div className="truncate">{member.full_name || member.email}</div>
                            {member.full_name && (
                              <small className="mt-[5px] block truncate text-[11px] text-[#777781]">{member.email}</small>
                            )}
                            {/* Móvil: la columna Acceso se oculta y el estado va aquí. */}
                            <span className={cn(adminStatusClass.base, STATUS[status].tone, "mt-2 hidden max-[650px]:inline-block")}>
                              {STATUS[status].text}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className={cn(adminTdClass, tdPad, "max-[650px]:hidden")}>
                        <span className={cn(adminStatusClass.base, STATUS[status].tone)}>{STATUS[status].text}</span>
                        {(member.tier || member.ltv != null) && (
                          <small className="mt-[6px] block text-[10px] capitalize text-[#686873]">
                            {[member.tier, member.ltv != null ? fmtMoney(member.ltv) : null].filter(Boolean).join(" · ")}
                          </small>
                        )}
                      </td>
                      <td className={cn(adminTdClass, tdPad, "max-[800px]:hidden")}>
                        <input
                          type="number"
                          min={0}
                          defaultValue={member.monthly_message_limit ?? ""}
                          onBlur={(e) => updateQuota(member, e.target.value)}
                          placeholder="∞"
                          aria-label={`Límite mensual de ${member.email}`}
                          title="Límite mensual de mensajes (vacío = usa el valor de Ajustes)"
                          className={cn(fieldClass, "w-16 px-2 py-[7px] text-center text-[12px]")}
                        />
                      </td>
                      <td className={cn(adminTdClass, tdPad)}>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => toggleActive(member)} className={adminActionClass}>
                            {member.is_active ? "Retirar acceso" : "Dar acceso"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAuthFilter(member.email);
                              loadAuthEvents(member.email);
                              activityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            title="Ver su historial de accesos"
                            aria-label={`Historial de ${member.email}`}
                            className={cn(adminActionClass, "max-[650px]:hidden")}
                          >
                            <HistoryIcon size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMember(member)}
                            title="Eliminar de la lista"
                            aria-label={`Eliminar a ${member.email}`}
                            className={cn(adminActionClass, "hover:text-[#c3a0ac] max-[650px]:hidden")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-solid border-t-[#ffffff08] px-[22px] py-[17px] text-[11px] text-[#777781]">
          <span>Altas: Zapier · Bajas: conciliación por CSV</span>
          <button type="button" className={adminActionClass} onClick={() => fileInputRef.current?.click()}>
            Revisar importación
          </button>
          {byStatus.length > shown.length && (
            <span className="ml-auto flex items-center gap-2">
              Mostrando {shown.length} de {byStatus.length}
              <button type="button" className={adminActionClass} onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Mostrar más
              </button>
            </span>
          )}
        </div>
      </section>

      {/* Historial de accesos: responde "¿por qué se salió X?" sin tener que
          leer los logs crudos de GoTrue. Cada entrada, rechazo y cierre de
          sesión queda registrado con su motivo. */}
      <section ref={activityRef} className="mt-8 scroll-mt-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-[16px]">
            Actividad reciente {authFilter && <span className="text-[#777781]">· {authFilter}</span>}
          </h2>
          {authFilter && (
            <button
              onClick={() => {
                setAuthFilter("");
                loadAuthEvents();
              }}
              className={adminActionClass}
            >
              Ver todos
            </button>
          )}
        </div>
        {authEvents.length === 0 ? (
          <p className="border-b border-solid border-b-[#ffffff08] py-3 text-[12px] text-[#777781]">
            Los cambios de acceso aparecerán aquí.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {authEvents.map((ev) => {
              const label = AUTH_EVENT_LABELS[ev.event] ?? { text: ev.event, tone: adminStatusClass.neutral };
              return (
                <p
                  key={ev.id}
                  className="flex items-center gap-3 border-b border-solid border-b-[#ffffff08] py-3 text-[12px] max-[650px]:flex-wrap"
                >
                  <span className={cn(adminStatusClass.base, "px-2 py-[3px] text-[10px]", label.tone)}>{label.text}</span>
                  <span className="min-w-0 flex-1 truncate text-[#b6b6bf]">{ev.email ?? "—"}</span>
                  {ev.reason && (
                    <span className="max-w-[240px] truncate text-[11px] text-[#686873] max-[800px]:hidden" title={ev.reason}>
                      {ev.reason}
                    </span>
                  )}
                  <time className="shrink-0 text-[11px] text-[#777781]">
                    {new Date(ev.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
                  </time>
                </p>
              );
            })}
          </div>
        )}
      </section>

      {/* Auditoría de integración: confirma que Zapier/Skool realmente está
          llegando al webhook, y con qué resultado. */}
      {webhookEvents.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-5 text-[16px]">Actividad de integración (Zapier/Skool)</h2>
          <div className="max-h-80 overflow-y-auto">
            {webhookEvents.map((ev) => (
              <p
                key={ev.id}
                className="flex items-center gap-3 border-b border-solid border-b-[#ffffff08] py-3 text-[12px] max-[650px]:flex-wrap"
              >
                <span
                  className={cn(
                    adminStatusClass.base,
                    "px-2 py-[3px] text-[10px]",
                    ev.success ? adminStatusClass.active : adminStatusClass.expired
                  )}
                >
                  {ev.success ? "OK" : "Error"}
                </span>
                <span className="w-24 shrink-0 text-[#686873]">{ev.source}</span>
                <span className="shrink-0 text-[#92929e]">{ev.action ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[#b6b6bf]">{ev.email ?? "—"}</span>
                {ev.error && <span className="max-w-[200px] truncate text-[#c3a0ac]">{ev.error}</span>}
                <time className="shrink-0 text-[11px] text-[#777781]">
                  {new Date(ev.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
                </time>
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
