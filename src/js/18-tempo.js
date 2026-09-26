/* 18-tempo.js — 템포 지도 편집 (플레이리스트의 "템포 지도" 버튼) */
function setTempo(arr) { pushUndo(); S.tempo = normalize({...S, tempo:arr}).tempo; save(); drawPlaylist(); updatePos(S.playMode === 'song' ? songStart : startTick); }
function tempoRowPos(t) { return {bar:Math.floor(t / BAR_T) + 1, beat:Math.floor((t % BAR_T) / PPQ) + 1}; }
function buildTempoList() {
  const box = $('tempoList'); box.innerHTML = '';
  $('tempoInfo').textContent = S.tempo.length ? `바뀌는 곳 ${S.tempo.length}개 · 기본 ${S.bpm} BPM (PAT 반복과 곡 시작에 써요)` : `아직 없어요 — 곡 전체가 ${S.bpm} BPM이에요.`;
  S.tempo.slice(0, 400).forEach((x, i) => {
    const r = document.createElement('div'); r.className = 'trow'; const p = tempoRowPos(x.t);
    const bar = document.createElement('input'); bar.type = 'number'; bar.min = 1; bar.max = MAX_BARS; bar.value = p.bar; bar.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 마디`);
    const beat = document.createElement('select'); beat.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 박`); for (let b = 1; b <= 4; b++) { const o = document.createElement('option'); o.value = b; o.textContent = b + '박'; beat.appendChild(o); } beat.value = p.beat;
    const bpm = document.createElement('input'); bpm.type = 'number'; bpm.min = 20; bpm.max = 400; bpm.step = 0.01; bpm.value = x.bpm; bpm.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 BPM`);
    const del = document.createElement('button'); del.className = 'tbtn xs'; del.textContent = '삭제'; del.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 삭제`);
    const off = x.t % PPQ;   // 박 사이에 있던 위치는 그대로 유지
    const commit = () => { const a = S.tempo.map(y => ({...y})); a[i] = {t:(clamp(+bar.value || 1, 1, MAX_BARS) - 1) * BAR_T + (+beat.value - 1) * PPQ + off, bpm:+bpm.value || x.bpm}; setTempo(a); buildTempoList(); };
    bar.onchange = beat.onchange = bpm.onchange = commit;
    del.onclick = () => { setTempo(S.tempo.filter((_, k) => k !== i)); buildTempoList(); };
    const lab = document.createElement('span'); lab.textContent = '마디'; r.append(bar, lab, beat, bpm, document.createTextNode('BPM'), del); box.appendChild(r);
  });
  if (S.tempo.length > 400) { const d = document.createElement('p'); d.className = 'dsub'; d.textContent = `…${S.tempo.length - 400}개 더 있어요`; box.appendChild(d); }
}
$('tempoBtn').onclick = () => { buildTempoList(); openDlg($('tempoDlg')); };
$('tempoClose').onclick = () => $('tempoDlg').close();
$('tempoAdd').onclick = () => {
  const t = Math.min(songStart, songTicks() - BAR_T), cur = Math.round(bpmAt(t) * 100) / 100;
  setTempo([...S.tempo, {t: S.tempo.some(x => x.t === t) ? t + BAR_T : t, bpm:cur}]); buildTempoList();
  announce(`${Math.floor(t / BAR_T) + 1}마디에 바뀌는 곳을 추가했어요. BPM을 고쳐 주세요.`);
};
// 끝 4마디를 박마다 조금씩 느리게 (마지막에 70%까지)
$('tempoRit').onclick = () => {
  const end = songTicks(), start = Math.max(0, end - 4 * BAR_T), b0 = bpmAt(start), a = S.tempo.filter(x => x.t < start);
  for (let t = start, k = 0, n = (end - start) / PPQ; t < end; t += PPQ, k++) a.push({t, bpm:Math.round(b0 * (1 - 0.3 * (k + 1) / n) * 100) / 100});
  setTempo(a); buildTempoList(); status(`끝 4마디를 ${Math.round(b0)} → ${Math.round(b0 * 0.7)} BPM으로 점점 느리게 했어요 (SONG 재생에서 들려요).`);
};
$('tempoClear').onclick = () => { if (!S.tempo.length) return; setTempo([]); buildTempoList(); };
// 플레이리스트 눈금자에 템포 곡선 그리기
function drawTempoCurve(x, w, h) {
  if (!S.tempo.length) return;
  const end = MAX_BARS * BAR_T, k = PL_BAR / BAR_T, pts = tempoPts(), bs = pts.map(p => 60 / PPQ / p.spt), lo = Math.min(...bs), hi = Math.max(...bs), y = b => h - 2 - (hi > lo ? (b - lo) / (hi - lo) : 0.5) * 7;
  x.strokeStyle = CS.ink; x.globalAlpha = .7; x.lineWidth = 1.2; x.beginPath();
  pts.forEach((p, i) => { const X = p.t * k, b = bs[i]; if (i) x.lineTo(X, y(bs[i - 1])); x.lineTo(X, y(b)); if (i === pts.length - 1) x.lineTo(end * k, y(b)); });
  x.stroke(); x.globalAlpha = 1;
}
