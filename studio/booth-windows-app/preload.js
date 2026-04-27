const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fremioBooth", {
  getConfig: () => ipcRenderer.invoke("booth:get-config"),
  saveConfig: (config) => ipcRenderer.invoke("booth:save-config", config),
  openSetup: () => ipcRenderer.invoke("booth:open-setup"),
  reload: () => ipcRenderer.invoke("booth:reload"),
});
