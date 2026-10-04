/* 14-score.js — 악보 텍스트 형식 (.txt)
   사람도 AI도 읽고 쓸 수 있는 곡 파일. 곡 → 텍스트(scoreText), 텍스트 → 곡(parseScore).
   자세한 설명: docs/score-format.md
   담기는 것: 템포·조·채널(악기·볼륨·팬)·패턴(음·세기·코드·드럼 스텝)·플레이리스트
   안 담기는 것: 리버브·딜레이·EQ·음색 손잡이·내 샘플 (이건 프로젝트 파일 .json에 담겨요) */
const SCORE_HEAD = '# 멜로디 스케치패드 악보 v1', SCORE_HEAD_EN = '# Melody Sketchpad score v1';
// 영어 화면에서는 영어 낱말로 쓰고, 읽을 때는 한국어·영어를 다 받는다 (예전에 복사한 악보도 열리게)
const enOf = s => (window.I18N && I18N.en && I18N.en[s]) || s;
// 읽기 오류·경고 문장: 화면 언어로 (한국어, 영어)
const ms = (ko, en) => LANG === 'en' ? en : ko;
const CHORD_SOUND = {pad:'패드', supersaw:'슈퍼소', piano:'피아노', epiano:'일렉트릭 피아노', pluck:'플럭'};
const BASS_MODE = {off:'끔', sustain:'길게', '8th':'8분', offbeat:'오프비트'};
const BASS_INST = {reese:'리스', sub:'서브', saw:'톱니'};
const KIT_NAME = {edm:'EDM', '808':'808', hard:'하드', acoustic:'어쿠스틱'};
const safeName = s => String(s).replace(/[|,@=:：\[\]\r\n]/g, '·').trim() || '이름없음';
const byLabel = (map, v) => { v = String(v).trim().toLowerCase(); for (const [k, n] of Object.entries(map)) if (k.toLowerCase() === v || n.toLowerCase() === v || enOf(n).toLowerCase() === v) return k; return null; };

// 다른 곡을 잠깐 S 자리에 끼워서 처리 (변환기에서 씀)
function withSong(song, fn) { const keep = S; S = song; try { return fn(); } finally { S = keep; } }
async function withSongAsync(song, fn) { const keep = S; S = song; try { return await fn(); } finally { S = keep; } }

