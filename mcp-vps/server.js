import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const KEY_PATH = path.resolve(__dirname, "..", "github-actions-key");
if (!existsSync(KEY_PATH)) {
  process.stderr.write(`[mcp-vps] ERROR: SSH key not found at ${KEY_PATH}\n`);
  process.exit(1);
}

const VPS_CONFIG = {
  host: "76.13.192.32",
  port: 22,
  username: "root",
  privateKey: readFileSync(KEY_PATH),
  readyTimeout: 20000,
};

function sshExec(command, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`Command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
        stream.on("close", (code) => {
          clearTimeout(timer);
          conn.end();
          resolve({ code, stdout, stderr });
        });
        stream.on("data", (d) => { stdout += d.toString(); });
        stream.stderr.on("data", (d) => { stderr += d.toString(); });
      });
    });
    conn.on("error", (err) => { clearTimeout(timer); reject(err); });
    conn.connect(VPS_CONFIG);
  });
}

const server = new Server(
  { name: "fremio-vps", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "vps_exec",
      description:
        "Run any shell command on Fremio VPS (root@76.13.192.32). " +
        "Use for: deployment (git pull, npm build, pm2 restart), " +
        "checking logs (pm2 logs), file management, service status, etc. " +
        "Timeout: 5 minutes for long builds.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute on the VPS"
          }
        },
        required: ["command"]
      }
    },
    {
      name: "vps_deploy",
      description:
        "Full deploy of fremio-studio to VPS: git pull → npm install → build → pm2 restart. " +
        "Takes 3-5 minutes. Use this when code changes are pushed to GitHub main.",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "vps_exec") {
    try {
      const result = await sshExec(args.command);
      const out = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return {
        content: [{ type: "text", text: out || "(no output, exit code: " + result.code + ")" }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `SSH Error: ${err.message}` }],
        isError: true
      };
    }
  }

  if (name === "vps_deploy") {
    const cmd = [
      "cd /root/fremio-studio",
      "git pull origin main",
      "cd studio",
      "npm install --legacy-peer-deps",
      "npm run build",
      "pm2 restart fremio-studio",
      "echo \"=== DEPLOY DONE ==="
    ].join(" && ");
    try {
      const result = await sshExec(cmd, 600000);
      const out = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return {
        content: [{ type: "text", text: out || "Deploy completed" }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Deploy error: ${err.message}` }],
        isError: true
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
