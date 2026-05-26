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

### Start Studio + Agent Together (for local testing)
```bash
# Terminal 1: Studio dev server
cd studio && npm run dev

# Terminal 2: Local agent (Canon DSLR)
cd studio/agent && npm start
```

---

## Local Testing — studio.fremio.id/b/[slug] dengan Canon DSLR

Untuk test kamera Canon DSLR di `studio.fremio.id/b/tes`:

### Prerequisites
1. **Studio dev server running** di `localhost:3000`
2. **Local agent running** di `127.0.0.1:3002`

### Langkah
```bash
# 1. Start studio dev server
cd studio && npm run dev

# 2. Start local agent (terminal baru)
cd studio/agent && npm start

# 3. Buka browser ke:
# http://localhost:3000/b/tes
# ATAU https://studio.fremio.id/b/tes
```

### How it works
```
Browser (studio.fremio.id atau localhost:3000)
  └── Booth UI (BoothSetupScreen → CameraScreen)
        └── fetch('http://127.0.0.1:3002/preview-stream')
              └── Local Agent (studio/agent)
                    └── C# EDSDK Bridge → Canon DSLR via USB
```

> ⚠️ **PENTING**: Booth UI harus connect ke `http://127.0.0.1:3002` — ini adalah agent lokal di komputer booth. Browser booth computer (saat buka studio.fremio.id) harus sudah install agent dan agent harus running.

### Check Agent Status
```bash
curl http://127.0.0.1:3002/health
# {"ok":true,"version":"1.0.14","platform":"win32"} ✅

curl http://127.0.0.1:3002/preview-stream
# MJPEG stream → Canon live view aktif ✅
```

### If Agent is Not Running
```bash
cd studio/agent && npm start
# Agent akan listen di http://127.0.0.1:3002
# CameraScreen akan auto-detect dan connect ke preview stream
```

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
| studio/src/app/(booth)/b/[slug]/screens/FrameSelectScreen.tsx | Frame selection + QR scanner — Canon MJPEG via DOM img for DSLR mode |
| studio/src/app/(booth)/b/[slug]/screens/CaptureHintOverlay.tsx | Animated overlay during Canon capture — filler text (Smile!/Cheese!) + preparing text (Menyiapkan hasil…) with char-by-char typing animation |
| studio/agent/src/server.ts | ✅ AKTIF — Agent TypeScript/EDSDK (port 3002), MJPEG `/preview-stream` |
| studio/agent/native/edsdk-bridge/Program.cs | C# wrapper Canon EDSDK — `EnsureCameraReady()`, retry logic |
| agent/src/camera.js | ⚠️ LEGACY gphoto2 — TIDAK DIGUNAKAN, jangan edit |
| agent/src/index.js | ⚠️ LEGACY agent Express — TIDAK DIGUNAKAN |
| backend/routes/payment.js | Payment processing (45KB) |
| backend/routes/designer.js | Designer portal (66KB) |

---

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

### Pre-Arm Capture Flow (Working — commit d445692)

> ✅ **STABLE**: Ini versi yang sudah berfungsi. Jika agent capture rusak, revert ke:
> `git checkout d445692 -- studio/agent/ studio/src/app/(booth)/b/[slug]/screens/CameraScreen.tsx`

**Problem**: Shutter trigger terlalu lama jika bridge baru di-spawn saat countdown=1.

**Solution**: Split `/prepare-capture` → `/arm-capture` + `/trigger-capture`:
1. `count=3` → `POST /arm-capture` → spawn armed bridge (preview stays ALIVE for counts 5,4,3,2,1)
2. `count=1` → `POST /trigger-capture` → stop preview → send SHOOT → instant capture

**Flow akhir (working):**
```
CameraScreen startCountdown()
  count=3 → POST /arm-capture (fire-and-forget)
    → server.ts spawns bridge with CaptureArmedToFile() — preview stays ALIVE
    → BRIDGE_READY after ~5s
  count=1 → captureAndDisplay() → POST /trigger-capture (blocking)
    → stopActivePreviewStreams(200ms)
    → USB settle 800ms
    → await armed.readyPromise (wait for BRIDGE_READY)
    → armed.shootFn() → stdin "SHOOT\n" → instant shutter
    → completionPromise resolves → JPEG returned to browser
    → camera returns to live preview
```

**Key files changed:**
- `studio/agent/src/server.ts`:
  - `/arm-capture` — arms camera WITHOUT stopping preview; resets capture guards (imageCapturedAt, shootLastFiredAt, preArmedShootFired)
  - `/trigger-capture` — NO NOCAPTURE; wait BRIDGE_READY before SHOOT; completion only if file exists
  - `getAgentRuntimeRoots()` — added native/edsdk-bridge/bin/Release/net8.0/win-x64 to search path
