/* 14-score.js — 악보 텍스트 형식 (.txt)
   사람도 AI도 읽고 쓸 수 있는 곡 파일. 곡 → 텍스트(scoreText), 텍스트 → 곡(parseScore).
   자세한 설명: docs/score-format.md
   담기는 것: 템포·조·채널(악기·볼륨·팬)·패턴(음·세기·코드·드럼 스텝)·플레이리스트
   안 담기는 것: 리버브·딜레이·EQ·음색 손잡이·내 샘플 (이건 프로젝트 파일 .json에 담겨요) */
const SCORE_HEAD = '# 멜로디 스케치패드 악보 v1';
const CHORD_SOUND = {pad:'패드', supersaw:'슈퍼소', piano:'피아노', epiano:'일렉트릭 피아노', pluck:'플럭'};
const BASS_MODE = {off:'끔', sustain:'길게', '8th':'8분', offbeat:'오프비트'};
const BASS_INST = {reese:'리스', sub:'서브', saw:'톱니'};
const KIT_NAME = {edm:'EDM', '808':'808', hard:'하드', acoustic:'어쿠스틱'};
const safeName = s => String(s).replace(/[|,@=:：\[\]\r\n]/g, '·').trim() || '이름없음';
const byLabel = (map, v) => { v = String(v).trim().toLowerCase(); for (const [k, n] of Object.entries(map)) if (k.toLowerCase() === v || n.toLowerCase() === v) return k; return null; };

// 다른 곡을 잠깐 S 자리에 끼워서 처리 (변환기에서 씀)
function withSong(song, fn) { const keep = S; S = song; try { return fn(); } finally { S = keep; } }
async function withSongAsync(song, fn) { const keep = S; S = song; try { return await fn(); } finally { S = keep; } }

