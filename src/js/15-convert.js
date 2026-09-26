/* 15-convert.js — 붙여넣기 · 파일 변환기
   넣는 것은 형식을 스캔해서 알아봐요: MSK · 곡 코드 · MIDI · 프로젝트(.json) · 악보(.txt)
   만드는 것: MSK · 곡 코드 · 악보 · 프로젝트 · MIDI · 오디오(.wav)
   지금 열린 곡은 건드리지 않고, 변환할 곡을 잠깐 S 자리에 끼워서 저장 함수를 그대로 써요 */
function openDlg(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
function openAsProject(song, name) {
  const id = newId(); lib.list[id] = {name:(name || '불러온 곡').slice(0, 40), updated:Date.now()};
  save(); lsSet(PK(id), songToStore(song)); openProject(id); return id;
}
const songSummary = song => withSong(song, () => `채널 ${S.channels.length}개 · 패턴 ${S.patterns.length}개 · 곡 ${songBars()}마디 · ${S.bpm} BPM · ${names()[S.root]} ${S.mode === 'minor' ? '단조' : '장조'} · 음 ${S.patterns.reduce((a, P) => a + Object.values(P.notes).reduce((b, x) => b + x.length, 0), 0)}개`);
function listMsg(el, head, items) {
  el.innerHTML = ''; const b = document.createElement('b'); b.textContent = head; el.appendChild(b);
  if (items && items.length) { const ul = document.createElement('ul'); for (const t of items.slice(0, 30)) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); } if (items.length > 30) { const li = document.createElement('li'); li.textContent = `…그리고 ${items.length - 30}개 더`; ul.appendChild(li); } el.appendChild(ul); }
}

// ---- 악보 붙여넣기 ----
const scoreTA = $('scoreText'), scoreMsg = $('scoreMsg');
let pasted = null;   // 검사를 통과한 결과
async function scoreCheck(selectErr) {
  const text = scoreTA.value; pasted = null; if (!text.trim()) { scoreMsg.textContent = '악보나 곡 코드를 붙여 넣어 주세요.'; return null; }
  const kind = sniffFormat(new TextEncoder().encode(text.slice(0, 4096)));
  try {
    const r = await loadAny(text, '붙여 넣은 곡');
    listMsg(scoreMsg, `✓ ${r.from}로 알아봤어요: ${r.name !== '붙여 넣은 곡' ? '"' + r.name + '" · ' : ''}${songSummary(r.song)}` + (r.warnings.length ? ` · 알림 ${r.warnings.length}개` : ''), r.warnings);
    return pasted = r;
  } catch (e) {
    listMsg(scoreMsg, '✗ ' + (kind === 'unknown' ? '' : FORMAT_NAME[kind] + ': ') + e.message, null);
    if (selectErr && e.line) { const ls = text.split('\n'); let a = 0; for (let k = 0; k < e.line - 1; k++) a += ls[k].length + 1; scoreTA.focus(); scoreTA.setSelectionRange(a, a + ls[e.line - 1].length); }
    return null;
  }
}
let scoreT = 0;
scoreTA.addEventListener('input', () => { clearTimeout(scoreT); scoreT = setTimeout(() => scoreCheck(false), 300); });
$('scoreIn').onclick = () => { scoreMsg.textContent = ''; openDlg($('scoreDlg')); if (scoreTA.value) scoreCheck(false); scoreTA.focus(); };
$('scoreFile').onclick = () => $('scoreFileIn').click();
$('scoreFileIn').onchange = async () => { const f = $('scoreFileIn').files[0]; $('scoreFileIn').value = ''; if (!f) return; scoreTA.value = await f.text(); await scoreCheck(true); };
$('scoreClose').onclick = () => $('scoreDlg').close();
$('scoreLoad').onclick = async () => {
  const r = await scoreCheck(true); if (!r) return;
  $('scoreDlg').close(); const n = await openLoaded(r);
  status(`${r.from}을 새 프로젝트 "${lib.list[lib.current].name}"로 불러왔어요` + (n ? ` (내 샘플 ${n}개)` : '') + (r.warnings.length ? ` (알림 ${r.warnings.length}개)` : '') + '.');
};