// ---------- 곡 → 텍스트 ----------
const velChar = v => v >= 0.95 ? 'X' : String(clamp(Math.round(v * 10), 1, 9));
function scoreText(title) {
  const E = LANG === 'en', W = (ko, en) => E ? en : ko, lab = (map, k) => E ? enOf(map[k]) : map[k];
  const L = [E ? SCORE_HEAD_EN : SCORE_HEAD,
    W('# 위치 = 마디.박.칸 (칸 1~4 = 16분, t1~t3 = 셋잇단) · 길이 = 16분 개수 (t = 셋잇단 개수) · v = 세기 % (없으면 80)',
      '# position = bar.beat.step (step 1-4 = 16ths, t1-t3 = triplets) · length = number of 16ths (t = triplets) · v = velocity % (80 if missing)'),
    W('# 드럼 줄은 16칸 = 1마디 · X = 100% · 1~9 = 10~90% · . = 쉼 · 줄 앞이 공백이면 앞 줄에 이어짐',
      '# drum lines: 16 steps = 1 bar · X = 100% · 1-9 = 10-90% · . = rest · a line starting with a space continues the line above'), ''];
  if (title) L.push(W('제목: ', 'Title: ') + String(title).replace(/[\r\n]/g, ' '));
  if (meterOf(S).join('/') !== '4/4') L.push(W('박자: ', 'Meter: ') + meterOf(S).join('/')); if (S.swing) L.push(W('스윙: ', 'Swing: ') + Math.round(S.swing * 100) + '%');
  L.push('BPM: ' + S.bpm, W('조: ', 'Key: ') + names()[S.root] + (S.mode === 'minor' ? W(' 단조', ' minor') : W(' 장조', ' major')), W('재생: ', 'Play: ') + (S.playMode === 'song' ? 'SONG' : 'PAT'),
    ...(S.tempo.length ? [W('템포 변화: ', 'Tempo changes: ') + S.tempo.map(x => `${posText(x.t)} ${x.bpm}`).join(' | ')] : []),
    W('코드 소리: ', 'Chord sound: ') + lab(CHORD_SOUND, S.chordInst), W('베이스: ', 'Bass: ') + lab(BASS_MODE, S.bassMode) + (S.bassMode === 'off' ? '' : ' ' + lab(BASS_INST, S.bassInst)), W('드럼 키트: ', 'Drum kit: ') + lab(KIT_NAME, S.kit), '');
  // 채널 이름이 겹치면 뒤에 숫자를 붙임
  const cname = new Map(), used = new Set();
  for (const c of S.channels) { const base = safeName(E ? nameOf(c.name) : c.name); let n = base, k = 2; while (used.has(n)) n = base + ' ' + k++; used.add(n); cname.set(c.id, n); }
  L.push(W('[채널]', '[Channels]'));
  for (const c of S.channels) {
    const m = S.mix[chKey(c)], d = chDefault(chKey(c), c), extra = [];
    if (Math.abs(m.v - d.v) > 0.005) extra.push(W('볼륨 ', 'vol ') + Math.round(m.v * 100));
    if (Math.abs(m.pan - d.pan) > 0.005) extra.push(W('팬 ', 'pan ') + Math.round(m.pan * 100));
    if (m.mute) extra.push(W('뮤트', 'mute'));
    L.push(`${cname.get(c.id)} = ${c.kind === 'drum' ? W('드럼 ', 'Drum ') + lab(DRUM_NAME, c.inst) : lab(INSTS, c.inst)}` + (extra.length ? '    ' + extra.join(' ') : ''));
  }
  const pname = new Map(), pused = new Set();
  for (const P of S.patterns) { let n = safeName(P.name), k = 2; while (pused.has(n)) n = safeName(P.name) + ' ' + k++; pused.add(n); pname.set(P.id, n); }
  for (const P of S.patterns) {
    L.push('', `${W('[패턴]', '[Pattern]')} ${pname.get(P.id)} | ${P.bars}${W('마디', ' bars')}` + (P.color ? ` | ${W('색', 'color')} ${P.color}` : ''));
    const cs = []; P.chords.forEach((c, i) => { if (c) cs.push(`${Math.floor(i / BEATS) + 1}.${i % BEATS + 1} ${c.x ? W('멈춤', 'stop') : chordName(c)}`); });
    if (cs.length) L.push(W('코드: ', 'Chords: ') + cs.join(' | '));
    for (const c of S.channels) {
      const arr = (P.notes[c.id] || []).slice().sort((a, b) => a.s - b.s || b.p - a.p); if (!arr.length) continue;
      const head = cname.get(c.id) + ': ';
      if (c.kind === 'drum' && arr.every(n => n.s % 12 === 0)) {
        const bars = []; for (let b = 0; b < P.bars; b++) { let t = ''; for (let i = 0; i < STEPS; i++) { const n = arr.find(x => x.s === (b * STEPS + i) * 12); t += n ? velChar(n.v) : '.'; } bars.push(t); }
        for (let b = 0; b < bars.length; b += 4) L.push((b ? '  ' : head) + bars.slice(b, b + 4).join(' '));
        continue;
      }
      const items = arr.map(n => `${posText(n.s)} ${nn(n.p)} ${lenText(n.l)}` + (Math.round(n.v * 100) !== 80 ? ` v${Math.round(n.v * 100)}` : ''));
      for (let i = 0; i < items.length; i += 8) L.push((i ? '  ' : head) + items.slice(i, i + 8).join(' | '));
    }
    for (const c of S.channels) { const A = P.auto && P.auto[c.id]; if (!A) continue; for (const [k, nm] of [['vol', W('볼륨', 'Volume')], ['cut', W('필터', 'Filter')]]) if (A[k]) L.push(`${cname.get(c.id)} ${nm}: ` + A[k].map(q => `${posText(q.s)} ${Math.round(q.v * 100)}`).join(' | ')); }
  }
  L.push('', W('[플레이리스트]', '[Playlist]'));
  const byTrack = {}; for (const cl of S.playlist.clips) (byTrack[cl.t] = byTrack[cl.t] || []).push(cl);
  for (const t of Object.keys(byTrack).map(Number).sort((a, b) => a - b))
    L.push(`${W('트랙', 'Track')} ${t + 1}: ` + byTrack[t].sort((a, b) => a.bar - b.bar).map(cl => `${pname.get(cl.pat)} @${cl.bar + 1}` + (cl.len ? `:${cl.len}` : '') + (cl.off ? `+${cl.off}` : '')).join(', '));
  return L.join('\n') + '\n';
}

