"use client";

import { useState, useEffect, useRef } from "react";
import type { AllowedMember, WebhookEvent } from "@/lib/types";
import { Upload, UserX, UserCheck, Trash2, Plus, Download } from "lucide-react";
import Papa from "papaparse";

export default function AdminMembersPage() {
  const [members, setMembers] = useState<AllowedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
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
  }, []);

  async function loadMembers() {
    setLoading(true);
    const res = await fetch("/api/admin/members");
    const data = await res.json();
    setMembers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function loadWebhookEvents() {
    const res = await fetch("/api/admin/webhook-events");
    const data = await res.json();
    setWebhookEvents(Array.isArray(data) ? data : []);
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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Miembros</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {activeCount} activos de {members.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition"
          >
            <Plus size={16} /> Agregar
          </button>
          <button
            onClick={exportCsv}
            disabled={members.length === 0}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition"
          >
            <Download size={16} /> Exportar CSV
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold rounded-xl px-4 py-2.5 text-sm transition"
          >
            <Upload size={16} /> Importar CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
          />
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 flex items-start justify-between gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm rounded-xl px-4 py-3">
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg("")} className="text-amber-300/70 hover:text-white flex-shrink-0">
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
              className="text-red-300/70 hover:text-white text-xs"
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
                    className="text-zinc-400 hover:text-white underline underline-offset-2"
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
              onClick={addSingle}
              disabled={!newEmail}
              className="bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-900 font-semibold rounded-xl px-5 py-2.5 text-sm transition"
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
              onClick={confirmImport}
              disabled={importing}
              className="bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-900 font-semibold rounded-xl px-5 py-2.5 text-sm transition"
            >
              {importing ? "Importando..." : `Confirmar import (${preview.length})`}
            </button>
            <button
              onClick={() => setPreview(null)}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition"
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">👥</div>
          <p>No hay miembros. Importa un CSV de Skool o agrega uno manualmente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <div
              key={member.id}
              className={`bg-zinc-900 border rounded-2xl px-5 py-3.5 flex items-center gap-4 ${
                member.is_active ? "border-zinc-800" : "border-zinc-800 opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{member.email}</div>
                {member.full_name && (
                  <div className="text-zinc-400 text-xs mt-0.5">{member.full_name}</div>
                )}
              </div>
              {member.tier && (
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-zinc-800 text-zinc-300 capitalize hidden sm:inline">
                  {member.tier}
                </span>
              )}
              {member.ltv != null && (
                <span className="text-xs text-zinc-400 tabular-nums hidden sm:inline" title="Lifetime value">
                  {fmtMoney(member.ltv)}
                </span>
              )}
              <input
                type="number"
                min={0}
                defaultValue={member.monthly_message_limit ?? ""}
                onBlur={(e) => updateQuota(member, e.target.value)}
                placeholder="∞"
                title="Límite mensual de mensajes (vacío = usa el default global de Ajustes)"
                className="hidden md:block w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  member.is_active
                    ? "bg-green-900/30 text-green-400"
                    : "bg-zinc-700 text-zinc-500"
                }`}
              >
                {member.is_active ? "Activo" : "Revocado"}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleActive(member)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                  title={member.is_active ? "Revocar acceso" : "Restaurar acceso"}
                >
                  {member.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
                <button
                  onClick={() => deleteMember(member)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
