/* 07-assets.js — 내 샘플 (IndexedDB에 저장) */
const DB_NAME = 'melody-sketchpad-assets';
function idb() { return new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error('no idb')); const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {} }
async function idbDel(k) { try { const db = await idb(); await new Promise(res => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} }
async function idbAll() { try { const db = await idb(); return await new Promise(res => { const out = {}, rq = db.transaction('s', 'readonly').objectStore('s').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; rq.onerror = () => res(out); }); } catch (e) { return {}; } }
const decoder = () => ctx || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
async function decode(ab) { const ac = decoder(); return await new Promise((res, rej) => { const p = ac.decodeAudioData(ab.slice(0), res, rej); if (p && p.then) p.then(res, rej); }); }
// slot: 'ch:<id>' (채널마다). 예전 칸 이름 'melody'·'trk:…'·'kick'… 도 찾아 씀
function sampleCtl(slot, label) {
  const w = document.createElement('div'); w.className = 'smp'; const s = SAMPLES[slot], ch = chById(slot.slice(3)), isTrack = !!(ch && ch.kind === 'synth');
  const nm = document.createElement('span'); nm.className = 'sn'; nm.textContent = s ? s.name : (isTrack && SAMPLES.melody ? '공용 샘플: ' + SAMPLES.melody.name : '기본 소리');
  const up = document.createElement('button'); up.className = 'tbtn xs'; up.textContent = s ? '바꾸기' : '내 샘플'; up.setAttribute('aria-label', label + ' 샘플 넣기');
  const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'audio/*'; fi.hidden = true;
  up.onclick = () => fi.click();
  fi.onchange = async () => {
    const f = fi.files[0]; if (!f) return; if (f.size > 15 * 1024 * 1024) { status('샘플은 15MB 이하로 넣어 주세요.'); return; }
    try {
      const ab = await f.arrayBuffer(), buf = await decode(ab), root = s ? s.root : 60;
      SAMPLES[slot] = {buf, root, name:f.name}; await idbPut(slot, {ab, root, name:f.name});
      if (isTrack) { ch.inst = 'sample'; save(); buildRack(); refreshTitles(); }
      buildMixer(); status(`${label}에 "${f.name}"을 넣었어요.`);
    } catch (e) { status('이 파일은 소리로 읽을 수 없어요. wav나 mp3로 넣어 주세요.'); }
  };
  w.append(nm, up, fi);
  if (s) {
    if (isTrack) {
      const rs = document.createElement('select'); rs.className = 'xs'; rs.setAttribute('aria-label', '샘플의 기준음');
      for (let p = 36; p <= 84; p++) { const o = document.createElement('option'); o.value = p; o.textContent = '기준 ' + NAMES_S[p % 12] + (Math.floor(p / 12) - 1); rs.appendChild(o); }
      rs.value = s.root; rs.onchange = async () => { s.root = +rs.value; const all = await idbAll(); if (all[slot]) { all[slot].root = s.root; idbPut(slot, all[slot]); } };
      w.appendChild(rs);
    }
    const del = document.createElement('button'); del.className = 'tbtn xs'; del.textContent = '기본으로';
    del.onclick = async () => { delete SAMPLES[slot]; await idbDel(slot); buildMixer(); };
    w.appendChild(del);
  }
  return w;
}
async function loadSamples() { const all = await idbAll(); for (const [k, v] of Object.entries(all)) { try { SAMPLES[k] = {buf:await decode(v.ab), root:v.root || 60, name:v.name}; } catch (e) {} } buildMixer(); }
