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
- **Studio path on VPS**: `/root/fremio-studio/studio/` ← **BENAR** (bukan `/root/fremio-studio/`)
- **pm2 exec cwd**: `/root/fremio-studio/studio`
- **pm2 process name**: `fremio-studio`
- **Frontend URL**: `https://studio.fremio.id`
- **Agent page URL**: `https://studio.fremio.id/agent`

> ⚠️ **PENTING**: File app berjalan dari `/root/fremio-studio/studio/`, bukan root `/root/fremio-studio/`.
> Kalau upload file (source code, public assets, dll) harus ke path `/root/fremio-studio/studio/`, bukan satu level di atasnya.
> `deploy-studio.py` juga mengekstrak tar ke path yang salah — selalu verifikasi dengan `pm2 show fremio-studio | grep cwd`.

### Deployment Methods

#### Method 1: Manual SCP Deploy (Paling Reliable)
```powershell
# 1. Build lokal
cd studio && npm run build

# 2. Buat tar (exclude node_modules, .next/cache, downloads besar)
tar -czf deploy.tar.gz --exclude="./node_modules" --exclude="./.next/cache" --exclude="./public/downloads/*.exe" --exclude="./public/downloads/*.zip" .

# 3. Upload tar ke VPS
scp -i ~/.ssh/github-actions-key deploy.tar.gz root@76.13.192.32:/tmp/

# 4. Extract ke path YANG BENAR
ssh -i ~/.ssh/github-actions-key root@76.13.192.32 "tar -xzf /tmp/deploy.tar.gz -C /root/fremio-studio/studio && rm /tmp/deploy.tar.gz"

# 5. Upload file download besar secara terpisah
scp -i ~/.ssh/github-actions-key public/downloads/fremio-booth-windows-setup.exe root@76.13.192.32:/root/fremio-studio/studio/public/downloads/
scp -i ~/.ssh/github-actions-key public/downloads/fremio-agent-win.exe root@76.13.192.32:/root/fremio-studio/studio/public/downloads/

# 6. Sync ke nginx folder & restart
ssh -i ~/.ssh/github-actions-key root@76.13.192.32 "cp -f /root/fremio-studio/studio/public/downloads/*.exe /var/www/fremio/downloads/ && pm2 restart fremio-studio"
```

#### Method 2: Python Direct Deploy
```bash
python deploy-studio.py
```
> ⚠️ Script ini mengekstrak ke `/root/fremio-studio/` (salah). Perlu diperbaiki agar target ke `/root/fremio-studio/studio/`.

#### Method 3: GitHub Actions (Auto-trigger on push)
- Triggers automatically on any push to `studio/**`
- Workflow: `.github/workflows/deploy-studio.yml`
- Builds on VPS (slower, requires npm install on VPS)

### SSH Key
- File: `~/.ssh/github-actions-key` (ed25519, yang berfungsi)
- File: `~/.ssh/fremio_deploy` — **TIDAK ADA**, jangan digunakan
- Usage: `ssh -i ~/.ssh/github-actions-key root@76.13.192.32`

### Rebuild di VPS (jika perlu)
```bash
ssh -i ~/.ssh/github-actions-key root@76.13.192.32 "cd /root/fremio-studio/studio && npm run build && pm2 restart fremio-studio"
```

---

## Agent Downloads & Windows App (studio/public/downloads/)

File download disajikan via nginx (`/var/www/fremio/downloads/`) dan Next.js (`studio/public/downloads/`).

> ⚠️ **NGINX RULE WAJIB**: Setiap file download baru di `/downloads/` harus ditambahkan sebagai `location` block di `/etc/nginx/sites-enabled/studio.fremio.id`. Tanpa ini file akan 404 meski ada di disk.

```nginx
# Contoh — tambahkan sebelum `location /uploads`
location = /downloads/nama-file.exe {
    alias /var/www/fremio/downloads/nama-file.exe;
    add_header Content-Disposition "attachment" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}
```
Setelah edit: `nginx -t && nginx -s reload`

### File Download Tersedia

| File | Deskripsi | Ukuran |
|------|-----------|--------|
| `fremio-booth-windows-setup.exe` | **Full Electron App** — installer Windows | ~107 MB |
| `fremio-booth-windows-portable.zip` | Full Electron App — portable/ZIP | ~144 MB |
| `fremio-agent-win.exe` | Agent Only — binary standalone | ~38 MB |
| `fremio-agent-win-bundle/` | Agent + Canon EDSDK DLLs | ~44 MB zip |
| `fremio-agent-mac-arm64` | macOS agent Apple Silicon | ~46 MB |
| `fremio-agent-mac-x64` | macOS agent Intel | ~51 MB |