// ---------- 곡 → 텍스트 ----------
const velChar = v => v >= 0.95 ? 'X' : String(clamp(Math.round(v * 10), 1, 9));
function scoreText(title) {
  const L = [SCORE_HEAD,
    '# 위치 = 마디.박.칸 (칸 1~4 = 16분, t1~t3 = 셋잇단) · 길이 = 16분 개수 (t = 셋잇단 개수) · v = 세기 % (없으면 80)',
    '# 드럼 줄은 16칸 = 1마디 · X = 100% · 1~9 = 10~90% · . = 쉼 · 줄 앞이 공백이면 앞 줄에 이어짐', ''];
  if (title) L.push('제목: ' + String(title).replace(/[\r\n]/g, ' '));
  L.push('BPM: ' + S.bpm, '조: ' + names()[S.root] + (S.mode === 'minor' ? ' 단조' : ' 장조'), '재생: ' + (S.playMode === 'song' ? 'SONG' : 'PAT'),
    ...(S.tempo.length ? ['템포 변화: ' + S.tempo.map(x => `${posText(x.t)} ${x.bpm}`).join(' | ')] : []),
    '코드 소리: ' + CHORD_SOUND[S.chordInst], '베이스: ' + BASS_MODE[S.bassMode] + (S.bassMode === 'off' ? '' : ' ' + BASS_INST[S.bassInst]), '드럼 키트: ' + KIT_NAME[S.kit], '');
  // 채널 이름이 겹치면 뒤에 숫자를 붙임
  const cname = new Map(), used = new Set();
  for (const c of S.channels) { let n = safeName(c.name), k = 2; while (used.has(n)) n = safeName(c.name) + ' ' + k++; used.add(n); cname.set(c.id, n); }
  L.push('[채널]');
  for (const c of S.channels) {
    const m = S.mix[chKey(c)], d = chDefault(chKey(c), c), extra = [];
    if (Math.abs(m.v - d.v) > 0.005) extra.push('볼륨 ' + Math.round(m.v * 100));
    if (Math.abs(m.pan - d.pan) > 0.005) extra.push('팬 ' + Math.round(m.pan * 100));
    if (m.mute) extra.push('뮤트');
    L.push(`${cname.get(c.id)} = ${c.kind === 'drum' ? '드럼 ' + DRUM_NAME[c.inst] : INSTS[c.inst]}` + (extra.length ? '    ' + extra.join(' ') : ''));
  }
  const pname = new Map(), pused = new Set();
  for (const P of S.patterns) { let n = safeName(P.name), k = 2; while (pused.has(n)) n = safeName(P.name) + ' ' + k++; pused.add(n); pname.set(P.id, n); }
  for (const P of S.patterns) {
    L.push('', `[패턴] ${pname.get(P.id)} | ${P.bars}마디` + (P.color ? ` | 색 ${P.color}` : ''));
    const cs = []; P.chords.forEach((c, i) => { if (c) cs.push(`${Math.floor(i / 4) + 1}.${i % 4 + 1} ${c.x ? '멈춤' : chordName(c)}`); });
    if (cs.length) L.push('코드: ' + cs.join(' | '));
    for (const c of S.channels) {
      const arr = (P.notes[c.id] || []).slice().sort((a, b) => a.s - b.s || b.p - a.p); if (!arr.length) continue;
      const head = cname.get(c.id) + ': ';
      if (c.kind === 'drum' && arr.every(n => n.s % 12 === 0)) {
        const bars = []; for (let b = 0; b < P.bars; b++) { let t = ''; for (let i = 0; i < 16; i++) { const n = arr.find(x => x.s === (b * 16 + i) * 12); t += n ? velChar(n.v) : '.'; } bars.push(t); }
        for (let b = 0; b < bars.length; b += 4) L.push((b ? '  ' : head) + bars.slice(b, b + 4).join(' '));
        continue;
      }
      const items = arr.map(n => `${posText(n.s)} ${nn(n.p)} ${lenText(n.l)}` + (Math.round(n.v * 100) !== 80 ? ` v${Math.round(n.v * 100)}` : ''));
      for (let i = 0; i < items.length; i += 8) L.push((i ? '  ' : head) + items.slice(i, i + 8).join(' | '));
    }
    for (const c of S.channels) { const A = P.auto && P.auto[c.id]; if (!A) continue; for (const [k, nm] of [['vol', '볼륨'], ['cut', '필터']]) if (A[k]) L.push(`${cname.get(c.id)} ${nm}: ` + A[k].map(q => `${posText(q.s)} ${Math.round(q.v * 100)}`).join(' | ')); }
  }
  L.push('', '[플레이리스트]');
  const byTrack = {}; for (const cl of S.playlist.clips) (byTrack[cl.t] = byTrack[cl.t] || []).push(cl);
  for (const t of Object.keys(byTrack).map(Number).sort((a, b) => a - b))
    L.push(`트랙 ${t + 1}: ` + byTrack[t].sort((a, b) => a.bar - b.bar).map(cl => `${pname.get(cl.pat)} @${cl.bar + 1}` + (cl.len ? `:${cl.len}` : '') + (cl.off ? `+${cl.off}` : '')).join(', '));
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
  return (bar - 1) * 4 * PPQ + (beat - 1) * PPQ + off;
}
function parseLen(tok) { let m = /^(t?)(\d+)$/.exec(tok); if (m) return +m[2] * (m[1] ? 16 : 12); m = /^(\d+)\/48$/.exec(tok); return m ? +m[1] : null; }
const CHORD_Q = {'':'', 'm':'m', 'min':'m', '7':'7', 'maj7':'maj7', 'M7':'maj7', 'Δ7':'maj7', 'm7':'m7', 'min7':'m7', 'sus4':'sus4', 'sus':'sus4', 'dim':'dim', '°':'dim', 'aug':'aug', '+':'aug'};
function parseChord(tok) {
  if (/^(멈춤|stop|x|-)$/i.test(tok)) return {c:{x:1}};
  const m = /^([A-G])([#♯b♭]?)(.*)$/.exec(tok); if (!m) return null;
  const r = (PC_OF[m[1]] + ACC[m[2]] + 12) % 12;
  if (m[3] in CHORD_Q) return {c:{r, q:CHORD_Q[m[3]]}};
  const q = /^m(?!aj)/.test(m[3]) ? (/7/.test(m[3]) ? 'm7' : 'm') : /^maj/.test(m[3]) ? 'maj7' : /^7|^9|^13/.test(m[3]) ? '7' : '';
  return {c:{r, q}, warn:`"${tok}"는 코드 줄에 없는 코드라서 "${NAMES_S[r]}${q}"로 바꿨어요 (복잡한 코드는 채널에 음으로 찍어 주세요)`};
}
function parseScore(text) {
  const lines = String(text).replace(/\r/g, '').split('\n'), warnings = [];
  const song = {v:4, bpm:120, root:0, mode:'major', snap:12, len:24, channels:[], patterns:[], pat:0, ch:0, playMode:'pat',
    playlist:{tracks:PL_TRACKS, clips:[]}, chordInst:'pad', bassMode:'off', bassInst:'reese', kit:'edm', mix:{}};
  let title = '', sec = 'head', P = null, lastKey = null;
  const chByName = new Map(), patByName = new Map(), stepAt = new Map(), clipsTodo = [];
  const fail = (i, msg) => { const e = new Error(`${i + 1}번째 줄: ${msg}`); e.line = i + 1; throw e; };
  const warn = (i, msg) => warnings.push(`${i + 1}번째 줄: ${msg}`);
  const channelNamed = (i, name) => {
    let c = chByName.get(name); if (c) return c;
    c = newChannel('synth', 'piano', name); song.channels.push(c); chByName.set(name, c);
    warn(i, `"${name}" 채널이 [채널]에 없어서 피아노 채널로 만들었어요`); return c;
  };
  const handle = (i, key, val) => {
    if (sec === 'head') {
      const k = key.replace(/\s/g, '').toLowerCase();
      if (k === '제목' || k === '곡' || k === 'title') title = val.slice(0, 40);
      else if (k === 'bpm' || k === '템포' || k === 'tempo') { const b = parseFloat(val); if (!(b >= 20 && b <= 400)) fail(i, `BPM "${val}"을 읽을 수 없어요`); song.bpm = clamp(Math.round(b * 100) / 100, 60, 300); if (song.bpm !== Math.round(b * 100) / 100) warn(i, `BPM은 60~300만 돼서 ${song.bpm}로 바꿨어요`); }
      else if (k === '조' || k === '키' || k === 'key') {
        const m = /^([A-G])([#♯b♭]?)\s*(장조|단조|major|minor|maj|min|m)?/i.exec(val); if (!m) fail(i, `조 "${val}"를 읽을 수 없어요 (예: C 장조, F# 단조)`);
        song.root = (PC_OF[m[1].toUpperCase()] + ACC[m[2]] + 12) % 12; song.mode = /단조|minor|min|^m$/i.test(m[3] || '') ? 'minor' : 'major';
      }
      else if (k === '재생') song.playMode = /song/i.test(val) ? 'song' : 'pat';
      else if (k === '템포변화' || k === '템포지도') {
        song.tempo = song.tempo || [];
        for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) { const [pt, bt] = part.split(/\s+/), t = parsePos(pt || ''), b = parseFloat(bt); if (t == null || !(b >= 20 && b <= 400)) { warn(i, `템포 변화 "${part}"를 읽을 수 없어요 (예: 17.1 140)`); continue; } song.tempo.push({t, bpm:b}); }
      }
      else if (k === '코드소리') { const v = byLabel(CHORD_SOUND, val); if (v) song.chordInst = v; else warn(i, `코드 소리 "${val}"를 몰라서 패드로 했어요`); }
      else if (k === '베이스') { const [a, b] = val.split(/\s+/); const md = byLabel(BASS_MODE, a || ''); if (md) song.bassMode = md; else warn(i, `베이스 "${val}"를 몰라서 끔으로 했어요`); if (b) { const bi = byLabel(BASS_INST, b); if (bi) song.bassInst = bi; } }
      else if (k === '드럼키트' || k === '키트') { const v = byLabel(KIT_NAME, val.replace(/풍$/, '')); if (v) song.kit = v; }
      else warn(i, `"${key}" 항목은 몰라서 건너뛰었어요`);
      return;
    }
    if (sec === 'pl') {
      const m = /^트랙\s*(\d+)$/.exec(key.trim()); if (!m) { warn(i, `"${key}"는 "트랙 1:" 모양이어야 해요`); return; }
      for (const part of val.split(',').map(x => x.trim()).filter(Boolean)) {
        const mm = /^(.+?)\s*@\s*(\d+)(?::(\d+))?(?:\+(\d+))?$/.exec(part); if (!mm) { warn(i, `"${part}"는 "패턴이름 @마디" 모양이어야 해요 (길이·시작: @1:8+2)`); continue; }
        clipsTodo.push({i, name:mm[1].trim(), t:clamp(+m[1] - 1, 0, 19), bar:+mm[2] - 1, len:mm[3] ? +mm[3] : 0, off:mm[4] ? +mm[4] : 0});
      }
      return;
    }
    if (!P) fail(i, '음이나 코드는 [패턴] 아래에 써 주세요');
    const lim = P.bars * 4 * PPQ;
    if (key === '코드') {
      for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) {
        const [pt, ct] = part.split(/\s+/), m = /^(\d+)\.(\d+)$/.exec(pt || ''), r = ct ? parseChord(ct) : null;
        if (!m || !r) { warn(i, `코드 "${part}"를 읽을 수 없어요 (예: 1.1 Fm)`); continue; }
        const beat = (+m[1] - 1) * 4 + (+m[2] - 1); if (beat < 0 || beat >= P.bars * 4 || +m[2] > 4) { warn(i, `코드 위치 ${pt}가 패턴 밖이에요`); continue; }
        P.chords[beat] = r.c; if (r.warn) warn(i, r.warn);
      }
      return;
    }
    const am = /^(.+?)\s+(볼륨|필터)$/.exec(key.trim());
    if (am && chByName.has(am[1].trim())) {   // 자동화 줄: 위치 값%
      const c = chByName.get(am[1].trim()), k = am[2] === '볼륨' ? 'vol' : 'cut'; P.auto = P.auto || {}; const A = P.auto[c.id] = P.auto[c.id] || {}; A[k] = A[k] || [];
      for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) { const [pt, vt] = part.split(/\s+/), t = parsePos(pt || ''), v = parseFloat(vt); if (t == null || !(v >= 0 && v <= 100) || t > lim) { warn(i, `자동화 "${part}"를 읽을 수 없어요 (예: 1.1.1 80)`); continue; } A[k].push({s:t, v:v / 100}); }
      return;
    }
    const c = channelNamed(i, key.trim()), arr = notesOf(P, c);
    if (/^[Xxo1-9.\-\s|]+$/.test(val)) {   // 드럼(스텝) 줄
      let k = stepAt.get(c.id) || 0;
      for (const ch of val.replace(/[\s|]/g, '')) {
        if (k >= P.bars * 16) { warn(i, `${c.name} 스텝이 패턴 길이(${P.bars}마디)보다 길어서 뒤는 버렸어요`); break; }
        const v = ch === 'X' ? 1 : ch === 'x' ? 0.6 : ch === 'o' ? 0.3 : /\d/.test(ch) ? +ch / 10 : 0;
        if (v) arr.push({p:c.kind === 'drum' ? DRUM_PITCH : 72, s:k * 12, l:12, v}); k++;
      }
      stepAt.set(c.id, k); return;
    }
    for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) {
      const tk = part.split(/\s+/), s = parsePos(tk[0] || ''), p0 = parsePitch(tk[1] || ''), l = parseLen(tk[2] || '');
      if (s == null || p0 == null || !l) { warn(i, `음 "${part}"를 읽을 수 없어요 (예: 1.2.3 G5 2 v90)`); continue; }
      if (s >= lim) { warn(i, `음 "${part}"가 패턴 밖(${P.bars}마디 뒤)이라 버렸어요`); continue; }
      let p = p0; while (p < LOW) p += 12; while (p > HIGH) p -= 12; if (p !== p0) warn(i, `${tk[1]}는 건반(${NOTE_RANGE()}) 밖이라 ${NAMES_S[p % 12]}${Math.floor(p / 12) - 1}로 옮겼어요`);
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
      if (name === '채널') { sec = 'ch'; return; }
      if (name === '플레이리스트') { sec = 'pl'; return; }
      if (name.startsWith('패턴')) {
        let rest = hm[3] || '', inner = name.slice(2).trim(); if (hm[2]) rest = (inner ? inner + ' | ' : '') + hm[2] + (rest ? ' ' + rest : ''); else if (inner) rest = inner + (rest ? ' ' + rest : '');
        const [pn, pb, pc] = rest.split('|').map(x => (x || '').trim()); const bars = parseInt((pb || '').replace(/[^\d]/g, ''), 10) || 4, color = /색\s*(\d)/.exec(pc || '');
        if (!pn) fail(i, '패턴 이름이 없어요 (예: [패턴] 후렴 | 4마디)');
        if (patByName.has(pn)) fail(i, `"${pn}" 패턴이 두 번 나와요`);
        if (bars > MAX_PAT_BARS) warn(i, `패턴은 ${MAX_PAT_BARS}마디까지 편하게 쓸 수 있어요`);
        P = newPattern(pn.slice(0, 24), clamp(bars, 1, MAX_BARS)); if (color) P.color = clamp(+color[1], 0, PAT_COLORS.length - 1); song.patterns.push(P); patByName.set(pn, P); stepAt.clear(); sec = 'pat'; return;
      }
      fail(i, `[${name}]은 모르는 칸이에요 ([채널] · [패턴] · [플레이리스트] 중 하나)`);
    }
    if (cont) { handle(i, lastKey, line); return; }
    if (sec === 'ch') {
      const m = /^(.+?)\s*=\s*(.+)$/.exec(line); if (!m) fail(i, '채널은 "이름 = 악기" 모양으로 써 주세요 (예: 킥 = 드럼 킥)');
      const name = m[1].trim(); let spec = m[2].trim(); if (chByName.has(name)) fail(i, `"${name}" 채널이 두 번 나와요`);
      const vol = /볼륨\s*(-?\d+)/.exec(spec), pan = /팬\s*(-?\d+)/.exec(spec), mute = /뮤트/.test(spec);
      spec = spec.replace(/(볼륨|팬)\s*-?\d+|뮤트/g, '').trim();
      let c;
      const dm = /^드럼\s+(.+)$/.exec(spec);
      if (dm) { const d = byLabel(DRUM_NAME, dm[1]); if (!d) fail(i, `드럼 "${dm[1]}"을 몰라요 (킥·스네어·하이햇·박수)`); c = newChannel('drum', d, name); }
      else { const inst = byLabel(INSTS, spec); if (!inst) fail(i, `악기 "${spec}"를 몰라요 (${Object.values(INSTS).join('·')})`); c = newChannel('synth', inst, name); }
      song.channels.push(c); chByName.set(name, c);
      const mx = {}; if (vol) mx.v = clamp(+vol[1] / 100, 0, 1.2); if (pan) mx.pan = clamp(+pan[1] / 100, -1, 1); if (mute) mx.mute = 1;
      if (Object.keys(mx).length) song.mix[chKey(c)] = mx;
      return;
    }
    const k = line.search(/[:：]/); if (k < 1) fail(i, '"이름: 내용" 모양이어야 해요');
    lastKey = line.slice(0, k).trim(); handle(i, lastKey, line.slice(k + 1).trim());
  });
  if (!song.patterns.length) { const e = new Error('[패턴]이 하나도 없어요'); e.line = 0; throw e; }
  if (!song.channels.length) song.channels.push(newChannel('synth', 'piano', '피아노'));
  for (const c of clipsTodo) { const p = patByName.get(c.name); if (!p) { warn(c.i, `"${c.name}" 패턴이 없어서 건너뛰었어요`); continue; } const o = {id:newId(), pat:p.id, t:c.t, bar:clamp(c.bar, 0, MAX_BARS - 1)}; if (c.len) o.len = c.len; if (c.off) o.off = c.off; song.playlist.clips.push(o); }
  if (!song.playlist.clips.length) song.playlist.clips.push({id:newId(), pat:song.patterns[0].id, t:0, bar:0});
  return {song:normalize(song), title, warnings};
}
