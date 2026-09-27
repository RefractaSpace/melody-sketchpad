// 화면(app/)이 쓸 수 있는 데스크톱 기능만 좁게 열어 줌
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mskDesktop', {
  onOpenFile: cb => ipcRenderer.on('open-file', (e, f) => cb(f.name, new Uint8Array(f.data))),
  info: () => ipcRenderer.invoke('app-info')
});
