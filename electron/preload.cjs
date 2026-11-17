'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pearlDesktop', {
  installUpdate: (url) => ipcRenderer.invoke('install-update', url),
  captureScreen: (options) => ipcRenderer.invoke('capture-screen', options),
});
