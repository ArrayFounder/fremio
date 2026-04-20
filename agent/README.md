# Fremio Local Agent

HTTP bridge yang menghubungkan browser booth (Chrome) ke hardware lokal — kamera DSLR via **gphoto2** dan printer via **CUPS** (Mac/Linux) atau **PowerShell** (Windows).

Berjalan di latar belakang di komputer booth pada `http://localhost:7432`.

---

## Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| `GET` | `/status` | Cek kamera & printer yang terdeteksi |
| `POST` | `/capture` | Ambil foto dari DSLR, return base64 JPEG |
| `POST` | `/print` | Cetak gambar base64 ke printer |

### GET /status — response contoh
```json
{
  "ok": true,
  "agent": { "version": "1.0.0", "platform": "darwin", "uptime": 42.3 },
  "camera": {
    "available": true,
    "count": 1,
    "cameras": [{ "model": "Canon EOS 600D", "port": "usb:001,007" }]
  },
  "printer": {
    "available": true,
    "count": 2,
    "printers": [{ "name": "EPSON_L805", "isDefault": true }, { "name": "Canon_PIXMA", "isDefault": false }],
    "defaultPrinter": "EPSON_L805"
  }
}
```

### POST /capture — request body (opsional)
```json
{ "keepOnCamera": false }
```
Response:
```json
{
  "ok": true,
  "image": { "base64": "...", "mimeType": "image/jpeg", "size": 4194304, "elapsedMs": 1823 }
}
```

### POST /print — request body
```json
{
  "image": "<base64 JPEG>",
  "printerName": "EPSON_L805",
  "copies": 1
}
```
Response:
```json
{ "ok": true, "message": "Job dikirim ke printer \"EPSON_L805\"", "elapsedMs": 340 }
```

---

## Instalasi — macOS

### 1. Install Node.js ≥ 18

```bash
# Lewat Homebrew (disarankan)
brew install node
node --version   # harus >= 18.0.0
```

Atau download installer dari https://nodejs.org/

### 2. Install gphoto2

```bash
brew install gphoto2
gphoto2 --version   # verifikasi
```

> **Troubleshooting kamera di Mac:**
> macOS punya daemon `PTPCamera` yang otomatis mengklaim kamera DSLR via USB.
> Sebelum menjalankan `/capture`, matikan daemon ini:
> ```bash
> sudo killall PTPCamera
> ```
> Atau buat launch agent agar otomatis dimatikan saat boot (lihat bagian "Autostart").

### 3. Siapkan kamera

1. Nyalakan kamera
2. Set mode koneksi USB ke **PTP** / **PC Remote** (bukan MTP atau Mass Storage)
   - Canon: Menu → Communication → PC Connection → PTP
   - Nikon: Setup Menu → USB → PTP
3. Colok ke Mac via USB
4. Verifikasi: `gphoto2 --auto-detect`

### 4. Verifikasi printer

```bash
lpstat -a        # list printer yang terdaftar
lpstat -d        # cek printer default
```

Jika printer belum terdaftar, tambahkan lewat **System Settings → Printers & Scanners**.

### 5. Install dan jalankan agent

```bash
cd /path/to/fremio/agent
cp .env.example .env
# Edit .env jika perlu ganti port atau printer default

npm install
npm start
```

Output sukses:
```
2026-04-06T10:00:00.000Z [INFO]  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2026-04-06T10:00:00.000Z [INFO]  Fremio Local Agent v1.0.0 running
2026-04-06T10:00:00.000Z [INFO]  URL  : http://localhost:7432
```

Test: `curl http://localhost:7432/status`

---

### Autostart di Mac (launchctl)

Buat file `/Library/LaunchDaemons/id.fremio.agent.plist` (jalankan sebagai root):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>id.fremio.agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/fremio/agent/src/index.js</string>
  </array>

  <!-- Matikan PTPCamera agar gphoto2 bisa akses kamera -->
  <key>LaunchOnlyOnce</key>
  <false/>
  <key>KeepAlive</key>
  <true/>

  <key>WorkingDirectory</key>
  <string>/path/to/fremio/agent</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>7432</string>
    <key>LOG_LEVEL</key>
    <string>info</string>
  </dict>

  <key>StandardOutPath</key>
  <string>/var/log/fremio-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/fremio-agent-error.log</string>
</dict>
</plist>
```

```bash
# Ganti /path/to/fremio sesuai path aktual
sudo launchctl load /Library/LaunchDaemons/id.fremio.agent.plist
sudo launchctl start id.fremio.agent

# Stop
sudo launchctl stop id.fremio.agent

