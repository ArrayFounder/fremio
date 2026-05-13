"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ email: "", password: "", confirmPassword: "", businessName: "" });
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Password dan konfirmasi tidak cocok.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res  = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email:        form.email,
          password:     form.password,
          businessName: form.businessName,
        }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? "Gagal mendaftar");
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image src="/fremio_studio.png" alt="Fremio Studio" width={220} height={70} className="mx-auto h-16 w-auto brightness-0 invert" priority />
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Buat akun operator</h2>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nama Bisnis</label>
              <input
                required
                type="text"
                placeholder="contoh: Studio Foto Ajeng"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</label>
              <input
                required
                type="email"
                autoComplete="email"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Password (min. 8 karakter)</label>
              <input
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Konfirmasi Password</label>
              <input
                required
                type="password"
                autoComplete="new-password"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                value={form.confirmPassword}
                onChange={(e) => set("confirmPassword", e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-900 text-white rounded-xl py-2.5 font-bold text-sm hover:bg-primary-800 disabled:opacity-60 transition-colors"
            >
              {loading ? "Mendaftar…" : "Daftar Sekarang"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Sudah punya akun?{" "}
            <Link href="/login" className="text-primary-700 font-semibold hover:underline">
              Masuk di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