// ---- 파일 변환기 ----
let conv = null;   // {song, name, from, warnings, samples}
const CONV_BTNS = ['convMsk', 'convCode', 'convTxt', 'convJson', 'convMid', 'convWav', 'convOpen'];
function convShow() {
  const on = !!conv; CONV_BTNS.forEach(id => $(id).disabled = !on);
  if (!on) { $('convInfo').textContent = '아직 고른 파일이 없어요.'; return; }
  listMsg($('convInfo'), `${conv.from}: "${conv.name}" — ${songSummary(conv.song)}`, conv.warnings);
}
async function convSave(ext, data, mime) {
  const fn = (conv.name || 'melody-sketch').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  if (inClaude) { if (typeof data === 'string') await offer(fn + '.' + ext, data); else await offer(`${fn}-${ext}.zip`, new Blob([zip(fn + '.' + ext, data)])); }
  else localDownload(fn + '.' + ext, new Blob([data], {type:mime}));
}
// MIDI·오디오는 플레이리스트에 조각이 있으면 곡 전체로
const convSongForAudio = () => ({...conv.song, playMode:conv.song.playlist.clips.length ? 'song' : 'pat'});
$('convBtn').onclick = () => { convShow(); openDlg($('convDlg')); };
$('convClose').onclick = () => $('convDlg').close();
$('convPick').onclick = () => $('convIn').click();
$('convIn').onchange = async () => {
  const f = $('convIn').files[0]; $('convIn').value = ''; if (!f) return;
  try { conv = await loadAny(f); convShow(); announce(`${conv.from} 파일로 알아봤어요. 바꿀 형식을 골라 주세요.`); }
  catch (e) { conv = null; convShow(); listMsg($('convInfo'), '✗ 읽지 못했어요: ' + (e.message || '알 수 없는 형식'), null); }
};
$('convCur').onclick = async () => { save(); const song = normalize(JSON.parse(JSON.stringify(S))), sm = await songSamples(song);
  conv = {song, name:lib.list[lib.current].name, from:'지금 곡', warnings:[], samples:Object.entries(sm).map(([slot, v]) => ({slot, name:v.name, root:v.root, ab:v.ab}))}; convShow(); };
const convSampleMap = () => Object.fromEntries((conv.samples || []).map(s => [s.slot, {ab:s.ab, root:s.root, name:s.name}]));
$('convMsk').onclick = async () => convSave('msk', await encodeMSK(conv.song, conv.name, convSampleMap()), 'application/octet-stream');
$('convCode').onclick = async () => {
  const code = mskToCode(await encodeMSK(conv.song, conv.name, {})), out = $('out'); out.value = code;
  try { await navigator.clipboard.writeText(code); listMsg($('convInfo'), `✓ 곡 코드를 복사했어요 (${code.length.toLocaleString()}글자). "붙여넣기"에 넣으면 이 곡이 열려요. 내 샘플은 빠져요.`, null); }
  catch (e) { out.style.display = 'block'; out.focus(); out.select(); listMsg($('convInfo'), '자동 복사가 막혀 있어요. 아래 곡 코드를 길게 눌러 복사해 주세요.', null); }
};
$('convTxt').onclick = () => convSave('txt', withSong(conv.song, () => scoreText(conv.name)), 'text/plain;charset=utf-8');
$('convJson').onclick = () => convSave('json', JSON.stringify({app:'melody-sketchpad', version:4, name:conv.name, song:conv.song, samples:{}}), 'application/json');
$('convMid').onclick = () => convSave('mid', withSong(convSongForAudio(), () => midiBytes()), 'audio/midi');
$('convWav').onclick = async () => {
  const b = $('convWav'); CONV_BTNS.forEach(id => $(id).disabled = true);
  try { const w = await withSongAsync(convSongForAudio(), () => renderWav(p => b.textContent = `만드는 중 ${Math.floor(p * 100)}%`)); await convSave('wav', w, 'audio/wav'); }
  catch (e) { status('오디오를 만들지 못했어요.'); }
  finally { b.textContent = '오디오 (.wav)'; convShow(); }
};
$('convOpen').onclick = async () => { $('convDlg').close(); await openLoaded({...conv, song:normalize(JSON.parse(JSON.stringify(conv.song)))}); status(`"${conv.name}"을 새 프로젝트로 열었어요.`); };
