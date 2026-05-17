import Image from "next/image";
import Link from "next/link";

export default function RootPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-14 pt-6 md:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="Fremio Studio Home">
            <Image
              src="/fremio_studio.png"
              alt="Fremio Studio"
              width={220}
              height={48}
              priority
              className="h-11 w-auto object-contain"
            />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="rounded-full border border-black/40 bg-white px-5 py-2 text-sm font-semibold text-black transition hover:border-black"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-black px-5 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
            >
              Login
            </Link>
          </div>
        </header>

        <section className="relative mt-10 overflow-hidden rounded-[2rem] border border-black/10 bg-[#DEB6A9] p-8 md:mt-12 md:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-white/30 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-black/10 blur-3xl" />

          <div className="relative max-w-3xl">
            <p className="mb-4 inline-flex rounded-full border border-black/20 bg-white/70 px-4 py-1 text-xs font-bold uppercase tracking-[0.14em] text-black/80">
              Software Photobox B2B
            </p>
            <h1 className="text-3xl font-black leading-tight md:text-5xl">
              Bangun photobox yang terasa otentik, berkarakter, dan siap dipakai untuk bisnis.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-black/80 md:text-lg">
              Fremio Studio membantu pemilik photobox mengelola frame, booth, sesi, dan alur pembayaran
              dalam satu dashboard modern. Fokus di operasional, branding, dan pengalaman pelanggan yang
              lebih premium.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-black px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
              >
                Masuk ke Dashboard
              </Link>
              <a
                href="#keunggulan"
                className="rounded-full border border-black/50 bg-white/80 px-6 py-3 text-sm font-bold text-black transition hover:bg-white"
              >
                Lihat Keunggulan
              </a>
            </div>
          </div>
        </section>

        <section id="keunggulan" className="mt-10 grid gap-4 md:mt-12 md:grid-cols-3">
          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">Branding Lebih Otentik</h2>
            <p className="mt-2 text-sm leading-relaxed text-black/70">
              Kelola frame dan gaya visual photobox agar booth Anda punya identitas yang kuat dan tidak
              generik.
            </p>
          </article>

          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">Operasional Lebih Rapi</h2>
            <p className="mt-2 text-sm leading-relaxed text-black/70">
              Monitor booth, sesi foto, dan performa harian dari satu tempat tanpa workflow yang berbelit.
            </p>
          </article>

          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">Siap Untuk Scale</h2>
            <p className="mt-2 text-sm leading-relaxed text-black/70">
              Cocok untuk pemilik photobox yang ingin bertumbuh dari satu booth ke multi lokasi dengan
              kontrol penuh.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
