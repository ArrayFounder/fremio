#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fremio Studio Deploy Script
Easy deployment with password authentication (no sshpass needed)

Usage:
    python deploy-studio.py                    # Interactive password prompt
    python deploy-studio.py PASSWORD           # Use password as argument
    FREMIO_SSH_PASSWORD=xxx python deploy-studio.py  # Use env variable
"""

import os
import sys
import io

# Fix Unicode output on Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

import subprocess
import tarfile
import re

# Configuration
SERVER = "root@76.13.192.32"
REMOTE_PATH = "/root/fremio-studio"
LOCAL_PATH = "./studio"
SSH_KEY = os.path.expanduser("~/.ssh/fremio_deploy")

def log(msg):
    """Print log message"""
    print(msg)

def run_command(cmd, capture=True):
    """Run shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=capture, text=True, timeout=30)
        return result.stdout.strip(), result.returncode == 0
    except Exception as e:
        return str(e), False

def try_ssh_key():
    """Test if SSH key works"""
    log("   Testing SSH key...")
    cmd = f'ssh -i "{SSH_KEY}" -o IdentitiesOnly=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no {SERVER} "echo connected"'
    _, success = run_command(cmd, capture=True)
    return success

import tempfile

def upload_with_key():
    """Upload using SSH key"""
    log("   Using SSH key...")

    # Create tar file locally first
    tar_path = os.path.join(tempfile.gettempdir(), 'fremio-studio-deploy.tar.gz')
    with tarfile.open(tar_path, mode='w:gz') as tar:
        for root, dirs, files in os.walk(LOCAL_PATH):
            dirs[:] = [d for d in dirs if d not in [
                'node_modules', '.next/cache', '.git', 'uploads'
            ] and not d.startswith('.env')]
            for file in files:
                if any(file == f for f in ['.env', '.env.production', '.env.local']):
                    continue
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, LOCAL_PATH)
                tar.add(filepath, arcname=arcname)

    log(f"   Tar created: {os.path.getsize(tar_path) // 1024}KB")

    # Upload via SCP
    cmd = f'scp -i "{SSH_KEY}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no "{tar_path}" {SERVER}:/tmp/fremio-studio-deploy.tar.gz'
    result = subprocess.run(cmd, shell=True, capture_output=True)
    if result.returncode != 0:
        log(f"   SCP error: {result.stderr.decode()}")
        return False

    log("   Tar uploaded, extracting on server...")
    # Extract on server
    cmd2 = f'ssh -i "{SSH_KEY}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no {SERVER} "mkdir -p {REMOTE_PATH} && tar -xzf /tmp/fremio-studio-deploy.tar.gz -C {REMOTE_PATH} && rm /tmp/fremio-studio-deploy.tar.gz"'
    result2 = subprocess.run(cmd2, shell=True, capture_output=True)
    if result2.returncode != 0:
        log(f"   Extract error: {result2.stderr.decode()}")
        return False

    # Cleanup local tar
    os.remove(tar_path)
    return True

def upload_with_password(password):
    """Upload using password via SSH"""
    log("   Using password...")
    try:
        import paramiko

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        host = SERVER.split('@')[1] if '@' in SERVER else SERVER
        user = SERVER.split('@')[0] if '@' in SERVER else 'root'

        log(f"   Connecting to {SERVER}...")
        client.connect(
            host,
            username=user,
            password=password,
            timeout=60,
            look_for_keys=False,
            allow_agent=False
        )

        # Create tar file locally
        tar_path = os.path.join(tempfile.gettempdir(), 'fremio-studio-deploy.tar.gz')
        log("   Creating tar archive...")
        with tarfile.open(tar_path, mode='w:gz') as tar:
            for root, dirs, files in os.walk(LOCAL_PATH):
                dirs[:] = [d for d in dirs if d not in [
                    'node_modules', '.next/cache', '.git', 'uploads'
                ] and not d.startswith('.env')]
                for file in files:
                    if any(file == f for f in ['.env', '.env.production', '.env.local']):
                        continue
                    filepath = os.path.join(root, file)
                    arcname = os.path.relpath(filepath, LOCAL_PATH)
                    tar.add(filepath, arcname=arcname)

        log(f"   Tar created: {os.path.getsize(tar_path) // 1024}KB")

        # Upload via SFTP
        log("   Uploading files...")
        sftp = client.open_sftp()
        sftp.put(tar_path, '/tmp/fremio-studio-deploy.tar.gz')
        sftp.close()
        os.remove(tar_path)

        log("   Extracting on server...")
        stdin, stdout, stderr = client.exec_command(f"mkdir -p {REMOTE_PATH} && tar -xzf /tmp/fremio-studio-deploy.tar.gz -C {REMOTE_PATH} && rm /tmp/fremio-studio-deploy.tar.gz")
        output = stdout.read().decode()
        error = stderr.read().decode()
        if error:
            log(f"   Extract warning: {error[:200]}")

        client.close()
        log("   Upload complete")
        return True

    except ImportError:
        log("   paramiko not available")
        return False
    except Exception as e:
        log(f"   Error: {e}")
        return False