- `studio/agent/native/edsdk-bridge/Program.cs`:
  - `shootReceived` flag replaces `timedOut` for exit decision — NOCAPTURE/EOF no longer sets timedOut
- `studio/src/app/(booth)/b/[slug]/screens/CameraScreen.tsx`:
  - count=3 → `POST /arm-capture`
  - captureFromAgent() → `POST /trigger-capture` (not /capture)
  - removed freezeDslrPreview() calls

### Double-Shot Prevention (Atomic Guards)

**Problem**: Race condition bisa menyebabkan 2 shutter trigger dalam satu sesi.

**Solution**: Atomic flag `preArmedShootFired` — set SEBELUM stdin write, check setelah await:
```typescript
// server.ts — shootFn
preArmedShootFired = true;  // atomic set BEFORE write
shootLastFiredAt = Date.now();
captureLockFiredAt = Date.now();
armedProcess.stdin?.write("SHOOT\n");
// await readyPromise...
// RE-CHECK after await
if (preArmedShootFired && captureLockFiredAt !== Date.now()) {
  return { status: "already_fired" }; // reject concurrent
}
```

**Key Guards:**
- `preArmedShootFired`: set before stdin write, never reset mid-session
- `preArmedShootFired` checked in inline path before trigger
- Window: 60s — preArmedShootFired auto-clears after 60s

### C# Bridge Armed Mode (CaptureArmedToFile)

**Path**: `studio/agent/native/edsdk-bridge/Program.cs`

**Flow:**
1. `args[0] == "capture-armed"` → `CaptureArmedToFile(outputPath)`
2. Setup: `EnsureCameraReady()` → `EdsOpenSession()` → EVF disable → SaveTo=Host → JPEG forced
3. `Console.Error.WriteLine("BRIDGE_READY")` → signals Node.js that bridge is ready for SHOOT
4. stdin reader thread: wait for `SHOOT` or `NOCAPTURE`
5. On SHOOT: `TriggerShutter()` → save JPEG to outputPath → exit code=0
6. On NOCAPTURE: `cancelled=true` → exit cleanly without firing
7. On 60s timeout: `timedOut=true` → exit WITHOUT firing

**CRITICAL stdin race fix (commit d445692)**:
- `timedOut` was accidentally set by NOCAPTURE and EOF (race condition)
- Fixed: separate `shootReceived`, `cancelled`, `timedOut` flags
- Only `shootReceived=true` triggers TakePicture; `cancelled` and `timedOut` cause clean exit

### Inline Capture Path (Fallback)

When pre-arm is not available (race, bridge died before BRIDGE_READY), inline path triggers:
1. Do NOT send NOCAPTURE — that would kill a valid armed bridge
2. USB settle: 800ms wait for Canon USB session to close
3. Spawn new bridge with `CaptureToFile()` (not armed mode)
4. Wait BRIDGE_READY (up to 60s)
5. Send SHOOT via stdin
6. Wait file output

> ⚠️ **No NOCAPTURE in /trigger-capture**: Previous version sent NOCAPTURE before SHOOT, which killed the wrong armed bridge and caused race conditions. Now `/trigger-capture` sends SHOOT directly without clearing armed bridge first. The armed bridge is only cleared by `/arm-capture` when a newer arm starts.

### EDSDK Startup Timing

| Operation | Duration |
|-----------|----------|
| `EnsureCameraReady()` retry loop | up to 8 × ~500–1300ms ≈ 10s max |
| `PumpSdkEvents(8, 200)` | 1600ms minimum |
| USB settle (inline capture) | 800ms |
| Pre-arm idle timeout | 5000ms |

### Error Codes

| Code | Arti | Fix |
|------|------|-----|
| `0x000000C0` | `CommPortIsAlreadyOpen` — USB session conflict | Retry otomatis di `EnsureCameraReady()` |
| `0x00000021` | `DeviceBusy` | Tunggu, retry |
| `0x00000020` | `PTP Device Busy` | Retry |
| "Live preview Canon belum tersedia" | Bridge mati sebelum polling | Fixed: idle timeout 5000ms |
| "signal timed out" | CameraScreen fetch timeout | Fixed: pre-arm bridge earlier |

### Known Working Parameters

- Agent port: `AGENT_PORT = BRIDGE_PORT = 3002`
- `/preview-stream` → valid MJPEG stream
- Grace period error: `DSLR_PREVIEW_ERROR_GRACE_MS = 7000ms` (di `CameraScreen.tsx`)
- IPC fallback timer: `ipcFallbackTimer = 10000ms`
- Pre-arm call: `startCountdown()` (count=5)


