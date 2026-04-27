; Fremio Studio — custom NSIS hooks
; Dijalankan electron-builder saat membuat installer/uninstaller

; ─── Sebelum file diinstall ───────────────────────────────────────────────────
!macro customInstall
  ; Matikan proses lama jika ada (upgrade scenario)
  nsExec::ExecToLog 'taskkill /F /IM "Fremio Booth.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Fremio Studio.exe" /T'
  Sleep 1000
!macroend

; ─── Sebelum file dihapus saat uninstall ─────────────────────────────────────
!macro customUnInstall
  ; Matikan semua proses Fremio Studio sebelum hapus file
  ; Ini mencegah "file is open in another program" dan CRC mismatch
  nsExec::ExecToLog 'taskkill /F /IM "Fremio Booth.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Fremio Studio.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "electron.exe" /T'
  Sleep 1500
!macroend
