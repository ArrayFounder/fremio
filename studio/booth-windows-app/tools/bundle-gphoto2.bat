@echo off
REM ════════════════════════════════════════════════════════════════════════════
REM bundle-gphoto2.bat — Run inside MSYS2 UCRT64 terminal to copy gphoto2 + all
REM                       dependencies into the Electron app tools folder.
REM ════════════════════════════════════════════════════════════════════════════

echo === Fremio Studio — Bundle gphoto2 for Windows ===
echo.

REM Detect project root (assumes this script lives in tools/)
set SCRIPT_DIR=%~dp0
set TOOLS_DIR=%SCRIPT_DIR:~0,-1%
set PROJECT_DIR=%TOOLS_DIR%\..
set DEST_DIR=%TOOLS_DIR%\gphoto2

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

REM 1. Ensure gphoto2 is installed via pacman
where gphoto2 >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Installing gphoto2 via pacman...
    pacman -S --noconfirm mingw-w64-ucrt-x86_64-gphoto2
)

REM 2. Copy gphoto2.exe + all DLLs it depends on
set SOURCE_DIR=/ucrt64/bin

echo Copying gphoto2.exe and dependencies...
copy "%SOURCE_DIR%\gphoto2.exe" "%DEST_DIR%\gphoto2.exe"

REM Use ldd to find all dependent DLLs and copy them
for /f "tokens=*" %%a in ('ldd "%SOURCE_DIR%\gphoto2.exe" ^| grep -i "ucrt64" ^| awk "{print $3}"') do (
    copy "%%a" "%DEST_DIR%\"
)

REM Also copy libgphoto2 helper libs (camlibs + port drivers)
if exist "%SOURCE_DIR%\libgphoto2" (
    xcopy /E /I /Y "%SOURCE_DIR%\libgphoto2" "%DEST_DIR%\libgphoto2"
)
if exist "%SOURCE_DIR%\libgphoto2_port" (
    xcopy /E /I /Y "%SOURCE_DIR%\libgphoto2_port" "%DEST_DIR%\libgphoto2_port"
)

echo.
echo Done! gphoto2 bundled to:
echo   %DEST_DIR%
echo.
pause
