/* 23-cloud.js — 서버에 곡 저장·열기 (/api/songs, 저장소 키) */
const CLOUD_API = (window.MSK_SERVER || '') + '/api/songs', CK = 'msk-cloud-key', CA = 'msk-cloud-auto';
const cloudKey = () => lsGet(CK) || '';
function newCloudKey() { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function cloudFetch(q, opt = {}) {
  const r = await fetch(CLOUD_API + q, {...opt, headers:{'x-msk-key':cloudKey(), ...(opt.headers || {})}});
  if (!r.ok) { let m = 'HTTP ' + r.status; try { const j = await r.json(); m = j.message || j.error || m; } catch (e) {} throw Object.assign(new Error(m), {status:r.status}); }
  return r;
}
async function cloudUpload(quiet) {
  if (!cloudKey()) { lsSet(CK, newCloudKey()); }
  const u = await encodeMSK(S, lib.list[lib.current].name, await songSamples(S)), name = lib.list[lib.current].name;
  if (u.length > 4 * 1024 * 1024) throw new Error(`곡이 ${(u.length / 1e6).toFixed(1)}MB라 서버 한도(4MB)를 넘어요 (내 샘플·오디오 클립이 크면 생겨요)`);
  const r = await (await cloudFetch(`?id=${encodeURIComponent(lib.current)}&name=${encodeURIComponent(name)}`, {method:'PUT', headers:{'content-type':'application/octet-stream'}, body:u})).json();
  if (!quiet) status(`서버에 올렸어요: "${name}" (${(u.length / 1024).toFixed(0)}KB)`); return r;
}
let cloudT = 0, cloudFailed = false;
function cloudOnSave() {   // 저장할 때마다(3초 모아서) 자동으로 서버에
  if (lsGet(CA) !== '1' || !cloudKey()) return; clearTimeout(cloudT);
  cloudT = setTimeout(() => cloudUpload(true).then(() => { cloudFailed = false; }).catch(e => { if (!cloudFailed) status('서버 자동 저장 실패: ' + e.message + ' (내 컴퓨터에는 저장돼 있어요)'); cloudFailed = true; }), 3000);
}
async function cloudRefresh() {
  const box = $('cloudList'); box.innerHTML = ''; $('cloudKey').value = cloudKey(); $('cloudAuto').checked = lsGet(CA) === '1';
  if (!cloudKey()) { $('cloudState').textContent = '아직 저장소 키가 없어요. "지금 곡 올리기"를 누르면 키가 만들어져요.'; return; }
  try {
    const {songs} = await (await cloudFetch('')).json();
    $('cloudState').textContent = `서버 연결됨 · 곡 ${songs.length}개`;
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
$('cloudClose').onclick = () => $('cloudDlg').close();
$('cloudRefresh').onclick = cloudRefresh;
$('cloudKey').onchange = () => { const v = $('cloudKey').value.trim(); if (v && !/^[A-Za-z0-9_-]{16,64}$/.test(v)) { status('저장소 키는 16~64글자(영문·숫자·-·_)예요.'); return; } lsSet(CK, v); cloudRefresh(); };
$('cloudKeyNew').onclick = () => { if (cloudKey() && !confirm('새 키를 만들면 지금 키의 곡 목록은 이 기기에서 안 보여요 (서버에는 남아 있어요). 계속할까요?')) return; lsSet(CK, newCloudKey()); cloudRefresh(); };
$('cloudKeyCopy').onclick = async () => { try { await navigator.clipboard.writeText(cloudKey()); status('저장소 키를 복사했어요.'); } catch (e) { $('cloudKey').select(); } };
$('cloudAuto').onchange = () => { lsSet(CA, $('cloudAuto').checked ? '1' : '0'); if ($('cloudAuto').checked && !cloudKey()) { lsSet(CK, newCloudKey()); cloudRefresh(); } };
$('cloudUp').onclick = async () => { try { await cloudUpload(false); cloudRefresh(); } catch (e) { $('cloudState').textContent = '올리지 못했어요: ' + e.message; } };
