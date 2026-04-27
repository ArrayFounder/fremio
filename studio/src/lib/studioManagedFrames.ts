import fs from "node:fs/promises";
import path from "node:path";

export interface StudioManagedFramesConfig {
  enforceWhitelist: boolean;
  allowedFrameIds: string[];
  updatedAt: string;
}

const DEFAULT_CONFIG: StudioManagedFramesConfig = {
  enforceWhitelist: false,
  allowedFrameIds: [],
  updatedAt: new Date(0).toISOString(),
};

const getConfigPath = () =>
  path.join(process.cwd(), "uploads", "studio-managed-frames.json");

const normalizeConfig = (
  raw: Partial<StudioManagedFramesConfig> | null | undefined
): StudioManagedFramesConfig => {
  const allowedFrameIds = Array.isArray(raw?.allowedFrameIds)
    ? Array.from(new Set(raw.allowedFrameIds.map((v) => String(v).trim()).filter(Boolean)))
    : [];

  return {
    enforceWhitelist: !!raw?.enforceWhitelist,
    allowedFrameIds,
    updatedAt:
      typeof raw?.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
  };
};

export async function getStudioManagedFramesConfig(): Promise<StudioManagedFramesConfig> {
  const filePath = getConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StudioManagedFramesConfig>;
    return normalizeConfig(parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveStudioManagedFramesConfig(
  next: Partial<StudioManagedFramesConfig>
): Promise<StudioManagedFramesConfig> {
  const filePath = getConfigPath();
  const dirPath = path.dirname(filePath);

  await fs.mkdir(dirPath, { recursive: true });

  const current = await getStudioManagedFramesConfig();
  const normalized = normalizeConfig({
    ...current,
    ...next,
    updatedAt: new Date().toISOString(),
  });

  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
