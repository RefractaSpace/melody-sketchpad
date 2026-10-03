/* 23-cloud.js — 서버에 곡 저장·열기 (/api/songs, 저장소 키) */
const CLOUD_API = (window.MSK_SERVER || '') + '/api/songs', AUTH_API = (window.MSK_SERVER || '') + '/api/auth', CK = 'msk-cloud-key', CA = 'msk-cloud-auto', AK = 'msk-auth';
// 로그인 정보 {token, username} — 30일 동안 유지 (서버가 서명한 토큰)
const authInfo = () => { try { return JSON.parse(lsGet(AK) || 'null'); } catch (e) { return null; } };
function setAuth(a) { lsSet(AK, a ? JSON.stringify(a) : ''); authUI();
  if (typeof fetchTier === 'function') { if (!a && typeof serverTier !== 'undefined') serverTier = null; fetchTier().then(() => { if (typeof applyTier === 'function') applyTier(); }); }   // 6: 로그인·로그아웃하면 등급 다시 확인
}
function authUI() { const a = authInfo(); $('authOut').hidden = !!a; $('authIn').hidden = !a; $('authName').textContent = a ? a.username + tMsg(' 계정으로 로그인됨') : ''; $('authMove').hidden = !(a && cloudKey()); $('cloudBtn').textContent = a ? a.username : tMsg('로그인'); }
async function authCall(action, body, token) {
  const r = await fetch(`${AUTH_API}?action=${action}`, {method:body ? 'POST' : 'GET', headers:{'content-type':'application/json', ...(token ? {authorization:'Bearer ' + token} : {})}, body:body ? JSON.stringify(body) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) {} if (!r.ok) throw Object.assign(new Error(j.message || j.error || 'HTTP ' + r.status), {status:r.status}); return j;
}
const cloudKey = () => lsGet(CK) || '';
function newCloudKey() { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function cloudFetch(q, opt = {}) {
  const a = authInfo(), useKey = opt.useKey, h = {...(opt.headers || {})}; if (a && !useKey) h.authorization = 'Bearer ' + a.token; else h['x-msk-key'] = cloudKey();
  const r = await fetch(CLOUD_API + q, {...opt, headers:h});
  if (r.status === 401 && a && !useKey) setAuth(null);   // 토큰이 만료되면 로그아웃 상태로
  if (!r.ok) { let m = 'HTTP ' + r.status; try { const j = await r.json(); m = j.message || j.error || m; } catch (e) {} throw Object.assign(new Error(m), {status:r.status}); }
  return r;
}
async function cloudUpload(quiet) {
  if (!authInfo() && !cloudKey()) lsSet(CK, newCloudKey());
  const u = await encodeMSK(S, lib.list[lib.current].name, await songSamples(S)), name = lib.list[lib.current].name;
  if (u.length > 4 * 1024 * 1024) throw new Error(`곡이 ${(u.length / 1e6).toFixed(1)}MB라 서버 한도(4MB)를 넘어요 (내 샘플·오디오 클립이 크면 생겨요)`);
  const r = await (await cloudFetch(`?id=${encodeURIComponent(lib.current)}&name=${encodeURIComponent(name)}`, {method:'PUT', headers:{'content-type':'application/octet-stream'}, body:u})).json();
  if (!quiet) status(`서버에 올렸어요: "${name}" (${(u.length / 1024).toFixed(0)}KB)`); return r;
}
let cloudT = 0, cloudFailed = false;
function cloudOnSave() {   // 저장할 때마다(3초 모아서) 자동으로 서버에
  if (lsGet(CA) !== '1' || !(authInfo() || cloudKey())) return; clearTimeout(cloudT);
  cloudT = setTimeout(() => cloudUpload(true).then(() => { cloudFailed = false; }).catch(e => { if (!cloudFailed) status('서버 자동 저장 실패: ' + e.message + ' (내 컴퓨터에는 저장돼 있어요)'); cloudFailed = true; }), 3000);
}
async function cloudRefresh() {
  const box = $('cloudList'); box.innerHTML = ''; $('cloudKey').value = cloudKey(); $('cloudAuto').checked = lsGet(CA) === '1';
  authUI(); if (!authInfo() && !cloudKey()) { $('cloudState').textContent = '로그인하면 곡을 계정에 저장해요. 로그인 없이 쓰려면 아래 "저장소 키"를 쓰세요.'; return; }
  try {
    const {songs} = await (await cloudFetch('')).json();
    $('cloudState').textContent = `서버 연결됨 · ${authInfo() ? authInfo().username + ' 계정' : '저장소 키'} · 곡 ${songs.length}개`;
    for (const s of songs) {
      const row = document.createElement('div'); row.className = 'trow';
      const nm = document.createElement('span'); nm.style.flex = '1'; nm.textContent = `${s.name} · ${(s.size / 1024).toFixed(0)}KB · ${new Date(s.uploadedAt).toLocaleString('ko-KR')}`;
      const op = document.createElement('button'); op.className = 'tbtn xs'; op.textContent = '열기'; op.setAttribute('aria-label', s.name + ' 열기');
      op.onclick = async () => { try { const u = new Uint8Array(await (await cloudFetch('?id=' + encodeURIComponent(s.id))).arrayBuffer()), r = await decodeMSK(u); $('cloudDlg').close(); await openLoaded({song:r.song, name:r.name || s.name, from:'서버', samples:r.samples, warnings:[]}); status(`서버에서 "${s.name}"을 열었어요.`); } catch (e) { status('열지 못했어요: ' + e.message); } };
      const dl = document.createElement('button'); dl.className = 'tbtn xs'; dl.textContent = '지우기'; dl.setAttribute('aria-label', s.name + ' 서버에서 지우기');
      dl.onclick = async () => { if (!confirm(`서버에서 "${s.name}"을 지울까요? 내 컴퓨터의 곡은 그대로예요.`)) return; try { await cloudFetch('?id=' + encodeURIComponent(s.id), {method:'DELETE'}); cloudRefresh(); } catch (e) { status('지우지 못했어요: ' + e.message); } };
      row.append(nm, op, dl); box.appendChild(row);
    }
  } catch (e) {
    $('cloudState').textContent = e.status === 503 ? '서버 저장소가 아직 연결되지 않았어요 (Vercel에서 Blob 저장소를 이 프로젝트에 연결해야 해요).' : e.status === 401 ? '저장소 키 모양이 틀렸어요 (16~64글자, 영문·숫자·-·_).' : '서버에 연결하지 못했어요: ' + e.message + ' (인터넷 연결 확인)';
  }
}
$('cloudBtn').onclick = () => { cloudRefresh(); openDlg($('cloudDlg')); };
async function authGo(action) {
  const username = $('authUser').value.trim().toLowerCase(), password = $('authPass').value;
  try { const j = await authCall(action, {username, password}); $('authPass').value = ''; setAuth({token:j.token, username:j.username}); status(action === 'signup' ? `${j.username} 계정을 만들었어요.` : `${j.username}(으)로 로그인했어요.`); cloudRefresh(); }
  catch (e) { $('cloudState').textContent = (action === 'signup' ? '회원가입 실패: ' : '로그인 실패: ') + e.message; }
}
$('authLogin').onclick = () => authGo('login'); $('authSignup').onclick = () => authGo('signup');
$('authPass').onkeydown = e => { if (e.key === 'Enter') authGo('login'); };
$('authLogout').onclick = () => { setAuth(null); status('로그아웃했어요. 내 컴퓨터의 곡은 그대로예요.'); cloudRefresh(); };
$('authDelete').onclick = async () => {
  const pw = prompt('계정과 서버의 곡을 모두 지워요 (내 컴퓨터의 곡은 그대로). 계속하려면 비밀번호를 넣어 주세요.'); if (!pw) return;
  try { await authCall('delete', {password:pw}, authInfo().token); setAuth(null); status('계정을 삭제했어요.'); cloudRefresh(); } catch (e) { $('cloudState').textContent = '계정 삭제 실패: ' + e.message; }
};
// 저장소 키로 올린 곡을 로그인한 계정으로 복사
$('authMove').onclick = async () => {
  try { const {songs} = await (await cloudFetch('', {useKey:true})).json(); let n = 0;
    for (const s of songs) { const u = new Uint8Array(await (await cloudFetch('?id=' + encodeURIComponent(s.id), {useKey:true})).arrayBuffer());
      await cloudFetch(`?id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.name)}`, {method:'PUT', headers:{'content-type':'application/octet-stream'}, body:u}); n++; $('cloudState').textContent = `옮기는 중 ${n}/${songs.length}`; }
    status(`저장소 키의 곡 ${n}개를 계정으로 복사했어요 (키 쪽에도 남아 있어요).`); cloudRefresh(); } catch (e) { $('cloudState').textContent = '옮기기 실패: ' + e.message; }
};
setTimeout(authUI, 0);
$('cloudClose').onclick = () => $('cloudDlg').close();
$('cloudRefresh').onclick = cloudRefresh;
$('cloudKey').onchange = () => { const v = $('cloudKey').value.trim(); if (v && !/^[A-Za-z0-9_-]{16,64}$/.test(v)) { status('저장소 키는 16~64글자(영문·숫자·-·_)예요.'); return; } lsSet(CK, v); cloudRefresh(); };
$('cloudKeyNew').onclick = () => { if (cloudKey() && !confirm('새 키를 만들면 지금 키의 곡 목록은 이 기기에서 안 보여요 (서버에는 남아 있어요). 계속할까요?')) return; lsSet(CK, newCloudKey()); cloudRefresh(); };
$('cloudKeyCopy').onclick = async () => { try { await navigator.clipboard.writeText(cloudKey()); status('저장소 키를 복사했어요.'); } catch (e) { $('cloudKey').select(); } };
$('cloudAuto').onchange = () => { lsSet(CA, $('cloudAuto').checked ? '1' : '0'); if ($('cloudAuto').checked && !cloudKey()) { lsSet(CK, newCloudKey()); cloudRefresh(); } };
$('cloudUp').onclick = async () => { try { await cloudUpload(false); cloudRefresh(); } catch (e) { $('cloudState').textContent = '올리지 못했어요: ' + e.message; } };

/* 공유 링크 만들기 — 곡을 서버에 올리고 /s/<id> 주소를 받는다 */
async function makeShareLink() {
  if (!authInfo()) return status('공유하려면 로그인해 주세요.');
  const b = $('shareBtn'); const old = b.textContent;
  b.textContent = '…'; b.disabled = true;
  try {
    const up = await cloudUpload(true);
    if (!up || !up.url) throw new Error('곡 주소를 받지 못했어요');
    const name = (lib.list[lib.current] || {}).name || '내 곡';
    const bars = Math.max(1, Math.ceil((curPat()?.len || 48) / 48));
    const r = await fetch((window.MSK_SERVER || '') + '/api/share?action=create', {
      method:'POST', headers:{'content-type':'application/json', authorization:'Bearer ' + authInfo().token},
      body:JSON.stringify({name, url:up.url, bars, bpm:S.bpm, size:up.size})});
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || '만들지 못했어요');
    const link = location.origin + j.link;
    try { await navigator.clipboard.writeText(link); status(`공유 링크를 복사했어요: ${link}`); }
    catch (e) { prompt('이 링크를 복사해 주세요', link); }
  } catch (e) { status('공유 링크를 만들지 못했어요: ' + e.message); }
  finally { b.textContent = old; b.disabled = false; }
}
document.addEventListener('DOMContentLoaded', () => { const b = $('shareBtn'); if (b) b.onclick = makeShareLink; });
if (document.readyState !== 'loading') { const b = $('shareBtn'); if (b) b.onclick = makeShareLink; }

/* 개발자 페이지용 — 방문 한 번과 터진 오류를 서버에 알린다 (누가 왔는지는 안 보냄) */
(() => {
  const send = (action, body) => {
    try {
      fetch((window.MSK_SERVER || '') + '/api/stats?action=' + action,
            {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body),
             keepalive:true}).catch(() => {});
    } catch (e) {}
  };
  // 하루에 한 번만 센다
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem('msk.hit') !== today) {
      localStorage.setItem('msk.hit', today);
      send('hit', {lang:(typeof LANG !== 'undefined' ? LANG : 'ko'),
                   device:(matchMedia('(pointer:coarse)').matches ? 'phone' : 'desktop')});
    }
  } catch (e) {}
  // 오류는 같은 것을 거푸 보내지 않는다
  const seen = new Set();
  addEventListener('error', ev => {
    const m = String(ev.message || '').slice(0, 300); if (!m || seen.has(m)) return;
    seen.add(m);
    send('err', {msg:m, where:`${(ev.filename || '').split('/').pop()}:${ev.lineno || 0}`,
                 ua:navigator.userAgent.slice(0, 160)});
  });
  addEventListener('unhandledrejection', ev => {
    const m = String(ev.reason && ev.reason.message || ev.reason || '').slice(0, 300);
    if (!m || seen.has(m)) return;
    seen.add(m); send('err', {msg:m, where:'promise', ua:navigator.userAgent.slice(0, 160)});
  });
})();
