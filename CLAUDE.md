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
├── agent/               # ⚠️ LEGACY — gphoto2 agent (TIDAK DIGUNAKAN lagi)
│   ├── src/
│   │   ├── index.js     # Agent server (port 7432) — LEGACY
│   │   ├── camera.js    # gphoto2 integration — LEGACY, sudah tidak aktif
│   │   └── printer.js   # CUPS/PowerShell printing
│   └── README.md        # Agent documentation (outdated)
│
│   ⚠️ Agent AKTIF ada di studio/agent/ bukan di sini!
│
├── studio/agent/        # ✅ AKTIF — TypeScript/EDSDK agent (yang dipakai Electron)
│   ├── src/
│   │   ├── server.ts    # HTTP server + MJPEG stream (port 3002)
│   │   └── ...
│   └── native/
│       └── edsdk-bridge/  # C# .NET 8 wrapper untuk Canon EDSDK SDK
│           └── Program.cs # EnsureCameraReady, LiveView, Capture logic
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
| Local Agent | TypeScript + Canon EDSDK (DSLR) + CUPS/PowerShell printing |
| EDSDK Bridge | C# .NET 8 (`studio/agent/native/edsdk-bridge/`) — wraps Canon EDSDK SDK |

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

### Local Agent (Canon EDSDK — Active)
cd studio/agent
npm start                # Start agent (port 3002, TypeScript + C# EDSDK bridge)

# ⚠️ JANGAN jalankan `cd agent && npm start` — itu legacy gphoto2, tidak dipakai

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
| studio/agent/src/server.ts | ✅ AKTIF — Agent TypeScript/EDSDK (port 3002), MJPEG `/preview-stream` |
| studio/agent/native/edsdk-bridge/Program.cs | C# wrapper Canon EDSDK — `EnsureCameraReady()`, retry logic |
| agent/src/camera.js | ⚠️ LEGACY gphoto2 — TIDAK DIGUNAKAN, jangan edit |
| agent/src/index.js | ⚠️ LEGACY agent Express — TIDAK DIGUNAKAN |
| backend/routes/payment.js | Payment processing (45KB) |
| backend/routes/designer.js | Designer portal (66KB) |

---

## Canon DSLR Camera Notes

## Canon DSLR Camera Notes

