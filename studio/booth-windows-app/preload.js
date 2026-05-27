const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fremioBooth", {
  getConfig: () => ipcRenderer.invoke("booth:get-config"),
  saveConfig: (config) => ipcRenderer.invoke("booth:save-config", config),
  openSetup: () => ipcRenderer.invoke("booth:open-setup"),
  openLogin: () => ipcRenderer.invoke("booth:open-login"),
  launcherLogin: (payload) => ipcRenderer.invoke("launcher:login", payload),
  launcherGoogleLogin: (payload) => ipcRenderer.invoke("launcher:google-login", payload),
  launcherGetSession: () => ipcRenderer.invoke("launcher:get-session"),
  launcherLogout: () => ipcRenderer.invoke("launcher:logout"),
  reload: () => ipcRenderer.invoke("booth:reload"),
  getBridgeStatus: () => ipcRenderer.invoke("bridge:get-status"),
  restartBridge: () => ipcRenderer.invoke("bridge:restart"),
  // Agent proxy (bypass mixed-content from HTTPS page)
  agentStatus: () => ipcRenderer.invoke("agent:status"),
  agentCapture: () => ipcRenderer.invoke("agent:capture"),
  agentPreview: () => ipcRenderer.invoke("agent:preview"),
  agentPreviewStreamUrl: (cacheKey) => `fremio-agent://local/preview-stream?t=${encodeURIComponent(String(cacheKey || Date.now()))}`,
  agentPrint: (job) => ipcRenderer.invoke("agent:print", job),
  // Native FFmpeg video compositing (DSLR path — bypasses browser decode limits)
  composeVideoLive: (blobs, meta) => ipcRenderer.invoke("booth:compose-video-live", { blobs, meta }),
  isNativeVideoComposingSupported: () => true, // always available in Electron app
});
