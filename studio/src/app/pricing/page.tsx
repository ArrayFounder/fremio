import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8 md:px-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-black/70 hover:text-black">
            ← Kembali
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            Login
          </Link>
        </header>

        <section className="mt-10">
          <p className="inline-flex rounded-full border border-black/20 bg-[#DEB6A9]/40 px-4 py-1 text-xs font-bold uppercase tracking-[0.14em] text-black/80">
            Pricing
          </p>
          <h1 className="mt-4 text-3xl font-black md:text-4xl">Paket Fremio Studio</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-black/70 md:text-base">
            Solusi ringan untuk pemilik photobox yang ingin tampilan brand lebih otentik dan operasional lebih rapi.
          </p>
        </section>

        <section className="mt-8">
          <article className="max-w-md rounded-3xl border border-black/10 bg-[#DEB6A9] p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/70">Starter Plan</p>
            <p className="mt-2 text-4xl font-black">Rp 50K</p>
            <p className="mt-1 text-sm font-semibold text-black/70">per 1 bulan</p>

            <ul className="mt-5 space-y-2 text-sm text-black/80">
              <li>• 1 booth aktif</li>
              <li>• Dashboard booth & frame</li>
              <li>• Akses fitur PIN booth</li>
            </ul>

            <Link
              href="/login"
              className="mt-6 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              Mulai Sekarang
            </Link>
          </article>
        </section>
      </div>
    </main>
  );
}
