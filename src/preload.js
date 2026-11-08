const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('notes:load'),
  save: (notes) => ipcRenderer.invoke('notes:save', notes),
  saveSync: (notes) => ipcRenderer.sendSync('notes:saveSync', notes)
});