# Lihat log
tail -f /var/log/fremio-agent.log
```

> Agar `killall PTPCamera` otomatis saat boot, tambahkan LaunchDaemon terpisah atau masukkan sebagai `UserName` + `Program` di plist yang sama.

---

## Instalasi — Windows

### Catatan Platform

| Fitur | Support |
|-------|---------|
| 🖨️ Print (CUPS via PowerShell) | ✅ Full support |
| 📷 DSLR via gphoto2 | ⚠️ Butuh MSYS2 (lihat di bawah) |
| 📷 Webcam via browser | ✅ Native Chrome (tanpa agent) |

Untuk sebagian booth Windows, webcam mode di Chrome sudah cukup tanpa gphoto2.

### 1. Install Node.js ≥ 18

Download dari https://nodejs.org/ (pilih LTS).

Verifikasi di Command Prompt:
```cmd
node --version
npm --version
```

### 2. Install gphoto2 via MSYS2 (untuk DSLR)

Jika tidak perlu DSLR (cukup webcam), lewati langkah ini.

1. Download dan install **MSYS2** dari https://www.msys2.org/
2. Buka **MSYS2 MinGW 64-bit** shell
3. Update dan install:
   ```bash
   pacman -Syu
   pacman -S mingw-w64-x86_64-libgphoto2 mingw-w64-x86_64-gphoto2
   ```
4. Tambahkan ke PATH Windows: `C:\msys64\mingw64\bin`
5. Verifikasi di Command Prompt baru:
   ```cmd
   gphoto2 --version
   gphoto2 --auto-detect
   ```

> **Driver USB kamera di Windows:**
> Windows menggunakan WIA driver bawaan yang bentrok dengan libgphoto2.
> Gunakan **Zadig** (https://zadig.akeo.ie/) untuk mengganti driver kamera ke **WinUSB** atau **libusb-win32**.
> ⚠️ Ini akan menonaktifkan integrasi kamera dengan Windows Photos/Explorer.

### 3. Konfigurasi PowerShell (untuk print)

Buka PowerShell sebagai **Administrator**, jalankan sekali:
```powershell
Set-ExecutionPolicy RemoteSigned -Scope LocalMachine
```

Verifikasi printer tersedia:
```powershell
Get-Printer | Select-Object Name, Default
```

### 4. Install dan jalankan agent

Buka Command Prompt di folder agent:
```cmd
cd C:\path\to\fremio\agent
copy .env.example .env
rem Edit .env jika perlu

npm install
npm start
```

Test: buka browser → `http://localhost:7432/status`

---

### Autostart di Windows

**Opsi A — Task Scheduler (tanpa software tambahan)**

1. Buka **Task Scheduler** → Create Basic Task
2. Trigger: **At system startup**
3. Action: **Start a program**
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `C:\path\to\fremio\agent\src\index.js`
   - Start in: `C:\path\to\fremio\agent`
4. Centang "Run whether user is logged in or not"
5. Centang "Run with highest privileges"

**Opsi B — NSSM (Non-Sucking Service Manager)**

```cmd
# Download NSSM dari https://nssm.cc/
nssm install FremioAgent "C:\Program Files\nodejs\node.exe" "C:\path\to\fremio\agent\src\index.js"
nssm set FremioAgent AppDirectory "C:\path\to\fremio\agent"
nssm set FremioAgent AppStdout "C:\logs\fremio-agent.log"
nssm set FremioAgent AppStderr "C:\logs\fremio-agent-error.log"
nssm start FremioAgent
```

---

## Konfigurasi (.env)

| Variable | Default | Keterangan |
|----------|---------|-----------|
| `PORT` | `7432` | Port HTTP agen |
| `GPHOTO2_PATH` | `gphoto2` | Path lengkap ke executable gphoto2 |
| `DEFAULT_PRINTER` | *(kosong)* | Nama printer default; kosong = printer sistem default |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

Contoh `.env` dengan konfigurasi penuh:
```env
PORT=7432
GPHOTO2_PATH=/opt/homebrew/bin/gphoto2
DEFAULT_PRINTER=EPSON_L805
LOG_LEVEL=debug
```

---

## Troubleshooting

### Kamera tidak terdeteksi

```bash
# Cek apakah gphoto2 bisa menemukan kamera
gphoto2 --auto-detect

# Cek apakah ada proses yang mengklaim kamera (Mac)
lsof | grep -i ptpcamera
sudo killall PTPCamera

# Debug verbose
LOG_LEVEL=debug npm start
```

### Error "Could not claim the USB device" (Mac/Linux)

```bash
# Mac
sudo killall PTPCamera

# Linux — unmount gvfs
gvfs-mount -s gphoto2
# atau
gio mount -u gphoto2://...
```

### Printer tidak ditemukan (Mac/Linux)

```bash
# List semua printer
lpstat -a
lpstat -d        # printer default

# Test cetak manual
lpr -P EPSON_L805 test.jpg

# Restart CUPS
sudo launchctl restart org.cups.cupsd   # Mac
sudo systemctl restart cups             # Linux
```

### Printer tidak ditemukan (Windows)

```powershell
# List printer
Get-Printer | Select-Object Name, Default, PrinterStatus

# Test cetak manual di PowerShell
Start-Process -FilePath "C:\test.jpg" -Verb Print -Wait
```

### Port 7432 sudah dipakai

```bash
# Cek proses yang pakai port 7432
lsof -i :7432      # Mac/Linux
netstat -ano | findstr :7432   # Windows

# Ganti port di .env
PORT=7433
```

### Log level debug untuk troubleshoot hardware

```env
LOG_LEVEL=debug
```

Semua stdout/stderr dari gphoto2 dan lpr/PowerShell akan dicetak penuh ke terminal.
