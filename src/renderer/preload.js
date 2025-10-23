const { contextBridge, ipcRenderer } = require('electron');

/**
 * Safe bridge for renderer ↔ main IPC communication
 */
contextBridge.exposeInMainWorld('electronAPI', {
  chooseFolder: () => ipcRenderer.invoke('show-open-dialog'),
  toggleServer: (options) => ipcRenderer.invoke('toggle-server', options),
  startClone: (options) => ipcRenderer.invoke('start-clone', options),
  getCookies: (url) => ipcRenderer.invoke('get-cookies', url),
  analyzeStaticFiles: (options) => ipcRenderer.invoke('analyze-static-files', options),
  clearOutputFolder: (path) => ipcRenderer.invoke('clear-output-folder', path),
  clearSpecificFiles: (path, extensions) => ipcRenderer.invoke('clear-specific-files', path, extensions),
  onCloneProgress: (callback) => ipcRenderer.on('clone-progress', (_event, payload) => callback(payload))
});
