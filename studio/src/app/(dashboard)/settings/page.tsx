"use client";

import { useState } from "react";
import useSWR from "swr";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OperatorSettings {
  id: string; email: string; businessName: string;
  subscriptionTier: string; subscriptionExpiry: string | null;
  isActive: boolean; createdAt: string;
}
interface PaymentKeyStatus {
  hasServerKey: boolean; hasClientKey: boolean;
  serverKeyPreview: string | null; clientKeyPreview: string | null;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_INFO: Record<string, { label: string; color: string; maxBooths: number; priceLabel: string }> = {
  STARTER:    { label: "Starter",    color: "bg-gray-100 text-gray-700",        maxBooths: 3,         priceLabel: "Rp 299.000/bln" },
  PRO:        { label: "Pro",        color: "bg-primary-100 text-primary-800",  maxBooths: 10,        priceLabel: "Rp 699.000/bln" },
  ENTERPRISE: { label: "Enterprise", color: "bg-accent-100 text-accent-700",    maxBooths: 999,       priceLabel: "Custom" },
};
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

const input = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50">
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Profile Form ─────────────────────────────────────────────────────────────

function ProfileForm({ settings, onSaved }: { settings: OperatorSettings; onSaved: () => void }) {
  const [form, setForm]   = useState({ businessName: settings.businessName });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(false);
    try {
      const res  = await fetch("/api/dashboard/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? "Gagal menyimpan");
      setSuccess(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {success && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-green-700 text-sm">✅ Profil berhasil diperbarui</div>}
      {error   && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-red-600 text-sm">{error}</div>}

      <Field label="Nama Bisnis">
        <input required className={input} value={form.businessName}
          onChange={(e) => setForm({ businessName: e.target.value })} />
      </Field>

      <Field label="Email">
        <input disabled className={`${input} bg-gray-50 text-gray-400 cursor-not-allowed`} value={settings.email} />
        <p className="text-xs text-gray-400">Email tidak dapat diubah. Hubungi support jika perlu.</p>
      </Field>

      <button type="submit" disabled={loading}
        className="px-6 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800 disabled:opacity-60">
        {loading ? "Menyimpan…" : "Simpan Profil"}
      </button>
    </form>
  );
}

// ─── Payment Form ─────────────────────────────────────────────────────────────

function PaymentForm({ keyStatus, onSaved }: { keyStatus: PaymentKeyStatus; onSaved: () => void }) {
  const [serverKey, setServerKey] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [removing,  setRemoving]  = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverKey.trim() || !clientKey.trim()) {
      setError("Server Key dan Client Key wajib diisi"); return;
    }
    setLoading(true); setError(null); setSuccess(false);
    try {
      const res  = await fetch("/api/dashboard/settings/payment", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ midtransServerKey: serverKey.trim(), midtransClientKey: clientKey.trim() }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? "Gagal menyimpan");
      setSuccess(true);
      setServerKey(""); setClientKey("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Hapus Midtrans keys? Transaksi booth akan pakai key Fremio global.")) return;
    setRemoving(true); setError(null); setSuccess(false);
    try {
      const res  = await fetch("/api/dashboard/settings/payment", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ midtransServerKey: null, midtransClientKey: null }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? "Gagal menghapus");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-md">
      {/* Status badge */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
        keyStatus.hasServerKey
          ? "bg-green-50 border-green-200 text-green-700"
          : "bg-amber-50 border-amber-200 text-amber-700"
      }`}>
        <span>{keyStatus.hasServerKey ? "✅" : "⚠️"}</span>
        <span>
          {keyStatus.hasServerKey
            ? "Menggunakan Midtrans Anda — uang langsung masuk ke rekening Anda"
            : "Menggunakan Midtrans Fremio (default) — uang ditampung sementara"}
        </span>
      </div>

      {/* Preview key tersimpan */}
      {keyStatus.hasServerKey && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Key tersimpan</p>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Server Key</span>
            <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{keyStatus.serverKeyPreview}</code>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Client Key</span>
            <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{keyStatus.clientKeyPreview}</code>
          </div>
          <button onClick={handleRemove} disabled={removing}
            className="mt-2 text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50">
            {removing ? "Menghapus…" : "Hapus dan kembali ke Midtrans Fremio"}
          </button>
        </div>
      )}

      {success && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-green-700 text-sm">✅ Midtrans Keys berhasil disimpan</div>}
      {error   && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-red-600 text-sm">{error}</div>}

      <form onSubmit={handleSave} className="space-y-4">
        <Field label="Server Key (Mid-server-... / SB-Mid-server-...)">
          <input
            type="password"
            autoComplete="off"
            placeholder={keyStatus.hasServerKey ? "Isi untuk mengganti key" : "Mid-server-XXXXXXXXXXXXXXXX"}
            className={input}
            value={serverKey}
            onChange={(e) => setServerKey(e.target.value)}
          />
        </Field>

        <Field label="Client Key (Mid-client-... / SB-Mid-client-...)">
          <input
            type="password"
            autoComplete="off"
            placeholder={keyStatus.hasClientKey ? "Isi untuk mengganti key" : "Mid-client-XXXXXXXXXXXXXXXX"}
            className={input}
            value={clientKey}
            onChange={(e) => setClientKey(e.target.value)}
          />
        </Field>

        <p className="text-xs text-gray-400 leading-relaxed">
          Dapatkan keys di{" "}
          <a href="https://dashboard.midtrans.com" target="_blank" rel="noopener noreferrer"
            className="text-primary-700 underline">dashboard.midtrans.com</a>
          {" "}→ Settings → Access Keys. Gunakan <strong>Sandbox</strong> untuk testing, <strong>Production</strong> untuk live.
        </p>

        <button type="submit" disabled={loading}
          className="px-6 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800 disabled:opacity-60">
          {loading ? "Menyimpan…" : keyStatus.hasServerKey ? "Perbarui Keys" : "Simpan Keys"}
        </button>
      </form>
    </div>
  );
}

// ─── Password Form ────────────────────────────────────────────────────────────

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError("Password baru dan konfirmasi tidak cocok"); return;
    }
    setLoading(true); setError(null); setSuccess(false);
    try {
      const res  = await fetch("/api/dashboard/settings/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? "Gagal mengganti password");
      setSuccess(true);
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {success && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-green-700 text-sm">✅ Password berhasil diubah</div>}
      {error   && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-red-600 text-sm">{error}</div>}

      <Field label="Password Saat Ini">
        <input required type="password" className={input} value={form.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} />
      </Field>
      <Field label="Password Baru (min. 8 karakter)">
        <input required type="password" minLength={8} className={input} value={form.newPassword} onChange={(e) => set("newPassword", e.target.value)} />
      </Field>
      <Field label="Konfirmasi Password Baru">
        <input required type="password" className={input} value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} />
      </Field>

      <button type="submit" disabled={loading}
        className="px-6 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800 disabled:opacity-60">
        {loading ? "Mengubah…" : "Ubah Password"}
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data, isLoading, mutate }       = useSWR<{ success: boolean; data: OperatorSettings }>("/api/dashboard/settings");
  const { data: payData, mutate: mutatePayment } = useSWR<{ success: boolean; data: PaymentKeyStatus }>("/api/dashboard/settings/payment");
  const settings  = data?.data;
  const keyStatus = payData?.data;

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }
  if (!settings) return <div className="p-6 text-red-500">Gagal memuat pengaturan.</div>;

  const tier       = TIER_INFO[settings.subscriptionTier] ?? TIER_INFO.STARTER;
  const expiry     = settings.subscriptionExpiry ? new Date(settings.subscriptionExpiry) : null;
  const isExpired  = expiry ? expiry < new Date() : true;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pengaturan</h1>
        <p className="text-gray-400 text-sm mt-1">Kelola profil bisnis dan akun kamu</p>
      </div>

      {/* ── Subscription info ── */}
      <SectionCard title="Info Langganan">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-1 min-w-52">
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${tier.color}`}>{tier.label}</span>
              {isExpired
                ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">Kedaluwarsa</span>
                : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Aktif</span>}
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              <p>Maks. <strong>{tier.maxBooths === 999 ? "Tidak terbatas" : tier.maxBooths}</strong> booth</p>
              <p>Harga: <strong>{tier.priceLabel}</strong></p>
              {expiry && (
                <p className={isExpired ? "text-red-500" : "text-gray-600"}>
                  {isExpired ? "Berakhir pada: " : "Aktif sampai: "}
                  <strong>{fmtDate(settings.subscriptionExpiry!)}</strong>
                </p>
              )}
              <p className="text-gray-400 text-xs mt-2">Bergabung sejak {fmtDate(settings.createdAt)}</p>
            </div>
          </div>
          {(isExpired || settings.subscriptionTier !== "ENTERPRISE") && (
            <div className="shrink-0">
              <a href="mailto:hello@fremio.id?subject=Upgrade%20Langganan"
                className="inline-block px-5 py-2.5 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600">
                {isExpired ? "Perpanjang" : "Upgrade"} →
              </a>
              <p className="text-xs text-gray-400 mt-1 text-center">Hubungi kami via email</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Payment Gateway ── */}
      <SectionCard title="Payment Gateway (Midtrans)">
        {keyStatus
          ? <PaymentForm keyStatus={keyStatus} onSaved={() => mutatePayment()} />
          : <div className="animate-pulse h-32 bg-gray-50 rounded-xl" />}
      </SectionCard>

      {/* ── Profil bisnis ── */}
      <SectionCard title="Profil Bisnis">
        <ProfileForm settings={settings} onSaved={() => mutate()} />
      </SectionCard>

      {/* ── Ganti password ── */}
      <SectionCard title="Keamanan">
        <PasswordForm />
      </SectionCard>
    </div>
  );
}
