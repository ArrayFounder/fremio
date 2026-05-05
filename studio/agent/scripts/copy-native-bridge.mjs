import fs from "node:fs";
import path from "node:path";

const agentRoot = process.cwd();
const publishDir = path.join(agentRoot, "native", "edsdk-bridge", "publish", "win-x64");
const sourceExe = path.join(publishDir, "edsdk-bridge-native.exe");
const targetExe = path.join(agentRoot, "bin", "edsdk-bridge-native.exe");

if (!fs.existsSync(sourceExe)) {
  console.error(`[copy-native-bridge] File tidak ditemukan: ${sourceExe}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetExe), { recursive: true });
fs.copyFileSync(sourceExe, targetExe);
console.log(`[copy-native-bridge] Copied ${sourceExe} -> ${targetExe}`);
