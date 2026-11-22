'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pearlDesktop', {
  installUpdate: (url) => ipcRenderer.invoke('install-update', url),
  captureScreen: (options) => ipcRenderer.invoke('capture-screen', options),
  setDesktopSettings: (options) => ipcRenderer.invoke('set-desktop-settings', options),
  getDesktopSettings: () => ipcRenderer.invoke('get-desktop-settings'),
});
