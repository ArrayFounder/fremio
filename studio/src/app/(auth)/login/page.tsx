"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

<<<<<<< HEAD
=======
function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M23.766 12.276c0-.935-.084-1.84-.24-2.706H12.24v5.12h6.48c-.28 1.44-1.12 2.66-2.387 3.48v2.893h3.867c2.267-2.08 3.573-5.147 3.573-8.787z" fill="#4285F4" />
      <path d="M12.24 24c3.24 0 5.96-1.067 7.947-2.893l-3.867-2.893c-1.067.72-2.427 1.147-4.08 1.147-3.133 0-5.787-2.107-6.733-4.947H1.44v2.987C3.453 21.333 7.52 24 12.24 24z" fill="#34A853" />
      <path d="M5.507 14.413a7.155 7.155 0 01-.374-2.226c0-.773.133-1.52.374-2.227V7.013H1.44C.52 8.827 0 10.867 0 13.187c0 2.32.52 4.36 1.44 6.174l4.067-2.947z" fill="#FBBC05" />
      <path d="M12.24 4.786c1.76 0 3.347.6 4.587 1.787l3.44-3.44C17.867 1.333 15.147 0 12.24 0 7.52 0 3.453 2.667 1.44 5.947L5.507 8.933c.947-2.84 3.6-4.947 6.733-4.947z" fill="#EA4335" />
    </svg>
  );
}

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";

  const [form, setForm]       = useState({ email: "", password: "" });
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect:  false,
      email:     form.email,
      password:  form.password,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email atau password salah.");
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Masuk ke akun kamu</h2>

      {justRegistered && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          ✅ Akun berhasil dibuat! Silakan masuk.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</label>
          <input
            required
            type="email"
            autoComplete="email"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Password</label>
          <input
            required
            type="password"
            autoComplete="current-password"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-900 text-white rounded-xl py-2.5 font-bold text-sm hover:bg-primary-800 disabled:opacity-60 transition-colors"
        >
          {loading ? "Masuk…" : "Masuk"}
        </button>
      </form>

<<<<<<< HEAD
=======
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-gray-400">atau</span>
        </div>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full flex items-center justify-center gap-2 border border-gray-200 bg-white text-gray-700 rounded-xl py-2.5 font-semibold text-sm hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <GoogleIcon />
        Masuk dengan Google
      </button>

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
      <p className="text-center text-sm text-gray-400 mt-6">
        Belum punya akun?{" "}
        <Link href="/register" className="text-primary-700 font-semibold hover:underline">
          Daftar di sini
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">fremio</h1>
          <p className="text-primary-200 text-sm mt-1">Studio — Operator Dashboard</p>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">Memuat…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

