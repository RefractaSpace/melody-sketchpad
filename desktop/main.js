// 멜로디 스케치패드 데스크톱 앱 (Electron)
// 화면·소리 엔진은 app/ 안에, 피아노 녹음과 곡·계정은 서버(melody-sketchpad.vercel.app)를 써요.
const { app, BrowserWindow, Menu, dialog, session, shell, ipcMain } = require('electron');
const path = require('path'), fs = require('fs');
let win = null, pendingFile = null;

// 한 번만 실행: 두 번째로 켜면(예: .msk 파일 두 번 클릭) 이미 열린 창에서 그 파일을 열어요
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
const mskArg = argv => argv.find(a => /\.msk$/i.test(a) && fs.existsSync(a));
function openFile(p) { if (!p) return; if (win && win.webContents && !win.webContents.isLoading()) sendFile(p); else pendingFile = p; }
function sendFile(p) { try { win.webContents.send('open-file', {name:path.basename(p), data:fs.readFileSync(p)}); if (win.isMinimized()) win.restore(); win.focus(); } catch (e) {} }
app.on('second-instance', (e, argv) => openFile(mskArg(argv)));

// 창 크기·위치 기억
const statePath = () => path.join(app.getPath('userData'), 'window.json');
const loadState = () => { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (e) { return {width:1440, height:900}; } };
const saveState = () => { if (!win || win.isDestroyed()) return; try { fs.writeFileSync(statePath(), JSON.stringify({...win.getNormalBounds(), max:win.isMaximized()})); } catch (e) {} };

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    x:st.x, y:st.y, width:st.width || 1440, height:st.height || 900, minWidth:900, minHeight:600, backgroundColor:'#111111', title:'멜로디 스케치패드', show:false,
    icon:path.join(__dirname, 'icon.png'), webPreferences:{contextIsolation:true, sandbox:true, preload:path.join(__dirname, 'preload.js')}
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.on('did-finish-load', () => { const f = pendingFile || mskArg(process.argv); pendingFile = null; if (f) sendFile(f); });
  win.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url); return {action:'deny'}; });   // 링크는 기본 브라우저로
  win.on('close', saveState);
}
// 메뉴: 화면 안의 버튼을 눌러 주는 방식 (웹과 같은 동작)
const click = id => () => win && win.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)})?.click()`);
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'파일', submenu:[
      {label:'새 곡', accelerator:'CmdOrCtrl+N', click:click('clear')},
      {label:'열기…', accelerator:'CmdOrCtrl+O', click:async () => { const r = await dialog.showOpenDialog(win, {filters:[{name:'멜로디 스케치패드 곡', extensions:['msk', 'mid', 'midi', 'txt', 'json']}], properties:['openFile']}); if (!r.canceled && r.filePaths[0]) sendFile(r.filePaths[0]); }},
      {label:'저장 (.msk)', accelerator:'CmdOrCtrl+S', click:click('saveProj')},
      {label:'파일 변환기', click:click('convBtn')}, {type:'separator'},
      {label:'계정 · 서버', click:click('cloudBtn')}, {type:'separator'}, {role:'quit', label:'끝내기'}]},
    {label:'보기', submenu:[{role:'zoomIn', label:'크게'}, {role:'zoomOut', label:'작게'}, {role:'resetZoom', label:'원래 크기'}, {type:'separator'}, {role:'togglefullscreen', label:'전체 화면'}, {role:'reload', label:'새로고침'}, {role:'toggleDevTools', label:'개발자 도구'}]},
    {label:'도움말', submenu:[
      {label:'웹사이트 열기', click:() => shell.openExternal('https://melody-sketchpad.vercel.app')},
      {label:'업데이트 확인', click:() => checkUpdate(true)},
      {label:`버전 ${app.getVersion()}`, enabled:false}]}
  ]));
}
// 자동 업데이트: GitHub 릴리스에 새 버전이 있으면 받아 두었다가 다음에 켤 때 설치
function checkUpdate(manual) {
  let au; try { au = require('electron-updater').autoUpdater; } catch (e) { if (manual) dialog.showMessageBox(win, {message:'업데이트 기능을 쓸 수 없어요.'}); return; }
  au.autoDownload = true;
  au.once('update-downloaded', i => dialog.showMessageBox(win, {type:'info', buttons:['지금 다시 시작', '나중에'], message:`새 버전 ${i.version}을 받았어요.`, detail:'다시 시작하면 설치돼요.'}).then(r => { if (r.response === 0) au.quitAndInstall(); }));
  if (manual) au.once('update-not-available', () => dialog.showMessageBox(win, {message:`최신 버전이에요 (${app.getVersion()}).`}));
  au.checkForUpdates().catch(e => { if (manual) dialog.showMessageBox(win, {type:'warning', message:'업데이트를 확인하지 못했어요.', detail:String(e.message || e)}); });
}

app.whenReady().then(() => {
  const allow = ['media', 'midi', 'midiSysex', 'clipboard-sanitized-write', 'clipboard-read'];   // 마이크·MIDI 건반·클립보드만
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allow.includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => allow.includes(perm));
  ipcMain.handle('app-info', () => ({version:app.getVersion(), platform:process.platform}));
  buildMenu(); createWindow();
  if (app.isPackaged) setTimeout(() => checkUpdate(false), 5000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('open-file', (e, p) => { e.preventDefault(); openFile(p); });   // macOS
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
