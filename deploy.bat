@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo ========================================
echo   DEPLOY FREMIO STUDIO
echo ========================================
echo.

set SERVER=root@76.13.192.32
set REMOTE_PATH=/root/fremio-studio
set LOCAL_PATH=studio
set TARFILE=%TEMP%\fremio-studio-deploy.tar.gz
set CTRLSOCK=%TEMP%\ssh-deploy-master.sock

REM Step 1: Build
echo [1/5] Building...
cd %LOCAL_PATH%
call npm run build
cd ..
if errorlevel 1 (
  echo Build failed!
  exit /b 1
)
echo     OK
echo.

REM Step 2: Create archive
echo [2/5] Creating archive...
if exist %TARFILE% del %TARFILE%
"C:\Program Files\Git\bin\tar.exe" -czf %TARFILE% --exclude=node_modules --exclude=.next/cache --exclude=.env --exclude=.env.production --exclude=.env.local --exclude=.env.production.local --exclude=uploads --exclude=.git --exclude=.gitignore -C %LOCAL_PATH% .
if errorlevel 1 (
  echo Archive failed!
  exit /b 1
)
echo     OK
echo.

REM Step 3: Open SSH ControlMaster (type password when prompted)
echo [3/5] Connecting to server...
echo     NOTE: Type your password when prompted
echo.
ssh -o StrictHostKeyChecking=no -o ControlMaster=yes -o "ControlPath=%CTRLSOCK%" -o ControlPersist=10m %SERVER% "echo Connected" 2>&1
if errorlevel 1 (
  echo SSH connection failed!
  exit /b 1
)
echo     OK
echo.

REM Step 4: Upload
echo [4/5] Uploading...
scp -o "ControlPath=%CTRLSOCK%" %TARFILE% %SERVER%:%REMOTE_PATH%.tar.gz 2>&1
if errorlevel 1 (
  echo Upload failed!
  ssh -o "ControlPath=%CTRLSOCK%" -O exit %SERVER% 2>nul
  exit /b 1
)
echo     OK
echo.

REM Step 5: Run remote commands
echo [5/5] Running remote install...
ssh -o "ControlPath=%CTRLSOCK%" %SERVER% "bash -s" ^< deploy-remote.sh 2>&1
if errorlevel 1 (
  echo Remote commands had errors!
)
echo     OK
echo.

REM Cleanup
echo [Cleanup] Closing connection...
ssh -o "ControlPath=%CTRLSOCK%" -O exit %SERVER% 2>nul
if exist %CTRLSOCK% del %CTRLSOCK% 2>nul
if exist %TARFILE% del %TARFILE% 2>nul

echo ========================================
echo   DEPLOYMENT COMPLETE
echo ========================================
echo   https://studio.fremio.id
echo.
pause
