'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pearlDesktop', {
  installUpdate: (url) => ipcRenderer.invoke('install-update', url),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
});
