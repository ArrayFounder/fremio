import sys
sys.stdout.reconfigure(encoding='utf-8')
import paramiko, time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('76.13.192.32', port=22, username='root', password='#Salwaputri111103', timeout=15)

# Simple check: does .env have Google creds?
stdin, stdout, stderr = client.exec_command('grep GOOGLE /root/fremio/backend/.env')
stdout.channel.recv_exit_status()
print("=== .env Google vars ===")
print(stdout.read().decode('utf-8', errors='replace').strip())

time.sleep(1)

# Kill and restart backend
stdin2, stdout2, stderr2 = client.exec_command('kill $(cat /tmp/backend.pid 2>/dev/null) 2>/dev/null; fuser -k 5050/tcp 2>/dev/null; sleep 1; echo killed')
stdout2.channel.recv_exit_status()
print(stdout2.read().decode('utf-8', errors='replace').strip())

time.sleep(1)

# Start backend
stdin3, stdout3, stderr3 = client.exec_command('cd /root/fremio/backend && nohup node server.js >> /tmp/backend.log 2>&1 & echo $! > /tmp/backend.pid && echo "Started PID $(cat /tmp/backend.pid)"')
stdout3.channel.recv_exit_status()
print(stdout3.read().decode('utf-8', errors='replace').strip())

client.close()
print("Done")
