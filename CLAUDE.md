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
| studio/src/app/(dashboard)/agent/page.tsx | Agent download page at /agent |
| studio/src/app/(booth)/b/[slug]/screens/BoothSetupScreen.tsx | Hardware setup before booth session |
| studio/src/app/(booth)/b/[slug]/screens/CameraScreen.tsx | Booth camera + countdown UI |
| agent/src/camera.js | Camera abstraction — USB mutex + Canon capture logic |
| agent/src/index.js | Agent Express server (port 7432) |
| backend/routes/payment.js | Payment processing (45KB) |
| backend/routes/designer.js | Designer portal (66KB) |

---

## Canon DSLR Camera Notes

### Known Errors (fixed in agent v1.0.30)
- `read ECONNRESET` — happens on first capture after live preview; fixed by USB mutex + `captureInFlight` guard in `camera.js`
- `0x000000C0` (GP_ERROR_IO_USB_FIND) — USB session conflict; fixed by `previewQueue` serialization
- "Live preview Canon belum tersedia" — timing too short; fixed by increasing grace periods in `BoothSetupScreen.tsx` and `CameraScreen.tsx`

### How Canon capture works
1. Booth starts live preview (`GET /preview`) via gphoto2 capture-image-and-download loop
2. When countdown finishes, `POST /capture` is called
3. `captureInFlight = true` is set **before** killing live preview (to block preview queue from re-entering)
4. `killActivePreviewAndWait()` terminates live preview process
5. `triggerShutter()` fires the Canon shutter
6. Photo downloaded, `captureInFlight = false`, preview resumes

### Timing Requirements
- gphoto2 needs up to 2200ms after USB release before re-open
- `BoothSetupScreen.tsx`: wait 3000ms after releasing preview before capture
- `CameraScreen.tsx`: grace periods 3500ms / 4000ms between operations

---

## Environment Variables

Studio: DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_OAUTH, R2_STORAGE, MIDTRANS_KEYS, AGENT_SECRET_TOKEN

Backend: PORT, DB_HOST, JWT_SECRET, MIDTRANS_KEYS, FRONTEND_URL

---

## Deployment

### Production Environment
- **VPS**: `root@76.13.192.32`
- **Studio path on VPS**: `/root/fremio-studio`
- **pm2 process name**: `fremio-studio`
- **Frontend URL**: `https://studio.fremio.id`
- **Agent page URL**: `https://studio.fremio.id/agent`

### Deployment Methods

#### Method 1: Python Direct Deploy (Preferred — reliable)
```bash
python deploy-studio.py
```
Build runs **locally**, then SCP uploads to VPS, then pm2 restarts.
- Uses `~/.ssh/fremio_deploy` SSH key OR `github-actions-key` in repo root (ed25519)
- Requires Node.js locally to run `npm run build` in studio/
- No VPS build needed — faster than GitHub Actions

#### Method 2: GitHub Actions (Auto-trigger on push)
- Triggers automatically on any push to `studio/**`
- Workflow: `.github/workflows/deploy-studio.yml`
- Builds on VPS (slower, requires npm install on VPS)
- Manual trigger: `.github/workflows/patch-canon-fix.yml` (for TSX patch + deploy)

### SSH Key
- File: `github-actions-key` (ed25519 private key, repo root)
- Usage: `ssh -i github-actions-key root@76.13.192.32`

---

## Agent Downloads (studio/public/downloads/)

Files committed to git and served at `https://studio.fremio.id/downloads/`:

| File | Description |
|------|-------------|
| `fremio-agent-win.exe` | Windows agent binary (39MB, standalone) |
| `fremio-agent-win-bundle/fremio-agent-win.exe` | Windows agent + Canon EDSDK DLLs |
| `fremio-agent-win-bundle/bin/` | Canon EDSDK DLL files |
| `fremio-agent-mac-arm64` | macOS agent — Apple Silicon |
| `fremio-agent-mac-x64` | macOS agent — Intel |
| `fremio-studio-launcher.exe` | Lite Windows launcher (31KB) |
| `fremio-studio-windows-launcher.hta` | HTA-based launcher |

**IMPORTANT — Versioning:**
- Filenames have NO version suffix. Use `fremio-agent-win.exe`, NOT `fremio-agent-win-v1.0.30.exe`
- Version number is only shown as a badge in the `/agent` page UI (`v1.0.30`)
- Do NOT reference versioned filenames like `fremio-booth-windows-setup-v1.0.XX.exe` — these never existed

**Agent architecture:**
- The agent runs on the **operator's local machine** (booth computer), NOT on the VPS
- Exposes HTTP on port 7432 for the booth browser to talk to
- Commands: `cd agent && npm start`
- GitHub deploys do NOT update the local agent — operators must update manually

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
