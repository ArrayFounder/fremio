# Fremio - Photo Booth Software Platform

> Web-based photobox software for Indonesian market. Runs entirely in Chrome browser (no installation for booth UI). Local agent bridges hardware (DSLR camera + printer).

---

## Project Structure

fremio/
├── studio/              # Next.js 14 frontend (operator dashboard + booth UI)
│   ├── src/
│   │   ├── app/         # Next.js App Router pages
│   │   ├── components/  # React components (creator, dashboard)
│   │   ├── lib/         # Core utilities (auth, payment, storage)
│   │   ├── services/    # Business logic services
│   │   ├── store/       # Zustand state management
│   │   └── types/       # TypeScript types
│   ├── prisma/
│   │   └── schema.prisma  # PostgreSQL schema
│   └── server.ts        # Custom Next.js server with Socket.io
│
├── backend/             # Express.js API server (legacy)
│   ├── routes/          # API endpoints (auth, frames, payment, designer)
│   ├── services/        # Backend services (midtrans, storage, payments)
│   └── server.js       # Main Express server
│
├── agent/               # Local hardware bridge (Node.js)
│   ├── src/
│   │   ├── index.js     # Agent server (port 7432)
│   │   ├── camera.js    # gphoto2 DSLR integration
│   │   └── printer.js   # CUPS/PowerShell printing
│   └── README.md        # Full agent documentation
│
├── my-app/              # Legacy Firebase frontend
└── deploy/              # Deployment scripts

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend (studio) | Next.js API Routes + custom server with Socket.io |
| Backend (legacy) | Express.js + Node.js |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js v4 (credentials + Google OAuth) |
| Payment | Midtrans (QRIS + VA), Xendit, Doku support |
| Storage | Cloudflare R2 (photos) |
| Realtime | Socket.io |
| Local Agent | Node.js + gphoto2 (DSLR) + CUPS/PowerShell |

---

## Build Commands

### Studio
cd studio
npm run dev              # Custom server (Next.js + Socket.io)
npm run build            # Production build
npm start                # Run production server
npm run lint             # ESLint
npm run db:push          # Prisma push schema
npm run db:migrate       # Run migrations
npm run db:generate      # Generate Prisma client
npm run db:studio        # Open Prisma Studio

### Backend (Legacy)
cd backend
npm run dev              # Start with nodemon
npm start                # Production
npm run backup           # Backup database

### Local Agent
cd agent
npm start                # Start agent (port 7432)

---

## Architecture

### Studio Routes (Next.js App Router)
- (auth) - Login, Register pages
- (booth) - Customer booth experience, payment, download
- (dashboard) - Operator dashboard, analytics, settings
- (editor) - Frame designer/editor
- api/ - API routes (auth, booths, payment, frames, upload)
- download/ - Customer photo download pages

### Database Models (Prisma)
- Operator - Business owner, subscription tier, payment gateway config
- BoothConfig - Per-booth settings (pricing, timers, slug, branding)
- BoothSession - Customer photo session, status, media URLs
- Frame - Frame templates with slots for photo placement
- Transaction - Payment records (Midtrans/Xendit/Doku)
- Voucher - Discount codes
- CreditPurchase - Operator credit buys

### Key Enums
- SubscriptionTier: STARTER (1 booth), PRO (3 booth), ENTERPRISE (unlimited)
- SessionStatus: PENDING, ACTIVE, COMPLETED
- TransactionStatus: PENDING, SUCCESS, FAILED, CANCELLED, EXPIRED
- PaymentMethod: QRIS, BANK_TRANSFER, GOPAY, OVO, DANA, CASH

---

## Key Files

| File | Purpose |
|------|---------|
| studio/server.ts | Custom Next.js + Socket.io server |
| studio/prisma/schema.prisma | PostgreSQL database schema |
| studio/src/lib/frameEngine.ts | Photo frame compositing (63KB) |
| studio/src/store/useCreatorStore.js | Frame editor state (42KB) |
| backend/routes/payment.js | Payment processing (45KB) |
| backend/routes/designer.js | Designer portal (66KB) |

---

## Environment Variables

Studio: DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_OAUTH, R2_STORAGE, MIDTRANS_KEYS, AGENT_SECRET_TOKEN

Backend: PORT, DB_HOST, JWT_SECRET, MIDTRANS_KEYS, FRONTEND_URL

---

## Deployment

- Frontend (my-app): Cloudflare Pages via GitHub Actions
- Backend: VPS via SSH + pm2 (GitHub Actions)
- Studio: Custom server deployment with Socket.io

---

## Code Standards

- TypeScript strict mode in studio
- Error boundaries on all components
- Input validation with Zod
- Environment secrets - never hardcode
- Indonesian UI for booth interface
- Mobile-first for photo download pages

---

## Key Architecture Decisions

1. No-installation booth: Browser-only operation via webcam
2. Local agent optional: gphoto2/CUPS for DSLR + printing
3. QR code delivery: Customer scans QR to download softfile
4. Subscription tiers: Credits system for watermark-free
5. Multi-gateway: Midtrans primary, Xendit/Doku fallbacks
6. Real-time booth sync: Socket.io for multi-device state
