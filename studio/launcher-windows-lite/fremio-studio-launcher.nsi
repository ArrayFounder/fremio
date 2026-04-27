Unicode true
Name "Fremio Studio Launcher"
OutFile "fremio-studio-launcher.exe"
RequestExecutionLevel user
XPStyle on
BrandingText "Fremio Studio"
Icon "icon.ico"

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Var Dialog
Var StartBtn

Function .onInit
  SetSilent silent
FunctionEnd

Function WelcomePageCreate
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "Welcome, Photobox Owner"
  Pop $0

  ${NSD_CreateLabel} 0 18u 100% 24u "Launcher ini diperlukan untuk koneksi kamera dan printer.\r\nKlik Mulai lalu biarkan launcher tetap terbuka selama sesi."
  Pop $1

  ${NSD_CreateLabel} 0 48u 100% 24u "1. Klik Mulai Fremio Studio\r\n2. Buka link booth kamu"
  Pop $2

  ${NSD_CreateButton} 32% 80u 36% 14u "Mulai Fremio Studio"
  Pop $StartBtn
  ${NSD_OnClick} $StartBtn StartBridge

  nsDialogs::Show
FunctionEnd

Function StartBridge
  EnableWindow $StartBtn 0

  CreateDirectory "$LOCALAPPDATA\\FremioStudio"

  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference=''Stop''; $dir=Join-Path $env:LOCALAPPDATA ''FremioStudio''; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $exe=Join-Path $dir ''fremio-agent-win.exe''; $tmp=Join-Path $dir ''fremio-agent-win.download''; Invoke-WebRequest -Uri ''https://studio.fremio.id/downloads/fremio-agent-win.exe'' -OutFile $tmp -UseBasicParsing; $bytes=[System.IO.File]::ReadAllBytes($tmp); if ($bytes.Length -lt 2 -or $bytes[0] -ne 77 -or $bytes[1] -ne 90) { throw ''Downloaded file bukan executable Windows yang valid.'' }; Move-Item -Force -Path $tmp -Destination $exe; Start-Process -FilePath $exe -WindowStyle Hidden; Write-Output ''OK''"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Gagal download bridge. Cek koneksi internet lalu coba lagi."
    EnableWindow $StartBtn 1
    Return
  ${EndIf}

  MessageBox MB_ICONINFORMATION "Fremio Studio berjalan. Jangan close launcher selama sesi photobox aktif."
  Quit
FunctionEnd

Function WelcomePageLeave
FunctionEnd

Page custom WelcomePageCreate WelcomePageLeave

Section
SectionEnd