### Halaman /agent — Dua Tombol Download
- **Tombol 1 (Full App)**: `fremio-booth-windows-setup.exe` — konstanta `WINDOWS_SETUP_FILE`
- **Tombol 2 (Agent Only)**: `fremio-agent-win.exe` — konstanta `WINDOWS_AGENT_ONLY_FILE`

> ⚠️ Jangan ubah `WINDOWS_SETUP_FILE` menjadi `fremio-agent-win.exe` — ini bug deploy sebelumnya yang menyebabkan kedua tombol download file yang sama (agent only).

**IMPORTANT — Versioning:**
- Filenames have NO version suffix. Use `fremio-agent-win.exe`, NOT `fremio-agent-win-v1.0.30.exe`
- Version number is only shown as a badge in the `/agent` page UI (`v1.0.30`)
- Do NOT reference versioned filenames like `fremio-booth-windows-setup-v1.0.XX.exe` — these never existed

### Static Assets / Logo
- Logo Fremio Studio: `my-app/src/assets/fremio_studio.png` (sumber utama)
- Harus di-copy ke `studio/public/fremio_studio.png` agar bisa diakses web
- Jika ada nama file baru (e.g. `fremio_studio_20260426.png`), buat alias saja di public/
- `studio/public/` hampir kosong di git (`.gitignore` exclude `*.exe`, `*.zip`) — file harus diupload manual ke VPS

**Agent architecture:**
- The agent runs on the **operator's local machine** (booth computer), NOT on the VPS
- Exposes HTTP on port 7432 for the booth browser to talk to
- Commands: `cd agent && npm start`
- GitHub deploys do NOT update the local agent — operators must update manually

---

## Windows Electron App Build (booth-windows-app)

### Lokasi
`studio/booth-windows-app/` — Electron app yang membungkus agent + booth UI

### Output Build
- `dist/Fremio Studio-Setup-X.X.XX.exe` → di-rename ke `public/downloads/fremio-booth-windows-setup.exe`
- `dist/Fremio Studio-X.X.XX-win.zip` → di-rename ke `public/downloads/fremio-booth-windows-portable.zip`
- Rename dilakukan via: `cd studio && npm run app:sync-downloads`

### Build Requirements
- Windows OS (tidak bisa cross-compile dari Linux/macOS)
- Node.js (di `C:\Program Files\nodejs`) — pastikan ada di PATH
- PowerShell 7 (`pwsh.exe`) — install via `winget install --id Microsoft.PowerShell`

### Cara Build
```powershell
# Set PATH untuk Node.js (jika tidak otomatis terdeteksi di pwsh)
$env:Path = "C:\Program Files\nodejs;${env:APPDATA}\npm;" + $env:Path

# Pre-populate winCodeSign cache (WAJIB — bypass symlink error Windows)
$sevenZip = ".\node_modules\7zip-bin\win\x64\7za.exe"
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
New-Item -Path $cacheDir -ItemType Directory -Force
& $sevenZip x -bd "$env:TEMP\winCodeSign-2.6.0.7z" "-o$cacheDir" -y
# Buat placeholder untuk 2 symlinks macOS yang gagal
New-Item -Path "$cacheDir\darwin\10.12\lib" -ItemType Directory -Force
"" | Set-Content "$cacheDir\darwin\10.12\lib\libcrypto.dylib"
"" | Set-Content "$cacheDir\darwin\10.12\lib\libssl.dylib"

# Build
cd studio\booth-windows-app
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue
npm run build

# Sync ke downloads folder
cd ..
npm run app:sync-downloads
```

### Error Umum: Symlink Privilege
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```
**Penyebab**: electron-builder download `winCodeSign-2.6.0.7z` yang berisi symlinks macOS (`libcrypto.dylib`, `libssl.dylib`). Windows blokir pembuatan symlinks tanpa Developer Mode atau admin.

**Fix**: Pre-populate cache secara manual (lihat langkah di atas) — 7za akan error code 2 (warning) tapi file lain terekstrak. Buat placeholder kosong untuk 2 symlinks yang gagal. electron-builder akan temukan folder cache dan skip re-extraction.

### Setelah Build Selesai
1. Upload `public/downloads/fremio-booth-windows-setup.exe` ke VPS
2. Upload `public/downloads/fremio-booth-windows-portable.zip` ke VPS
3. Copy ke `/var/www/fremio/downloads/` di VPS
4. Pastikan nginx punya rule untuk kedua file tersebut

---



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
