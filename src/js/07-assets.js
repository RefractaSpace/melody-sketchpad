/* 07-assets.js — 내 샘플 (IndexedDB에 저장) */
const DB_NAME = 'melody-sketchpad-assets';
function idb() { return new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error('no idb')); const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {} }
async function idbGet(k) { try { const db = await idb(); return await new Promise(res => { const rq = db.transaction('s', 'readonly').objectStore('s').get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbDel(k) { try { const db = await idb(); await new Promise(res => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} }
async function idbAll() { try { const db = await idb(); return await new Promise(res => { const out = {}, rq = db.transaction('s', 'readonly').objectStore('s').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; rq.onerror = () => res(out); }); } catch (e) { return {}; } }
const decoder = () => ctx || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
async function decode(ab) { const ac = decoder(); return await new Promise((res, rej) => { const p = ac.decodeAudioData(ab.slice(0), res, rej); if (p && p.then) p.then(res, rej); }); }
// slot: 'ch:<id>' (채널마다). 예전 칸 이름 'melody'·'trk:…'·'kick'… 도 찾아 씀
function sampleCtl(slot, label) {
  const w = document.createElement('div'); w.className = 'smp'; const s = SAMPLES[slot], ch = chById(slot.slice(3)), isTrack = !!(ch && ch.kind === 'synth');
  const nm = document.createElement('span'); nm.className = 'sn'; nm.textContent = s ? tMsg(s.name) : (isTrack && SAMPLES.melody ? tMsg('공용 샘플: ') + SAMPLES.melody.name : tMsg('기본 소리'));
  const up = document.createElement('button'); up.className = 'tbtn xs'; up.textContent = tMsg(s ? '바꾸기' : '내 샘플'); up.setAttribute('aria-label', label + ' 샘플 넣기');
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
  const mc = document.createElement('button'), recNow = typeof mic !== 'undefined' && mic && mic.slot === slot; mc.className = 'tbtn xs' + (recNow ? ' micon' : ''); mc.textContent = tMsg(recNow ? '■ 멈춤' : '녹음'); mc.classList.toggle('ic-mic', !recNow);
  mc.setAttribute('aria-label', label + (recNow ? ' 마이크 녹음 멈추기' : ' 마이크로 녹음')); mc.onclick = () => micToggle(slot, label);
  const ed = document.createElement('button'); ed.className = 'tbtn xs ic-cut'; ed.textContent = tMsg('편집'); ed.hidden = !SAMPLES[slot]; ed.setAttribute('aria-label', label + ' 샘플 편집'); ed.onclick = () => openSampleEditor(slot, label);
  w.append(nm, up, mc, ed, fi);
  const smCh = slot.startsWith('ch:') ? chById(slot.slice(3)) : null;
  if (smCh && smCh.kind === 'synth' && SAMPLES[slot]) {   // 샘플러: 구간 반복 · 조각을 건반에
    const c2 = smCh.smp = normSmp(smCh.smp), set = (k, v) => { c2[k] = v; save(); };
    w.appendChild(selectEl(label + ' 구간 반복', [['0', '반복 끔'], ['1', '누르는 동안 구간 반복']], c2.loop ? '1' : '0', v => set('loop', v === '1')));
    w.appendChild(mixSlider('반복 시작', c2.ls, 0, 0.99, 0.01, v => set('ls', v), v => Math.round(v * 100) + '%'));
    w.appendChild(mixSlider('반복 끝', c2.le, 0.01, 1, 0.01, v => set('le', v), v => Math.round(v * 100) + '%'));
    w.appendChild(selectEl(label + ' 조각', [['0', '조각 안 냄'], ['4', '4조각 → C4부터'], ['8', '8조각 → C4부터'], ['16', '16조각 → C4부터']], String(c2.slices), v => set('slices', +v)));
  }
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
async function loadSamples() { const all = await idbAll(); for (const [k, v] of Object.entries(all)) { if (k.endsWith(':orig')) continue; try { SAMPLES[k] = {buf:await decode(v.ab), root:v.root || 60, name:v.name}; } catch (e) {} } buildMixer(); }
