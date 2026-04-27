# Fremio Studio Windows Launcher (Lite)

Launcher ini menggantikan versi Electron agar file download tetap ringan dan cepat terbuka.

## Output

- `public/downloads/fremio-studio-launcher.exe`

## Build (one command)

Jalankan dari folder `studio`:

```bash
npm run launcher:build:win-lite
```

Script akan:

1. Build native wrapper via MinGW (startup lebih cepat)
2. Fallback ke NSIS bila MinGW tidak tersedia
2. Menyalin hasil build ke `public/downloads/fremio-studio-launcher.exe`

## Requirement

Disarankan pakai MinGW untuk hasil startup paling cepat.

- Ubuntu/Debian: `sudo apt-get install -y mingw-w64`

Fallback:

- Ubuntu/Debian: `sudo apt-get install -y nsis`
- macOS (Homebrew): `brew install makensis`