// ---------- 텍스트 → 곡 ----------
const PC_OF = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
const ACC = {'#':1, '♯':1, 'b':-1, '♭':-1, '':0};
function parsePitch(tok) { const m = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(tok); if (!m) return null; return 12 * (+m[3] + 1) + PC_OF[m[1].toUpperCase()] + ACC[m[2]]; }
function parsePos(tok) {
  const m = /^(\d+)\.(\d+)(?:\.(t?)(\d+)|\+(\d+)\/48)?$/.exec(tok); if (!m) return null;
  const bar = +m[1], beat = +m[2]; if (bar < 1 || beat < 1 || beat > 4) return null;
  let off = 0; if (m[4] != null) { const k = +m[4]; if (m[3] ? k < 1 || k > 3 : k < 1 || k > 4) return null; off = (k - 1) * (m[3] ? 16 : 12); } else if (m[5] != null) off = +m[5];
  return (bar - 1) * BAR_T + (beat - 1) * PPQ + off;
}
function parseLen(tok) { let m = /^(t?)(\d+)$/.exec(tok); if (m) return +m[2] * (m[1] ? 16 : 12); m = /^(\d+)\/48$/.exec(tok); return m ? +m[1] : null; }
const CHORD_Q = {'':'', 'm':'m', 'min':'m', '7':'7', 'maj7':'maj7', 'M7':'maj7', 'Δ7':'maj7', 'm7':'m7', 'min7':'m7', 'sus4':'sus4', 'sus':'sus4', 'dim':'dim', '°':'dim', 'aug':'aug', '+':'aug'};
function parseChord(tok) {
  if (/^(멈춤|stop|x|-)$/i.test(tok)) return {c:{x:1}};
  const m = /^([A-G])([#♯b♭]?)(.*)$/.exec(tok); if (!m) return null;
  const r = (PC_OF[m[1]] + ACC[m[2]] + 12) % 12;
  if (m[3] in CHORD_Q) return {c:{r, q:CHORD_Q[m[3]]}};
  const q = /^m(?!aj)/.test(m[3]) ? (/7/.test(m[3]) ? 'm7' : 'm') : /^maj/.test(m[3]) ? 'maj7' : /^7|^9|^13/.test(m[3]) ? '7' : '';
  return {c:{r, q}, warn:ms(`"${tok}"는 코드 줄에 없는 코드라서 "${NAMES_S[r]}${q}"로 바꿨어요 (복잡한 코드는 채널에 음으로 찍어 주세요)`, `"${tok}" isn't a chord the chord lane supports, so it became "${NAMES_S[r]}${q}" (put complex chords in a channel as notes)`)};
}
function parseScore(text) { const keep = METER_OV; METER_OV = [4, 4]; try { return parseScoreRaw(text); } finally { METER_OV = keep; } }
function parseScoreRaw(text) {
  const lines = String(text).replace(/\r/g, '').split('\n'), warnings = [];
  const song = {v:4, bpm:120, root:0, mode:'major', snap:12, len:24, channels:[], patterns:[], pat:0, ch:0, playMode:'pat',
    playlist:{tracks:PL_TRACKS, clips:[]}, chordInst:'pad', bassMode:'off', bassInst:'reese', kit:'edm', mix:{}};
  let title = '', sec = 'head', P = null, lastKey = null;
  const chByName = new Map(), patByName = new Map(), stepAt = new Map(), clipsTodo = [];
  const fail = (i, msg) => { const e = new Error(ms(`${i + 1}번째 줄: ${msg}`, `Line ${i + 1}: ${msg}`)); e.line = i + 1; throw e; };
  const warn = (i, msg) => warnings.push(ms(`${i + 1}번째 줄: ${msg}`, `Line ${i + 1}: ${msg}`));
  const channelNamed = (i, name) => {
    let c = chByName.get(name); if (c) return c;
    c = newChannel('synth', 'piano', name); song.channels.push(c); chByName.set(name, c);
    warn(i, ms(`"${name}" 채널이 [채널]에 없어서 피아노 채널로 만들었어요`, `"${name}" wasn't in [Channels], so it became a piano channel`)); return c;
  };
  const handle = (i, key, val) => {
    if (sec === 'head') {
      const k = key.replace(/\s/g, '').toLowerCase();
      if (k === '제목' || k === '곡' || k === 'title') title = val.slice(0, 40);
      else if (k === 'bpm' || k === '템포' || k === 'tempo') { const b = parseFloat(val); if (!(b >= 20 && b <= 400)) fail(i, ms(`BPM "${val}"을 읽을 수 없어요`, `Can't read BPM "${val}"`)); song.bpm = clamp(Math.round(b * 100) / 100, 60, 300); if (song.bpm !== Math.round(b * 100) / 100) warn(i, ms(`BPM은 60~300만 돼서 ${song.bpm}로 바꿨어요`, `BPM must be 60-300, so it was set to ${song.bpm}`)); }
      else if (k === '조' || k === '키' || k === 'key') {
        const m = /^([A-G])([#♯b♭]?)\s*(장조|단조|major|minor|maj|min|m)?/i.exec(val); if (!m) fail(i, ms(`조 "${val}"를 읽을 수 없어요 (예: C 장조, F# 단조)`, `Can't read key "${val}" (e.g. C major, F# minor)`));
        song.root = (PC_OF[m[1].toUpperCase()] + ACC[m[2]] + 12) % 12; song.mode = /단조|minor|min|^m$/i.test(m[3] || '') ? 'minor' : 'major';
      }
      else if (k === '박자' || k === 'meter' || k === 'time' || k === 'timesignature') { const mm = /(\d+)\s*\/\s*(\d+)/.exec(val), m2 = mm && [+mm[1], +mm[2]]; if (m2 && METERS.some(x => x[0] === m2[0] && x[1] === m2[1])) { song.meter = m2; METER_OV = m2; } else warn(i, ms(`박자 "${val}"는 쓸 수 없어요 (${METERS.map(x => x.join('/')).join(' ')})`, `Meter "${val}" isn't supported (${METERS.map(x => x.join('/')).join(' ')})`)); }
      else if (k === '스윙' || k === 'swing') song.swing = clamp((parseFloat(val) || 0) / 100, 0, 1);
      else if (k === '재생' || k === 'play' || k === 'mode') song.playMode = /song/i.test(val) ? 'song' : 'pat';
      else if (k === '템포변화' || k === '템포지도' || k === 'tempochanges' || k === 'tempomap') {
        song.tempo = song.tempo || [];
        for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) { const [pt, bt] = part.split(/\s+/), t = parsePos(pt || ''), b = parseFloat(bt); if (t == null || !(b >= 20 && b <= 400)) { warn(i, ms(`템포 변화 "${part}"를 읽을 수 없어요 (예: 17.1 140)`, `Can't read tempo change "${part}" (e.g. 17.1 140)`)); continue; } song.tempo.push({t, bpm:b}); }
      }
      else if (k === '코드소리' || k === 'chordsound') { const v = byLabel(CHORD_SOUND, val); if (v) song.chordInst = v; else warn(i, ms(`코드 소리 "${val}"를 몰라서 패드로 했어요`, `Unknown chord sound "${val}", using Pad`)); }
      else if (k === '베이스' || k === 'bass') { const [a, b] = val.split(/\s+/); const md = byLabel(BASS_MODE, a || ''); if (md) song.bassMode = md; else warn(i, ms(`베이스 "${val}"를 몰라서 끔으로 했어요`, `Unknown bass "${val}", turned it off`)); if (b) { const bi = byLabel(BASS_INST, b); if (bi) song.bassInst = bi; } }
      else if (k === '드럼키트' || k === '키트' || k === 'drumkit' || k === 'kit') { const v = byLabel(KIT_NAME, val.replace(/풍$/, '')); if (v) song.kit = v; }
      else warn(i, ms(`"${key}" 항목은 몰라서 건너뛰었어요`, `Skipped unknown field "${key}"`));
      return;
    }
    if (sec === 'pl') {
      const m = /^(?:트랙|track)\s*(\d+)$/i.exec(key.trim()); if (!m) { warn(i, ms(`"${key}"는 "트랙 1:" 모양이어야 해요`, `"${key}" should look like "Track 1:"`)); return; }
      for (const part of val.split(',').map(x => x.trim()).filter(Boolean)) {
        const mm = /^(.+?)\s*@\s*(\d+)(?::(\d+))?(?:\+(\d+))?$/.exec(part); if (!mm) { warn(i, ms(`"${part}"는 "패턴이름 @마디" 모양이어야 해요 (길이·시작: @1:8+2)`, `"${part}" should look like "pattern name @bar" (length·offset: @1:8+2)`)); continue; }
        clipsTodo.push({i, name:mm[1].trim(), t:clamp(+m[1] - 1, 0, 19), bar:+mm[2] - 1, len:mm[3] ? +mm[3] : 0, off:mm[4] ? +mm[4] : 0});
      }
      return;
    }
    if (!P) fail(i, ms('음이나 코드는 [패턴] 아래에 써 주세요', 'Notes and chords go under a [Pattern]'));
    const lim = P.bars * BAR_T;
    if (key === '코드' || /^chords?$/i.test(key.trim())) {
      for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) {
        const [pt, ct] = part.split(/\s+/), m = /^(\d+)\.(\d+)$/.exec(pt || ''), r = ct ? parseChord(ct) : null;
        if (!m || !r) { warn(i, ms(`코드 "${part}"를 읽을 수 없어요 (예: 1.1 Fm)`, `Can't read chord "${part}" (e.g. 1.1 Fm)`)); continue; }
        const beat = (+m[1] - 1) * BEATS + (+m[2] - 1); if (beat < 0 || beat >= P.bars * BEATS || +m[2] > BEATS) { warn(i, ms(`코드 위치 ${pt}가 패턴 밖이에요`, `Chord position ${pt} is outside the pattern`)); continue; }
        P.chords[beat] = r.c; if (r.warn) warn(i, r.warn);
      }
      return;
    }
    const am = /^(.+?)\s+(볼륨|필터|volume|filter)$/i.exec(key.trim());
    if (am && chByName.has(am[1].trim())) {   // 자동화 줄: 위치 값%
      const c = chByName.get(am[1].trim()), k = /볼륨|volume/i.test(am[2]) ? 'vol' : 'cut'; P.auto = P.auto || {}; const A = P.auto[c.id] = P.auto[c.id] || {}; A[k] = A[k] || [];
      for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) { const [pt, vt] = part.split(/\s+/), t = parsePos(pt || ''), v = parseFloat(vt); if (t == null || !(v >= 0 && v <= 100) || t > lim) { warn(i, ms(`자동화 "${part}"를 읽을 수 없어요 (예: 1.1.1 80)`, `Can't read automation "${part}" (e.g. 1.1.1 80)`)); continue; } A[k].push({s:t, v:v / 100}); }
      return;
    }
    const c = channelNamed(i, key.trim()), arr = notesOf(P, c);
    if (/^[Xxo1-9.\-\s|]+$/.test(val)) {   // 드럼(스텝) 줄
      let k = stepAt.get(c.id) || 0;
      for (const ch of val.replace(/[\s|]/g, '')) {
        if (k >= P.bars * STEPS) { warn(i, ms(`${c.name} 스텝이 패턴 길이(${P.bars}마디)보다 길어서 뒤는 버렸어요`, `${c.name} steps are longer than the pattern (${P.bars} bars), the rest was dropped`)); break; }
        const v = ch === 'X' ? 1 : ch === 'x' ? 0.6 : ch === 'o' ? 0.3 : /\d/.test(ch) ? +ch / 10 : 0;
        if (v) arr.push({p:c.kind === 'drum' ? DRUM_PITCH : 72, s:k * 12, l:12, v}); k++;
      }
      stepAt.set(c.id, k); return;
    }
    for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) {
      const tk = part.split(/\s+/), s = parsePos(tk[0] || ''), p0 = parsePitch(tk[1] || ''), l = parseLen(tk[2] || '');
      if (s == null || p0 == null || !l) { warn(i, ms(`음 "${part}"를 읽을 수 없어요 (예: 1.2.3 G5 2 v90)`, `Can't read note "${part}" (e.g. 1.2.3 G5 2 v90)`)); continue; }
      if (s >= lim) { warn(i, ms(`음 "${part}"가 패턴 밖(${P.bars}마디 뒤)이라 버렸어요`, `Note "${part}" is past the pattern (${P.bars} bars), dropped`)); continue; }
      let p = p0; while (p < LOW) p += 12; while (p > HIGH) p -= 12; if (p !== p0) warn(i, ms(`${tk[1]}는 건반(${NOTE_RANGE()}) 밖이라 ${NAMES_S[p % 12]}${Math.floor(p / 12) - 1}로 옮겼어요`, `${tk[1]} is outside the keyboard (${NOTE_RANGE()}), moved to ${NAMES_S[p % 12]}${Math.floor(p / 12) - 1}`));
      let v = 0.8; const vt = tk.find(x => /^v\d+$/i.test(x)); if (vt) v = clamp(+vt.slice(1) / 100, 0.05, 1);
      arr.push({p, s, l:Math.min(l, lim - s), v});
    }
  };
  lines.forEach((raw, i) => {
    if (!raw.trim() || /^\s*(#|\/\/)/.test(raw)) return;
    const line = raw.trim(), cont = /^\s/.test(raw) && lastKey != null;
    const hm = /^\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]*))?\]\s*(.*)$/.exec(line);
    if (hm && !cont) {
      const name = hm[1].replace(/\s+/g, ' '); lastKey = null;
      if (name === '채널' || /^channels?$/i.test(name)) { sec = 'ch'; return; }
      if (name === '플레이리스트' || /^playlist$/i.test(name)) { sec = 'pl'; return; }
      const pm = /^(패턴|pattern)/i.exec(name);
      if (pm) {
        let rest = hm[3] || '', inner = name.slice(pm[1].length).trim(); if (hm[2]) rest = (inner ? inner + ' | ' : '') + hm[2] + (rest ? ' ' + rest : ''); else if (inner) rest = inner + (rest ? ' ' + rest : '');
        const [pn, pb, pc] = rest.split('|').map(x => (x || '').trim()); const bars = parseInt((pb || '').replace(/[^\d]/g, ''), 10) || 4, color = /(?:색|color)\s*(\d)/i.exec(pc || '');
        if (!pn) fail(i, ms('패턴 이름이 없어요 (예: [패턴] 후렴 | 4마디)', 'The pattern has no name (e.g. [Pattern] Chorus | 4 bars)'));
        if (patByName.has(pn)) fail(i, ms(`"${pn}" 패턴이 두 번 나와요`, `Pattern "${pn}" appears twice`));
        if (bars > MAX_PAT_BARS) warn(i, ms(`패턴은 ${MAX_PAT_BARS}마디까지 편하게 쓸 수 있어요`, `Patterns work best up to ${MAX_PAT_BARS} bars`));
        P = newPattern(pn.slice(0, 24), clamp(bars, 1, MAX_BARS)); if (color) P.color = clamp(+color[1], 0, PAT_COLORS.length - 1); song.patterns.push(P); patByName.set(pn, P); stepAt.clear(); sec = 'pat'; return;
      }
      fail(i, ms(`[${name}]은 모르는 칸이에요 ([채널] · [패턴] · [플레이리스트] 중 하나)`, `Unknown section [${name}] (use [Channels] · [Pattern] · [Playlist])`));
    }
    if (cont) { handle(i, lastKey, line); return; }
    if (sec === 'ch') {
      const m = /^(.+?)\s*=\s*(.+)$/.exec(line); if (!m) fail(i, ms('채널은 "이름 = 악기" 모양으로 써 주세요 (예: 킥 = 드럼 킥)', 'Write channels as "name = instrument" (e.g. Kick = Drum Kick)'));
      const name = m[1].trim(); let spec = m[2].trim(); if (chByName.has(name)) fail(i, ms(`"${name}" 채널이 두 번 나와요`, `Channel "${name}" appears twice`));
      const vol = /(?:볼륨|\bvol(?:ume)?)\s*(-?\d+)/i.exec(spec), pan = /(?:팬|\bpan)\s*(-?\d+)/i.exec(spec), mute = /(?:^|\s)(?:뮤트|mute)\s*$/i.test(spec.replace(/(?:볼륨|\bvol(?:ume)?|팬|\bpan)\s*-?\d+/gi, ''));
      // 음소거 표시는 맨 끝의 낱말일 때만 ("뮤트 기타"·"뮤트 트럼펫" 같은 악기 이름을 지우지 않게)
      spec = spec.replace(/(?:볼륨|\bvol(?:ume)?|팬|\bpan)\s*-?\d+/gi, '').replace(/(?:^|\s)(?:뮤트|mute)\s*$/i, '').trim();
      let c;
      // 악기 이름 전체를 먼저 찾는다 ("드럼 키트" 악기를 "드럼 + 키트"로 쪼개지 않게)
      const whole = byLabel(INSTS, spec), dm = whole ? null : /^(?:드럼|drum)\s+(.+)$/i.exec(spec);
      if (whole) c = newChannel('synth', whole, name);
      else if (dm) { const d = byLabel(DRUM_NAME, dm[1]); if (!d) fail(i, ms(`드럼 "${dm[1]}"을 몰라요 (킥·스네어·하이햇·박수)`, `Unknown drum "${dm[1]}" (Kick · Snare · Hi-hat · Clap · Crash)`)); c = newChannel('drum', d, name); }
      else { const inst = byLabel(INSTS, spec);
        if (!inst) {   // 159개를 다 늘어놓지 않고, 낱말이 겹치는 이름 몇 개만 알려 준다
          const words = spec.toLowerCase().split(/\s+/).filter(w => w.length >= 2), lab = n => LANG === 'en' ? enOf(n) : n;
          const near = Object.values(INSTS).map(lab).filter(n => words.some(w => n.toLowerCase().includes(w))).slice(0, 6);
          fail(i, ms(`악기 "${spec}"를 몰라요` + (near.length ? ` (비슷한 이름: ${near.join(' · ')})` : ' (악기 이름은 브라우저 창에 보이는 이름 그대로 써요)'),
                     `Unknown instrument "${spec}"` + (near.length ? ` (did you mean: ${near.join(' · ')})` : ' (use the names shown in the Browser)')));
        }
        c = newChannel('synth', inst, name); }
      song.channels.push(c); chByName.set(name, c);
      const mx = {}; if (vol) mx.v = clamp(+vol[1] / 100, 0, 1.2); if (pan) mx.pan = clamp(+pan[1] / 100, -1, 1); if (mute) mx.mute = 1;
      if (Object.keys(mx).length) song.mix[chKey(c)] = mx;
      return;
    }
    const k = line.search(/[:：]/); if (k < 1) fail(i, ms('"이름: 내용" 모양이어야 해요', 'Lines should look like "name: content"'));
    lastKey = line.slice(0, k).trim(); handle(i, lastKey, line.slice(k + 1).trim());
  });
  if (!song.patterns.length) { const e = new Error(ms('[패턴]이 하나도 없어요', 'There is no [Pattern]')); e.line = 0; throw e; }
  if (!song.channels.length) song.channels.push(newChannel('synth', 'piano', '피아노'));
  for (const c of clipsTodo) { const p = patByName.get(c.name); if (!p) { warn(c.i, ms(`"${c.name}" 패턴이 없어서 건너뛰었어요`, `Skipped "${c.name}": no such pattern`)); continue; } const o = {id:newId(), pat:p.id, t:c.t, bar:clamp(c.bar, 0, MAX_BARS - 1)}; if (c.len) o.len = c.len; if (c.off) o.off = c.off; song.playlist.clips.push(o); }
  if (!song.playlist.clips.length) song.playlist.clips.push({id:newId(), pat:song.patterns[0].id, t:0, bar:0});
  return {song:normalize(song), title, warnings};
}
