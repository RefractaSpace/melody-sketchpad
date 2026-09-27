// 멜로디 스케치패드 데스크톱 앱 (Electron)
// 화면·소리 엔진은 app/ 안에 들어 있고, 피아노 녹음과 곡 저장은 서버(melody-sketchpad.vercel.app)를 써요.
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#111111', title: '멜로디 스케치패드', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });   // 링크는 기본 브라우저로
}

app.whenReady().then(() => {
  // 마이크(녹음)·MIDI 건반·클립보드만 허락
  const allow = ['media', 'midi', 'midiSysex', 'clipboard-sanitized-write', 'clipboard-read'];
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allow.includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => allow.includes(perm));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
