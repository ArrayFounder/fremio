import paramiko
import sys
import os

# SSH Configuration
SERVER = "76.13.192.32"
USERNAME = "root"
PASSWORD = "#Salwaputri111103"
PORT = 22

# Public key content
PUBLIC_KEY = """ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKpdC2+vn4bn6giGXqVYnh6D2JLtxLaI0A6UfTaAvihT fremio-deploy-key"""

def main():
    print("="*50)
    print("  FREMIO STUDIO DEPLOYMENT")
    print("="*50)
    
    # Step 1: Connect and add SSH key
    print("\n[1/4] Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(SERVER, port=PORT, username=USERNAME, password=PASSWORD)
        print("  Connected!")
    except Exception as e:
        print(f"  ERROR: {e}")
        sys.exit(1)
    
    # Step 2: Add public key to authorized_keys
    print("\n[2/4] Adding SSH public key to server...")
    stdin, stdout, stderr = client.exec_command(
        f'mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "{PUBLIC_KEY}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
    )
    result = stdout.read().decode()
    error = stderr.read().decode()
    if error:
        print(f"  Warning: {error}")
    else:
        print("  SSH key added!")
    
    # Step 3: Check server status
    print("\n[3/4] Checking server status...")
    stdin, stdout, stderr = client.exec_command('pm2 status')
    print("  " + stdout.read().decode().replace('\n', '\n  '))
    
    client.close()
    print("\n  SSH key configured successfully!")
    print("\n" + "="*50)
    print("  SSH key has been added to the server.")
    print("  You can now deploy without password!")
    print("="*50)

if __name__ == "__main__":
    main()