def run_remote_commands(use_password=False, password=None):
    """Run commands on remote server"""
    commands = [
        "cd /root/fremio-studio",
        "npm install --production",
        # Copy env file temporarily for Prisma CLI
        "if [ -f .env.production.local ]; then cp .env.production.local .env.prisma_tmp && mv .env.prisma_tmp .env; fi",
        "npx prisma generate",
        # Fallback to db push if no migrations
        "if [ -d prisma/migrations ] && find prisma/migrations -name migration.sql -print -quit | grep -q .; then npx prisma migrate deploy; else echo 'Fallback to db push'; npx prisma db push; fi",
        # Ensure slugUpdatedAt column exists
        'cat << \'SQL\' | npx prisma db execute --stdin --schema prisma/schema.prisma\nALTER TABLE "booth_configs" ADD COLUMN IF NOT EXISTS "slugUpdatedAt" TIMESTAMP(3);\nSQL',
        # Sync agent download files
        "mkdir -p /var/www/fremio/downloads",
        "cp -f /root/fremio-studio/public/downloads/fremio-agent-win.exe /var/www/fremio/downloads/fremio-agent-win.exe 2>/dev/null || true",
        "cp -f /root/fremio-studio/public/downloads/fremio-agent-win-bundle.zip /var/www/fremio/downloads/fremio-agent-win-bundle.zip 2>/dev/null || true",
        "cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-arm64 /var/www/fremio/downloads/fremio-agent-mac-arm64 2>/dev/null || true",
        "cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-x64 /var/www/fremio/downloads/fremio-agent-mac-x64 2>/dev/null || true",
        "pm2 restart fremio-studio || pm2 start npm --name fremio-studio -- start",
        "pm2 save",
        "echo Server restarted successfully"
    ]

    if use_password:
        import paramiko
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            host = SERVER.split('@')[1] if '@' in SERVER else SERVER
            user = SERVER.split('@')[0] if '@' in SERVER else 'root'

            client.connect(host, username=user, password=password, timeout=30,
                          look_for_keys=False, allow_agent=False)

            for cmd in commands:
                log(f"   Running: {cmd[:50]}...")
                stdin, stdout, stderr = client.exec_command(cmd)
                output = stdout.read().decode()
                error = stderr.read().decode()
                if output:
                    log(f"      {output}")
                if error and 'warning' not in error.lower() and 'deprecated' not in error.lower():
                    log(f"      Error: {error[:200]}")

            client.close()
            log("   Remote commands complete")
            return True

        except Exception as e:
            log(f"   Error: {e}")
            return False
    else:
        cmd = f'ssh -i "{SSH_KEY}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no {SERVER}'
        full_script = '\n'.join(commands)
        result = subprocess.run(cmd, shell=True, input=full_script.encode(), capture_output=False)
        return result == 0

def main():
    log("=" * 50)
    log("  FREMIO STUDIO DEPLOY SCRIPT")
    log("=" * 50)
    log("")

    # Get password from args or environment
    password = None
    if len(sys.argv) > 1:
        password = sys.argv[1]
    elif os.getenv('FREMIO_SSH_PASSWORD'):
        password = os.getenv('FREMIO_SSH_PASSWORD')

    # Step 1: Build
    log("[1/3] Building fremio-studio...")
    script_dir = os.path.dirname(os.path.abspath(__file__)) or '.'
    os.chdir(script_dir)
    os.chdir(LOCAL_PATH)

    # Use shell=True to find npm in PATH on Windows
    result = subprocess.run('npm run build', shell=True, capture_output=False)
    os.chdir('..')

    if result.returncode != 0:
        log("Build failed!")
        sys.exit(1)
    log("Build complete")
    log("")

    # Step 2: Upload
    log("[2/3] Uploading to VPS...")

    # Try SSH key first
    use_password = False

    if try_ssh_key():
        log("   SSH key works!")
        upload_with_key()
    elif password:
        log("   SSH key failed, trying password...")
        if upload_with_password(password):
            use_password = True
        else:
            log("Both SSH key and password failed!")
            sys.exit(1)
    else:
        # Interactive password prompt
        try:
            import getpass
            password = getpass.getpass("Enter SSH password: ")
            if upload_with_password(password):
                use_password = True
            else:
                log("Password authentication failed!")
                sys.exit(1)
        except EOFError:
            pass

    log("Upload complete")
    log("")

    # Step 3: Install and restart
    log("[3/3] Installing dependencies and restarting on server...")
    run_remote_commands(use_password=use_password, password=password)

    log("")
    log("=" * 50)
    log("DEPLOYMENT COMPLETE!")
    log("Visit: https://studio.fremio.id")
    log("=" * 50)

if __name__ == "__main__":
    main()