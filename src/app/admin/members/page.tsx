"use client";

import { useState, useEffect, useRef } from "react";
import type { AllowedMember } from "@/lib/types";
import { Upload, UserX, UserCheck, Trash2, Plus } from "lucide-react";
import Papa from "papaparse";

export default function AdminMembersPage() {
  const [members, setMembers] = useState<AllowedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [importMsg, setImportMsg] = useState("");
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    setLoading(true);
    const res = await fetch("/api/admin/members");
    const data = await res.json();
    setMembers(Array.isArray(data) ? data : []);
    setLoading(false);
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
    if (data?.warning) {
      setImportMsg(data.warning);
    } else {
      setImportMsg(
        `Importados: ${data?.imported ?? 0}${data?.revoked ? ` · revocados: ${data.revoked}` : ""}.`
      );
    }
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Miembros</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {activeCount} activos de {members.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition"
          >
            <Plus size={16} /> Agregar
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition"
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

      {/* Resumen de métricas */}
      {members.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-500">Miembros</div>
            <div className="text-xl font-bold text-white mt-0.5">{members.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-500">Activos</div>
            <div className="text-xl font-bold text-green-400 mt-0.5">{activeCount}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-500">LTV total</div>
            <div className="text-xl font-bold text-white mt-0.5">{fmtMoney(totalLtv)}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-500">Por tier</div>
            <div className="text-xs text-gray-300 mt-1 space-y-0.5">
              {Object.entries(tierCounts).map(([t, n]) => (
                <div key={t} className="flex justify-between">
                  <span className="capitalize">{t}</span>
                  <span className="text-gray-500">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Agregar miembro individual */}
      {showAddForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-6">
          <h3 className="text-white font-semibold mb-4">Agregar miembro</h3>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="email@ejemplo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
            <input
              type="text"
              placeholder="Nombre (opcional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
            <button
              onClick={addSingle}
              disabled={!newEmail}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition"
            >
              Agregar
            </button>
          </div>
        </div>
      )}

      {/* Preview de importación CSV */}
      {preview && (
        <div className="bg-gray-900 border border-yellow-600/30 rounded-2xl p-5 mb-6">
          <h3 className="text-white font-semibold mb-2">
            Vista previa — {preview.length} miembros detectados
          </h3>
          <p className="text-gray-400 text-sm mb-2">
            Los emails ya existentes serán actualizados, los nuevos serán creados.
          </p>
          <p className="text-amber-400/90 text-xs mb-4">
            ⚠️ Sincronización: los miembros importados antes por CSV que NO estén en este archivo
            serán <strong>revocados</strong> (se asume que dejaron Skool). Las altas manuales no se tocan.
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
            {preview.slice(0, 20).map((m, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
                <span className="text-gray-500 w-5 text-right">{i + 1}</span>
                <span>{m.email}</span>
                {m.full_name && <span className="text-gray-500">— {m.full_name}</span>}
              </div>
            ))}
            {preview.length > 20 && (
              <p className="text-gray-500 text-sm">... y {preview.length - 20} más</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={confirmImport}
              disabled={importing}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition"
            >
              {importing ? "Importando..." : `Confirmar import (${preview.length})`}
            </button>
            <button
              onClick={() => setPreview(null)}
              className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition"
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
        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm mb-4"
      />

      {/* Lista */}
      {loading ? (
        <div className="text-gray-400 text-center py-12">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">👥</div>
          <p>No hay miembros. Importa un CSV de Skool o agrega uno manualmente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <div
              key={member.id}
              className={`bg-gray-900 border rounded-2xl px-5 py-3.5 flex items-center gap-4 ${
                member.is_active ? "border-gray-800" : "border-gray-800 opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{member.email}</div>
                {member.full_name && (
                  <div className="text-gray-400 text-xs mt-0.5">{member.full_name}</div>
                )}
              </div>
              {member.tier && (
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-violet-500/10 text-violet-300 capitalize hidden sm:inline">
                  {member.tier}
                </span>
              )}
              {member.ltv != null && (
                <span className="text-xs text-gray-400 tabular-nums hidden sm:inline" title="Lifetime value">
                  {fmtMoney(member.ltv)}
                </span>
              )}
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  member.is_active
                    ? "bg-green-900/30 text-green-400"
                    : "bg-gray-700 text-gray-500"
                }`}
              >
                {member.is_active ? "Activo" : "Revocado"}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleActive(member)}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition"
                  title={member.is_active ? "Revocar acceso" : "Restaurar acceso"}
                >
                  {member.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
                <button
                  onClick={() => deleteMember(member)}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-gray-800 transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
