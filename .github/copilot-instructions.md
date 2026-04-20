# Fremio Photobox Software — Copilot Instructions

## Project Overview
Fremio is a web-based photobox software platform built for Indonesian
market. It runs entirely in the browser (Chrome), requiring zero
installation for the booth UI. A lightweight local agent handles
hardware bridging (camera + printer) when needed.

## Tech Stack
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS
- Backend: Next.js API Routes + Node.js
- Database: PostgreSQL via Prisma ORM
- Auth: NextAuth.js
- Payment: Midtrans (QRIS + VA)
- Storage: Cloudflare R2 (foto hasil)
- Realtime: Socket.io
- Local Agent: Node.js + gphoto2 binding (for DSLR) + CUPS (for printer)

## Core Modules
1. **BOOTH MODULE** — UI yang berjalan di mesin photobox
2. **OPERATOR DASHBOARD** — manajemen frame, sesi, revenue
3. **PAYMENT MODULE** — Midtrans webhook → session unlock
4. **FRAME ENGINE** — overlay frame ke foto, compositing
5. **DELIVERY MODULE** — QR code + softfile download page
6. **LOCAL AGENT** — bridge kamera & printer ke browser
7. **DESIGNER PORTAL** — upload & submit frame (existing Fremio)
8. **AUTH & SUBSCRIPTION** — operator login, tier management

## Business Context
- Target user: operator photobox offline di Indonesia (coffee shop,
  studio foto, event organizer)
- Pricing model: subscription bulanan (benchmark Boothlab.id:
  Rp150K–985K/bulan)
- Frame source: Fremio designer marketplace (unfair advantage)
- Payment in-booth: QRIS via Midtrans
- Photo delivery: QR code → halaman download softfile

## Key Constraints
- HARUS jalan di Chrome browser tanpa install apapun (webcam mode)
- HARUS mobile-friendly untuk halaman download user
- HARUS support offline-graceful (sesi tidak putus kalau internet
  sebentar hilang)
- Bahasa UI booth: Indonesia
- Semua harga dalam IDR

## Code Standards
- TypeScript strict mode
- Setiap komponen harus ada error boundary
- API routes harus ada input validation (zod)
- Semua secret via environment variables
- Jangan hardcode apapun
