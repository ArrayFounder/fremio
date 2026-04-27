// safeStorage stub — simple localStorage wrapper for studio
const isAvail = () => {
  if (typeof window === "undefined") return false;
  try { localStorage.setItem("__t__","1"); localStorage.removeItem("__t__"); return true; }
  catch { return false; }
};
const ok = isAvail();

const safeStorage = {
  getItem(key, def = null) {
    if (!ok) return def;
    try { const v = localStorage.getItem(key); return v !== null ? v : def; } catch { return def; }
  },
  setItem(key, value) {
    if (!ok) return false;
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
  removeItem(key) {
    if (!ok) return false;
    try { localStorage.removeItem(key); return true; } catch { return false; }
  },
  getJSON(key, def = null) {
    if (!ok) return def;
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  setJSON(key, value) {
    if (!ok) return false;
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  isAvailable() { return ok; },
  estimateJSONBytes(value) { try { return JSON.stringify(value).length * 2; } catch { return 0; } },
};

export default safeStorage;