> ⚠️ **KRITIS**: Sistem menggunakan **Canon EDSDK resmi** (via C# bridge), **BUKAN gphoto2**!
> Referensi gphoto2 di code lama sudah usang. Agent aktif: `studio/agent/`, bukan `agent/`.

### Dua Agent Codebase (JANGAN SAMPAI TERTUKAR)

| Path | Status | Teknologi |
|------|--------|-----------|
| `agent/` (root) | ⚠️ LEGACY | Node.js + gphoto2 — **tidak dipakai** |
| `studio/agent/` | ✅ AKTIF | TypeScript + Canon EDSDK — **yang dipakai Electron** |

Agent aktif dikompilasi menjadi `fremio-agent-win.exe` (TypeScript + C# EDSDK bridge).

### Arsitektur EDSDK

```
Electron App
  └── studio/booth-windows-app/main.js
        ├── Spawn: studio/agent/ (TypeScript server, port 3002)
        │     └── spawn: studio/agent/native/edsdk-bridge/Program.cs (C# .NET 8)
        │           └── Canon EDSDK SDK (DLL) → Camera via USB
        └── Protocol: fremio-agent://local/* → http://127.0.0.1:3002/*
```

### Key Agent Files

- `studio/agent/src/server.ts` — HTTP server, `/preview-stream` MJPEG endpoint
- `studio/agent/native/edsdk-bridge/Program.cs` — C# Canon EDSDK wrapper
- `studio/booth-windows-app/main.js` — Electron: spawn agent, register protocol

### How Canon EDSDK capture works

1. BoothSetupScreen starts live preview → `GET /preview-stream` → agent spawns EDSDK bridge
2. Bridge calls `EnsureCameraReady()` → `StartLiveView()` → MJPEG stream keluar
3. Saat sesi foto dimulai, `releaseDslrPreviewStream()` dipanggil (sets `booth_dslr_stream_release_until = T+3000ms`)
4. Bridge idle → `scheduleSharedPreviewStop(5000ms)` → bridge tutup setelah 5 detik tanpa consumer
5. CameraScreen mulai polling `/preview-stream` setelah delay → bridge re-start jika sudah mati
6. Capture: `POST /capture` → bridge `TriggerShutter()` → foto di-download

### Root Cause: Race Condition Live Preview (sudah fixed)

**Masalah**: Bridge mati sebelum CameraScreen mulai polling  
- `scheduleSharedPreviewStop(2000ms)` → bridge mati di T+2000ms  
- `booth_dslr_stream_release_until = T+3000ms` → CameraScreen mulai polling T+3000ms  
- Gap 1033ms: bridge mati → cold EDSDK start (2–10 detik) → error "belum tersedia" muncul di 7s grace

**Fix (commit `146d2a6`, branch `agents/fix-canon-camera-capture-errors`)**:
- `studio/agent/src/server.ts` line 138: `scheduleSharedPreviewStop(delayMs = 5000)` (was 2000)
- `CameraScreen.tsx`: hapus guard `if (hasIpcPreview) return;` yang salah blokir MJPEG fallback

### EDSDK Startup Timing

- `EnsureCameraReady()`: up to 8 retry × ~500–1300ms ≈ hingga 10 detik jika `CommPortIsAlreadyOpen (0x000000C0)`
- `PumpSdkEvents(8, 200)` = 1600ms minimum startup
- Fix idle timeout ke 5000ms memastikan bridge tetap hidup saat CameraScreen mulai polling

### Error Codes EDSDK

| Code | Arti | Fix |
|------|------|-----|
| `0x000000C0` | `CommPortIsAlreadyOpen` — USB session conflict | Retry otomatis di `EnsureCameraReady()` |
| `0x00000021` | `DeviceBusy` | Tunggu, retry |
| "Live preview Canon belum tersedia" | Bridge mati sebelum CameraScreen polling | Fixed: idle timeout 5000ms |

### Known Working Parameters

- Agent port: `AGENT_PORT = BRIDGE_PORT = 3002`
- `/preview-stream` → valid MJPEG stream
- Grace period error: `DSLR_PREVIEW_ERROR_GRACE_MS = 7000ms` (di `CameraScreen.tsx`)
- IPC fallback timer: `ipcFallbackTimer = 10000ms`
>>>>>>> origin/agents/fix-canon-camera-capture-errors

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

### Cara Deploy ke VPS (RECOMMENDED: SSH Langsung)

> ✅ **PREFERRED**: Deploy via SSH terminal langsung ke VPS.
> ❌ **JANGAN**: Deploy via GitHub Actions untuk perubahan code — lambat dan tidak reliable.
> GitHub push: boleh untuk backup/history, tapi deploy harus via SSH.

#### Deploy via SSH (Posh-SSH dari PowerShell)

```powershell
Import-Module Posh-SSH
$pass = ConvertTo-SecureString 'PASSWORD' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('root', $pass)
$session = New-SSHSession -ComputerName '76.13.192.32' -Credential $cred -AcceptKey -Force

# 1. Pull kode terbaru di VPS (jika sudah push ke GitHub)
Invoke-SSHCommand -SessionId $session.SessionId -Command "cd /root/fremio-studio/studio && git pull" -TimeOut 60

# 2. Build Next.js di VPS (3-5 menit)
Invoke-SSHCommand -SessionId $session.SessionId -Command "cd /root/fremio-studio/studio && npm run build" -TimeOut 600

# 3. Restart PM2
Invoke-SSHCommand -SessionId $session.SessionId -Command "pm2 restart fremio-studio" -TimeOut 30
```

#### VPS Password
- `#Salwaputri111103` (gunakan hanya di Posh-SSH, jangan commit ke code)

#### SSH Key (alternatif jika password tidak mau)
- File: `~/.ssh/github-actions-key` (ed25519, yang berfungsi)
- File: `~/.ssh/fremio_deploy` — **TIDAK ADA**, jangan digunakan

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

**Agent architecture (EDSDK):**
- The agent runs on the **operator's local machine** (booth computer), NOT on the VPS
- Active agent: `studio/agent/` (TypeScript) — dikompilasi jadi `fremio-agent-win.exe`
- Legacy agent: `agent/` (gphoto2) — TIDAK dipakai, jangan diedit
- Exposes HTTP on port 3002, protocol handler: `fremio-agent://local/*` → `http://127.0.0.1:3002/*`
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
2. Local agent: **Canon EDSDK** (C# bridge) for DSLR + CUPS/PowerShell printing
3. QR code delivery: Customer scans QR to download softfile
4. Subscription tiers: Credits system for watermark-free
5. Multi-gateway: Midtrans primary, Xendit/Doku fallbacks
6. Real-time booth sync: Socket.io for multi-device state
