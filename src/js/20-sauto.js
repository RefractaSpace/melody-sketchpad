/* 20-sauto.js — 곡 전체 자동화: 플레이리스트 아래 줄 하나에 곡 처음~끝 선 (SONG 재생·WAV에 적용) */
const SA_H = 84, SA_NAME = {vol:'볼륨', cut:'필터', pan:'팬', rev:'리버브 보내기', dly:'딜레이 보내기', fx1:'이펙트 1', fx2:'이펙트 2', fx3:'이펙트 3'};
let saKey = '';   // 지금 보는 줄 "대상|값" ('' = 숨김)
const saH = () => saKey ? SA_H : 0;
function saTargets() {
  const t = S.channels.map(c => [chKey(c), c.name]); t.push(['chords', '코드'], ['bass', '베이스']);
  if ((S.audio || []).length) t.push(['audio', '오디오 클립']); for (const b of BUSES) if (Object.values(S.mix).some(m => m.out === b)) t.push([b, CH_NAME[b]]);
  t.push(['master', '마스터']); return t;
}
function saParams(key) {
  const fx = (S.mix[key] && S.mix[key].fx) || [], out = key === 'master' ? ['vol'] : ['vol', 'cut', 'pan', 'rev', 'dly'];
  fx.forEach((f, i) => out.push('fx' + (i + 1))); return out;
}
function saLabel(key, prm) { if (!prm.startsWith('fx')) return SA_NAME[prm]; const f = ((S.mix[key] || {}).fx || [])[+prm[2] - 1]; return f ? `${SA_NAME[prm]} ${FX_NAME[f.type]} ${FX_KNOBS[f.type][f.type === 'dist' ? 1 : 0]}` : SA_NAME[prm]; }
function buildSaSelects() {
  const tSel = $('saTarget'), pSel = $('saParam'), [k0, p0] = saKey ? saKey.split('|') : ['', ''];
  tSel.innerHTML = '<option value="">자동화 줄 숨김</option>' + saTargets().map(([k, n]) => `<option value="${k}"${k === k0 ? ' selected' : ''}>${Object.keys(S.sauto).some(x => x.startsWith(k + '|')) ? '● ' : ''}${n}</option>`).join('');
  pSel.hidden = !k0; pSel.innerHTML = k0 ? saParams(k0).map(p => `<option value="${p}"${p === p0 ? ' selected' : ''}>${S.sauto[k0 + '|' + p] ? '● ' : ''}${saLabel(k0, p)}</option>`).join('') : '';
}
function saSet() { const k = $('saTarget').value; saKey = k ? k + '|' + ($('saParam').value && saParams(k).includes($('saParam').value) ? $('saParam').value : 'vol') : ''; buildSaSelects(); drawPlaylist(); }
$('saTarget').onchange = () => { $('saParam').value = 'vol'; saSet(); announce(saKey ? '곡 자동화 줄: ' + $('saTarget').selectedOptions[0].textContent : '곡 자동화 줄을 숨겼어요'); };
$('saParam').onchange = saSet;
// ---- 그리기 ----
const saY = (y0, v) => y0 + SA_H - 6 - v * (SA_H - 14);
function drawSongAutoLane(x) {
  if (!saKey) return;
  const y0 = S.playlist.tracks * PL_ROW, w = MAX_BARS * PL_BAR, k = PL_BAR / BAR_T, pts = S.sauto[saKey] || [], [key, prm] = saKey.split('|');
  x.fillStyle = CS.panel2; x.fillRect(0, y0, w, SA_H); x.fillStyle = CS.line; x.fillRect(0, y0, w, 1);
  for (let b = 0; b <= MAX_BARS; b += 4) { x.fillStyle = CS.line; x.fillRect(b * PL_BAR, y0, 1, SA_H); }
  x.font = '11px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'top'; x.fillStyle = CS.mute;
  const name = (saTargets().find(t => t[0] === key) || [0, key])[1] + ' · ' + saLabel(key, prm);
  x.fillText(pts.length ? name : name + ' — 눌러서 점 찍기 · 끌어 옮기기 · 두 번 눌러 지우기', plWrap.scrollLeft + 8, y0 + 4);
  if (!pts.length) return;
  x.strokeStyle = CS.note; x.lineWidth = 2; x.beginPath(); x.moveTo(0, saY(y0, pts[0].v)); for (const p of pts) x.lineTo(p.s * k, saY(y0, p.v)); x.lineTo(w, saY(y0, pts[pts.length - 1].v)); x.stroke();
  x.fillStyle = CS.note; for (const p of pts) { x.beginPath(); x.arc(p.s * k, saY(y0, p.v), 4, 0, 7); x.fill(); }
}
// ---- 편집 ----
let saDrag = null;
function saHit(e) { const r = plc.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top - S.playlist.tracks * PL_ROW}; }
function saNear(pts, q) { const k = PL_BAR / BAR_T; let best = -1, bd = 10; pts.forEach((p, i) => { const d = Math.hypot(p.s * k - q.x, saY(0, p.v) - q.y); if (d < bd) { bd = d; best = i; } }); return best; }
const saTick = x => clamp(Math.round(x * BAR_T / PL_BAR / (PPQ / 4)) * (PPQ / 4), 0, MAX_BARS * BAR_T), saVal = y => clamp((SA_H - 6 - y) / (SA_H - 14), 0, 1);
function initSongAuto() {
  plc.addEventListener('pointerdown', e => {
    if (!saKey) return; const q = saHit(e); if (q.y < 0 || e.button === 2) return; e.stopImmediatePropagation(); e.preventDefault();
    pushUndo(); const pts = S.sauto[saKey] = S.sauto[saKey] || []; let i = saNear(pts, q);
    if (i < 0) { const s = saTick(q.x), same = pts.find(p => p.s === s); if (same) same.v = saVal(q.y); else pts.push({s, v:saVal(q.y)}); pts.sort((a, b) => a.s - b.s); i = pts.findIndex(p => p.s === s); }
    saDrag = pts[i]; try { plc.setPointerCapture(e.pointerId); } catch (_) {} drawPlaylist();
  }, true);
  plc.addEventListener('pointermove', e => { if (!saDrag) return; e.stopImmediatePropagation(); const q = saHit(e), pts = S.sauto[saKey], s = saTick(q.x); if (!pts.some(p => p !== saDrag && p.s === s)) saDrag.s = s; saDrag.v = saVal(q.y); pts.sort((a, b) => a.s - b.s); drawPlaylist(); }, true);
  plc.addEventListener('pointerup', e => { if (!saDrag) return; e.stopImmediatePropagation(); saDrag = null; save(); buildSaSelects(); }, true);
  const del = e => { if (!saKey) return; const q = saHit(e); if (q.y < 0) return; e.preventDefault(); e.stopImmediatePropagation(); const pts = S.sauto[saKey]; if (!pts) return; const i = saNear(pts, q); if (i < 0) return;
    pushUndo(); pts.splice(i, 1); if (!pts.length) delete S.sauto[saKey]; save(); drawPlaylist(); buildSaSelects(); };
  plc.addEventListener('dblclick', del, true); plc.addEventListener('contextmenu', del, true);
  buildSaSelects();
}
// ---- 재생: 대상의 오디오 값에 선 예약 (6틱마다 중간 점) ----
function saParamOf(EE, key, prm) {
  if (key === 'master') return prm === 'vol' ? [EE.mAuto.gain, v => v] : null;
  const ch = getCh(EE, key);
  if (prm === 'vol') return [ch.sVol.gain, v => v]; if (prm === 'cut') return [ch.sCut.frequency, cutHz]; if (prm === 'pan') return [ch.sPan.pan, v => v * 2 - 1];
  if (prm === 'rev') return [ch.rs.gain, v => v]; if (prm === 'dly') return [ch.ds.gain, v => v];
  const n = ch.fxNodes[+prm[2] - 1]; return n && n.pa ? [n.pa, n.map] : null;
}
function scheduleSongAuto(EE, t0, t1, base) {
  for (const [k, pts] of Object.entries(S.sauto || {})) {
    if (!pts.length) continue; const [key, prm] = k.split('|'), pm = saParamOf(EE, key, prm); if (!pm) continue; const [param, map] = pm, at = t => base + tSec(t);
    param.setValueAtTime(map(autoAt(pts, t0)), at(t0));
    const cuts = new Set(pts.filter(q => q.s > t0 && q.s < t1).map(q => q.s)); for (let t = Math.floor(t0 / 6) * 6 + 6; t < t1; t += 6) cuts.add(t);
    for (const t of [...cuts].sort((a, b) => a - b)) param.linearRampToValueAtTime(map(autoAt(pts, t)), at(t));
    param.linearRampToValueAtTime(map(autoAt(pts, t1)), at(t1));
  }
}