### FrameSelectScreen QR Scanner (Canon MJPEG)

**Problem**: Canon MJPEG stream (`/preview-stream`) must be displayed in the QR scanner overlay when `captureSource === "dslr"`. `<video>` elements cannot play MJPEG (only `video/webm`/`video/mp4` are valid browser video formats).

**Solution**: Plain DOM `<img>` element with per-tick `src` refresh:
1. React renders `<div id="qr-canon-img">` as placeholder in scanner overlay
2. `startScanner()` polls for container (50ms × 20 attempts) then appends `<img>`
3. Each poll tick calls `img.src = agent/preview-stream?t={timestamp}` — browser fetches the latest JPEG frame from the MJPEG stream (~2fps live preview)
4. QR scanning via `jsqr` reads `getImageData` from the img canvas
5. Canon agent URL: `http://127.0.0.1:3002` (hardcoded — matches CameraScreen's IPC/HTTP discovery default)
6. `CameraScreen` syncs its discovered `agentBase` → `sessionStorage.booth_agent_base` — QR scanner uses this if set

**Key files:**
- `FrameSelectScreen.tsx` — contains `startScanner()` with DSLR branch
- `CameraScreen.tsx` — writes `booth_agent_base` to sessionStorage via `useEffect([agentBase])`

**Important — Mixed Content note**: `http://127.0.0.1:3002` is allowed from `https://studio.fremio.id` because browsers treat `127.0.0.1` (IP address localhost) as a "local network" exception — Mixed Content rules do not block HTTP requests to IP addresses from HTTPS pages. `localhost` (hostname) may fail in some browsers due to HTTPS resolution; use `127.0.0.1` always.



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

### VPS SSH Access (Key-Based, No Password)

> ✅ **WORKING**: SSH dengan unencrypted key `~/.ssh/fremio_deploy_nopass` — tanpa password!
> Jalankan dari PowerShell atau bash dengan OpenSSH.

```powershell
# Dari PowerShell Windows
& "C:\Windows\System32\OpenSSH\ssh.exe" -i "$HOME\.ssh\fremio_deploy_nopass" -o StrictHostKeyChecking=no root@76.13.192.32 "hostname"
# Output: srv1322058 ✅

# Dari bash (Git Bash / WSL)
/c/Windows/System32/OpenSSH/ssh.exe -i "/c/Users/A.r.r.a.y.19/.ssh/fremio_deploy_nopass" -o StrictHostKeyChecking=no root@76.13.192.32 "hostname"
```

**SSH Key Details:**
- File: `~/.ssh/fremio_deploy_nopass` (ed25519, unencrypted, no passphrase)
- Public key di VPS: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAhC0rXMUXzP3BZRray+5OQ6Iqua4y2Wx5gB+PlRTZ4z deploy-only`
- Path di VPS: `/root/.ssh/authorized_keys`
- Fingerprint: `SHA256:FAzcah3iVp/SkRCh18T9MlfkRLB6u+WaZwq5erKFUwM`

**Deploy Command Sequence (dari Claude Code bash):**
```bash
SSH_KEY="/c/Users/A.r.r.a.y.19/.ssh/fremio_deploy_nopass"
SSH_CMD="/c/Windows/System32/OpenSSH/ssh.exe"
VPS="root@76.13.192.32"

# 1. Git push dari lokal
rtk git add . && rtk git commit -m "msg" && rtk git push

# 2. Git pull di VPS
$SSH_CMD -i "$SSH_KEY" -o StrictHostKeyChecking=no $VPS "cd /root/fremio-studio/studio && git pull"

# 3. Build Next.js di VPS (3-10 menit)
$SSH_CMD -i "$SSH_KEY" -o StrictHostKeyChecking=no $VPS "cd /root/fremio-studio/studio && npm run build"

# 4. Restart PM2
$SSH_CMD -i "$SSH_KEY" -o StrictHostKeyChecking=no $VPS "pm2 restart fremio-studio"
```

**Troubleshooting authorized_keys:**
- Problem: Hostinger Hostinger concatenates keys without newlines (`#hostinger-managed-keysssh-ed25519`)
- Fix: Append correct entry dengan `echo "ssh-ed25519 ..." >> /root/.ssh/authorized_keys`
- Verify: `grep "fremio_deploy_nopass" ~/.ssh/authorized_keys` harus show satu baris ed25519 saja

### Script-Based Deploy (PowerShell)

```powershell
# Deploy script ada di studio/scripts/deploy-vps.ps1
& "C:\Users\A.r.r.a.y.19\fremio\studio\scripts\deploy-vps.ps1"
```

Script ini melakukan: SSH test → upload agent dist → git pull → build → pm2 restart.

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

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->