/* 26-ai.js — ✨ AI: 작곡 · 코드 추천 · 피드백
   엔진 두 가지: 기본 AI(앱 안에서 음악 규칙으로 계산, 바로 동작) / Claude(서버 /api/ai, 로그인 + Vercel 결제 카드 필요)
   Claude가 막히면 기본 AI로 자동 전환해요. 두 엔진 모두 같은 JSON 모양을 돌려줘서 곡에 넣는 코드는 하나예요. */
const AI_API = (window.MSK_SERVER || '') + '/api/ai', NN = 'C C# D D# E F F# G G# A A# B'.split(' ');
const pName = p => NN[p % 12] + (Math.floor(p / 12) - 1), pitchOf = s => { const m = /^([A-G])(#?)(-?\d)$/.exec(String(s).trim()); return m ? (+m[3] + 1) * 12 + NN.indexOf(m[1] + m[2]) : null; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const aiPick = (r, a) => a[Math.floor(r() * a.length)];
// 음계의 d번째 음 위에 3화음 → {r, q, pcs}
function triad(root, scale, d, seven) {
  const pc = i => (root + scale[((d + i) % 7 + 7) % 7] + 12 * Math.floor((d + i) / 7)) % 12, r = pc(0), t = (pc(2) - r + 12) % 12, f = (pc(4) - r + 12) % 12;
  let q = t === 4 && f === 7 ? '' : t === 3 && f === 6 ? 'dim' : t === 4 && f === 8 ? 'aug' : 'm';
  if (seven && q === '') q = '7';
  return {r, q, pcs:[r, (r + t) % 12, (r + f) % 12, ...(q === '7' ? [(r + 10) % 12] : [])]};
}
// ── 기본 AI: 작곡 ──
function localCompose({prompt = '', bars = 4, seed = 1, degs:degsIn = null}) {
  const r = rng(seed), t = prompt.toLowerCase(), has = re => re.test(t);
  const sad = has(/슬프|잔잔|어두|우울|밤|쓸쓸|minor|단조/), hi = has(/신나|빠르|댄스|edm|강하|파워|여름|축제|드럼/), calm = !hi && has(/잔잔|피아노|발라드|느리|조용|꿈|lofi|로파이/);
  const minor = sad || (S.mode === 'minor' && !has(/밝|행복|신나|여름|축제|장조|major/));
  const root = minor && S.mode === 'major' ? (S.root + 9) % 12 : !minor && S.mode === 'minor' ? (S.root + 3) % 12 : S.root, scale = minor ? MIN : MAJ;
  const lead = has(/피아노/) ? 'piano' : has(/신스|synth/) ? 'synth' : has(/벨|종/) ? 'bell' : has(/칩|8비트|게임/) ? 'chip' : has(/플럭/) ? 'pluck' : hi ? 'pluck' : calm ? 'piano' : 'epiano';
  const drums = hi || has(/드럼|비트/), SPB = BEATS * 4;
  const prog = aiPick(r, minor ? [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4], [5, 6, 0, 0], [0, 3, 6, 2]] : [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 4, 2, 5], [0, 3, 1, 4]]);
  const degs = degsIn ? Array.from({length:bars}, (_, b) => degsIn[b % degsIn.length]) : Array.from({length:bars}, (_, b) => b === bars - 1 && bars > 2 ? 0 : b === bars - 2 && bars > 2 ? 4 : prog[b % 4]);
  const chords = degs.map(d => triad(root, scale, d, d === 4 && minor));
  const out = {title:(prompt || '기본 AI').slice(0, 24), key:{root, minor}, channels:[], chords:degs.map((d, b) => [b + 1, 1, NN[chords[b].r], chords[b].q])};
  const put = (arr, b, st, p, len, v) => arr.push([b + 1, Math.floor(st / 4) + 1, st % 4 + 1, pName(p), len, v]);
  // 멜로디: 리듬 틀(홀수 마디 A, 짝수 마디 변형) + 센박엔 코드음, 여린박엔 음계 이웃음, 활 모양 윤곽, 끝은 으뜸음
  const rhythms = hi ? [[[0,2],[2,2],[4,2],[6,2],[8,3],[11,1],[12,4]], [[0,3],[3,3],[6,2],[8,2],[10,2],[12,4]], [[0,2],[2,1],[3,3],[6,2],[8,4],[12,2],[14,2]]]
    : calm ? [[[0,6],[6,2],[8,8]], [[0,4],[4,4],[8,8]], [[0,8],[8,4],[12,4]]] : [[[0,4],[4,2],[6,2],[8,4],[12,4]], [[0,3],[3,1],[4,4],[8,6],[14,2]], [[0,2],[2,2],[4,4],[8,4],[12,4]]];
  const A = aiPick(r, rhythms), Bv = aiPick(r, rhythms), scalePs = []; for (let p = 60; p <= 88; p++) if (scale.includes((p - root + 12) % 12)) scalePs.push(p);
  const mel = []; let cur = scalePs.reduce((a, p) => Math.abs(p - 72) < Math.abs(a - 72) ? p : a, scalePs[0]);
  for (let b = 0; b < bars; b++) {
    const rh = (b === bars - 1 ? [[0, Math.min(SPB, 8)], [Math.min(SPB, 8), SPB - Math.min(SPB, 8)]] : (b % 2 ? Bv : A)).filter(([s]) => s < SPB), goal = 67 + Math.round(10 * Math.sin(Math.PI * (b + .5) / bars));
    rh.forEach(([st, len], i) => {
      const last = b === bars - 1 && i === rh.length - 1, strong = st % 4 === 0;
      if (last) { const tonic = scalePs.filter(p => p % 12 === root); cur = tonic.reduce((a, p) => Math.abs(p - cur) < Math.abs(a - cur) ? p : a, tonic[0]); }
      else if (strong) { const ct = scalePs.filter(p => chords[b].pcs.includes(p % 12)); cur = ct.reduce((a, p) => Math.abs(p - (cur + (goal - cur) * .4)) + r() * 2 < Math.abs(a - (cur + (goal - cur) * .4)) ? p : a, ct[0]); }
      else { const k = scalePs.indexOf(cur), dir = goal > cur ? 1 : goal < cur ? -1 : (r() < .5 ? -1 : 1); cur = scalePs[Math.max(0, Math.min(scalePs.length - 1, k + (r() < .8 ? dir : -dir)))]; }
      put(mel, b, st, cur, Math.min(len, SPB - st), strong ? .85 : .7);
    });
  }
  out.channels.push({name:'AI 멜로디', inst:lead, notes:mel});
  // 베이스 · 반주 · 드럼
  const bass = [], acc = [], pad = [];
  for (let b = 0; b < bars; b++) {
    const c = chords[b], br = 36 + ((c.r - 36) % 12 + 12) % 12, fifth = br + 7;
    if (calm) put(bass, b, 0, br, SPB, .75); else if (hi) for (let s = 0; s < SPB; s += 2) put(bass, b, s, s % 8 === 6 ? fifth : br, 2, s % 4 ? .6 : .85);
    else for (let s = 0; s < SPB; s += 4) put(bass, b, s, s % 8 ? fifth : br, 4, .75);
    const vo = c.pcs.slice(0, 3).map(pc => 60 + ((pc - 60) % 12 + 12) % 12).sort((x, y) => x - y);
    if (calm) { const arp = [vo[0] - 12, vo[1] - 12, vo[2] - 12, vo[0], vo[2] - 12, vo[1] - 12]; for (let s = 0, i = 0; s < SPB; s += 2, i++) put(acc, b, s, arp[i % arp.length], 2, .55); vo.forEach(p => put(pad, b, 0, p, SPB, .45)); }
    else if (hi) for (let s = 2; s < SPB; s += 4) vo.forEach(p => put(acc, b, s, p, 2, .6));
    else for (let s = 0; s < SPB; s += 8) vo.forEach(p => put(acc, b, s, p, Math.min(6, SPB - s), .55));
  }
  out.channels.push({name:'AI 베이스', inst:'bass', notes:bass}, {name:'AI 반주', inst:calm ? 'piano' : hi ? 'supersaw' : 'epiano', notes:acc});
  if (pad.length) out.channels.push({name:'AI 패드', inst:'strings', notes:pad});
  if (drums) { const k = [], sn = [], h = [], cr = []; for (let b = 0; b < bars; b++) { for (let s = 0; s < SPB; s += 2) put(h, b, s, 72, 1, s % 4 ? .45 : .6); for (let s = 0; s < SPB; s += 8) put(k, b, s, 72, 1, .95); if (hi && r() < .5) put(k, b, 10, 72, 1, .7); for (let s = 4; s < SPB; s += 8) put(sn, b, s, 72, 1, .85); } put(cr, 0, 0, 72, 1, .8);
    out.channels.push({name:'킥', inst:'drum:kick', notes:k}, {name:'스네어', inst:'drum:snare', notes:sn}, {name:'하이햇', inst:'drum:hat', notes:h}, {name:'크래시', inst:'drum:crash', notes:cr}); }
  return out;
}
// ── 기본 AI: 코드 추천 (마디 조각마다 음 무게 → 코드 점수 + 진행 규칙, 비터비로 가장 좋은 길) ──
function localChords(melody, bars, perBar) {
  const scale = S.mode === 'minor' ? MIN : MAJ, cands = [0, 1, 2, 3, 4, 5, 6].map(d => ({d, ...triad(S.root, scale, d, false)}));
  if (S.mode === 'minor') cands.push({d:4.5, ...triad(S.root, scale, 4, true), pcs:[(S.root + 7) % 12, (S.root + 11) % 12, (S.root + 2) % 12], q:'', r:(S.root + 7) % 12});   // 화성 단음계의 V
  const nSeg = bars * perBar, segT = BAR_T / perBar, H = Array.from({length:nSeg}, () => Array(12).fill(0));
  for (const n of melody) for (let k = Math.floor(n.s / segT); k < nSeg && k * segT < n.s + n.l; k++) { const a = Math.max(n.s, k * segT), e = Math.min(n.s + n.l, (k + 1) * segT); if (e > a) H[k][n.p % 12] += (e - a) * (n.s === k * segT || n.s % PPQ === 0 ? 1.5 : 1); }
  const fit = (h, c) => { const tot = h.reduce((x, y) => x + y, 0) || 1; let s = 0; h.forEach((w, pc) => s += c.pcs.includes(pc) ? w : -.45 * w); return s / tot; };
  const move = (a, b) => { const A = Math.floor(a.d), B = Math.floor(b.d); if (A === B) return -.25; if ((B - A + 7) % 7 === 3) return .35; if (A === 4 && B === 0) return .6; if (A === 3 && B === 4) return .35; if (A === 1 && B === 4) return .45; if (A === 5 && B === 3) return .25; if (A === 0) return .15; return 0; };
  let dp = cands.map(c => ({s:fit(H[0], c) + (Math.floor(c.d) === 0 ? .3 : 0), path:[c]}));
  for (let k = 1; k < nSeg; k++) dp = cands.map(c => { let best = null; for (const p of dp) { const v = p.s + move(p.path[p.path.length - 1], c); if (!best || v > best.s) best = {s:v, path:p.path}; } return {s:best.s + fit(H[k], c) + (k === nSeg - 1 && Math.floor(c.d) === 0 ? .5 : 0), path:[...best.path, c]}; });
  const bestPath = dp.reduce((a, b) => b.s > a.s ? b : a).path;
  return bestPath.map((c, k) => { const t = k * segT; return [Math.floor(t / BAR_T) + 1, Math.floor(t % BAR_T / PPQ) + 1, NN[c.r], c.q]; });
}
// ── 기본 AI: 피드백 (곡을 재서 조언) ──
function localFeedback() {
  const all = [], byCh = {}; S.channels.forEach(c => byCh[c.id] = {c, notes:[]});
  S.patterns.forEach(P => Object.entries(P.notes).forEach(([id, a]) => a.forEach(n => { if (byCh[id]) { byCh[id].notes.push(n); all.push({...n, c:byCh[id].c}); } })));
  if (!all.length) return '• 아직 음이 없어요. ✨ AI → 작곡으로 시작해 보거나 피아노 롤에 몇 음 찍어 보세요.';
  const inst = Object.values(byCh).filter(x => x.c.kind !== 'drum' && x.notes.length), melo = inst.sort((a, b) => b.notes.reduce((s, n) => s + n.p, 0) / b.notes.length - a.notes.reduce((s, n) => s + n.p, 0) / a.notes.length)[0];
  const good = [], tip = [], melN = (melo ? melo.notes : []).slice().sort((a, b) => a.s - b.s);
  const out = all.filter(n => n.c.kind !== 'drum' && !inKey(n.p % 12)).length / Math.max(1, all.filter(n => n.c.kind !== 'drum').length);
  const vs = all.map(n => n.v), vm = vs.reduce((a, b) => a + b, 0) / vs.length, vsd = Math.sqrt(vs.reduce((a, b) => a + (b - vm) ** 2, 0) / vs.length);
  const chordsN = S.patterns.reduce((a, P) => a + P.chords.filter(c => c && !c.x).length, 0), drums = Object.values(byCh).some(x => x.c.kind === 'drum' && x.notes.length);
  if (melN.length) { const ps = melN.map(n => n.p), range = Math.max(...ps) - Math.min(...ps), leaps = melN.slice(1).filter((n, i) => Math.abs(n.p - melN[i].p) > 7).length / Math.max(1, melN.length - 1), uniq = new Set(ps).size;
    if (range >= 10 && range <= 19) good.push(`멜로디("${melo.c.name}") 음역이 ${range}반음으로 노래하기 좋은 넓이예요`); else if (range < 7) tip.push(`멜로디 음역이 ${range}반음으로 좁아요 — 후렴에서 3~5도 위로 올라가 보면 귀에 잘 들어와요`); else if (range > 24) tip.push(`멜로디 음역이 ${range}반음으로 넓어요 — 부르거나 따라가기 어려울 수 있어요`);
    if (leaps > .25) tip.push(`멜로디 도약(5도 넘게 뛰는 곳)이 ${Math.round(leaps * 100)}%예요 — 뛴 다음엔 반대 방향으로 한 걸음 돌아오면 자연스러워요`); else good.push('멜로디가 주로 계단식으로 움직여서 매끄러워요');
    if (uniq <= 3 && melN.length > 12) tip.push(`멜로디에 쓴 음이 ${uniq}가지뿐이에요 — 경과음을 넣어 보세요`); }
  if (out > .15) tip.push(`조(${names()[S.root]} ${S.mode === 'minor' ? '단조' : '장조'}) 밖의 음이 ${Math.round(out * 100)}%예요 — 일부러가 아니라면 조를 다시 확인해 보세요`); else good.push(`음 대부분(${Math.round((1 - out) * 100)}%)이 조 안에 있어서 안정적이에요`);
  if (vsd < .03) tip.push('모든 음의 세기가 거의 같아요 — 센박을 조금 세게, 여린박을 약하게 하면 사람이 친 것처럼 들려요'); else good.push('음 세기에 변화가 있어서 살아 있게 들려요');
  if (!chordsN) tip.push('코드 줄이 비어 있어요 — ✨ AI → 코드 추천으로 멜로디에 맞는 코드를 넣어 보세요');
  if (!drums && S.bpm >= 110) tip.push(`${S.bpm} BPM인데 드럼이 없어요 — 킥·스네어만 넣어도 힘이 생겨요`);
  if (!S.playlist.clips.length) tip.push('플레이리스트가 비어 있어요 — 패턴을 인트로·벌스·후렴으로 나눠 배치하면 곡이 돼요');
  else { const b = songBars(); if (b < 16) tip.push(`곡이 ${b}마디로 짧아요 — 후렴을 한 번 더 반복하고 끝맺음을 붙여 보세요`); else good.push(`곡 길이 ${b}마디, 조각 ${S.playlist.clips.length}개로 구조가 있어요`); }
  if (inst.length >= 3) good.push(`악기 채널 ${inst.length}개로 소리가 풍성해요`);
  return [...good.slice(0, 2).map(s => '• 좋은 점: ' + s), ...tip.slice(0, 5).map(s => '• 해 볼 것: ' + s)].join('\n');
}
// ── AI 답(JSON)을 곡에 넣기 ──
function applyCompose(data, label) {
  const specs = (data.channels || []).filter(c => Array.isArray(c.notes) && c.notes.length).slice(0, 8); if (!specs.length) throw new Error('AI 답에 음이 없어요');
  const maxBar = Math.max(1, ...specs.flatMap(c => c.notes.map(n => n[0] | 0))), bars = [1, 2, 4, 8].find(b => b >= Math.min(8, maxBar)) || 8;
  pushUndo(); const P = newPattern(('AI: ' + (data.title || label || '패턴')).slice(0, 30), bars); P.chords = Array(bars * BEATS).fill(null);
  let skipped = 0; const used = new Set();   // 이번에 이미 쓴 채널은 다른 파트에 다시 주지 않음 (멜로디·반주가 섞이지 않게)
  for (const sp of specs) {
    const [kind, inst] = /^drum:/.test(sp.inst) ? ['drum', sp.inst.slice(5)] : ['inst', INSTS[sp.inst] ? sp.inst : 'piano'];
    if (kind === 'drum' && !DRUM_NAME[inst]) continue;
    const free = c => !used.has(c.id) && c.kind === kind && c.inst === inst && !(curPat().notes[c.id] || []).length;
    let ch = S.channels.find(c => free(c) && (kind === 'drum' || c.name === sp.name)) || S.channels.find(free);
    if (!ch) { if (S.channels.length >= 16) { skipped++; continue; } ch = newChannel(kind, inst, kind === 'drum' ? undefined : String(sp.name || '').slice(0, 24) || undefined); S.channels.push(ch); fillMix(S); if (E) applyMix(E, S.mix); }
    used.add(ch.id); const arr = P.notes[ch.id] = P.notes[ch.id] || [];
    for (const n of sp.notes) { if (!Array.isArray(n)) { if (n.s >= 0 && n.s < bars * BAR_T) arr.push({s:Math.round(n.s), l:Math.max(3, Math.min(bars * BAR_T - n.s, Math.round(n.l))), p:kind === 'drum' ? 72 : Math.max(LOW, Math.min(HIGH, n.p)), v:Math.max(.05, Math.min(1, n.v))}); continue; }
      const [b, bt, st, pn, len, vel] = n, p = kind === 'drum' ? 72 : pitchOf(pn); if (p == null) continue;
      const s = ((b | 0) - 1) * BAR_T + ((bt | 0) - 1) * PPQ + ((st | 0) - 1) * 12; if (s < 0 || s >= bars * BAR_T) continue;
      arr.push({s, l:Math.max(3, Math.min(bars * BAR_T - s, (len | 0 || 1) * 12)), p:Math.max(LOW, Math.min(HIGH, p)), v:Math.max(.05, Math.min(1, vel > 1 ? vel / 127 : vel || .8))}); }
  }
  for (const [b, bt, rn, q] of data.chords || []) { const i = ((b | 0) - 1) * BEATS + ((bt | 0) - 1), rr = NN.indexOf(String(rn)); if (i >= 0 && i < P.chords.length && rr >= 0) P.chords[i] = {r:rr, q:MSK_Q.includes(q) ? q : ''}; }
  S.patterns.push(P); S.pat = S.patterns.length - 1; save(); refreshAll();
  return {P, skipped, notes:Object.values(P.notes).reduce((a, x) => a + x.length, 0)};
}
function applyChords(list, clearAll) {
  pushUndo(); const P = curPat(); if (clearAll) P.chords = P.chords.map(() => null); let n = 0;
  for (const [b, bt, rn, q] of list) { const i = (b - 1) * BEATS + (bt - 1), rr = NN.indexOf(String(rn)); if (i >= 0 && i < P.chords.length && rr >= 0) { P.chords[i] = {r:rr, q:MSK_Q.includes(q) ? q : ''}; n++; } }
  save(); drawChordRow(); drawPlaylist(); return n;
}
// ── 화면 ──
let aiTab = 'compose', aiSeed = 1;
const aiMsg = t => $('aiMsg').textContent = t, curMelody = () => { const c = S.channels[S.ch]; return c && c.kind !== 'drum' ? (curPat().notes[c.id] || []) : []; };
async function askClaude(body) {
  const a = authInfo(); if (!a) throw Object.assign(new Error('Claude는 로그인해야 쓸 수 있어요'), {fallback:true});
  const r = await fetch(AI_API, {method:'POST', headers:{'content-type':'application/json', authorization:'Bearer ' + a.token}, body:JSON.stringify({...body, root:S.root, mode:S.mode, bpm:S.bpm, meter:BEATS + '/4'})});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.message || 'HTTP ' + r.status), {fallback:true}); return j;
}
async function runAI(again) {
  const claude = $('aiEngine').value === 'claude', t0 = performance.now(); aiMsg(claude ? 'Claude에게 묻는 중…' : '계산 중…'); $('aiOut').textContent = '';
  const local = async why => { if (why) aiMsg(`Claude를 쓸 수 없어서 기본 AI로 했어요 (${why})`); return null; };
  try {
    if (aiTab === 'compose') {
      if (again) aiSeed++; else aiSeed = (Date.now() & 0xffff) || 1;
      const bars = +$('aiBars').value, prompt = $('aiPrompt').value.trim();
      let data = null, from = '기본 AI', note = '';
      if (claude) try { const j = await askClaude({task:'compose', prompt:prompt || '밝고 기억하기 쉬운 멜로디와 반주', bars}); data = j.data; from = 'Claude'; note = ` · 오늘 ${j.left}번 남음`; } catch (e) { if (!e.fallback) throw e; await local(e.message); }
      if (!data) data = localCompose({prompt, bars, seed:aiSeed});
      const res = applyCompose(data, prompt);
      const m = `${from}: 새 패턴 "${res.P.name}" · ${res.P.bars}마디 · 음 ${res.notes}개${res.skipped ? ` · 채널 16개가 꽉 차서 ${res.skipped}개 파트는 뺐어요` : ''}${note} (${Math.round(performance.now() - t0)}ms)`;
      status(m); if (!/기본 AI로 했어요/.test($('aiMsg').textContent)) aiMsg(m); else aiMsg($('aiMsg').textContent + ' → ' + m);
    } else if (aiTab === 'chords') {
      const mel = curMelody(); if (!mel.length) { aiMsg(`지금 채널("${(S.channels[S.ch] || {}).name || '-'}")에 음이 없어요. 멜로디 채널을 고르고 다시 눌러 주세요.`); return; }
      const P = curPat(), per = +$('aiRate').value; let list = null, from = '기본 AI';
      if (claude) try { const j = await askClaude({task:'chords', bars:P.bars, melody:mel.slice().sort((a, b) => a.s - b.s).map(n => [Math.floor(n.s / BAR_T) + 1, Math.floor(n.s % BAR_T / PPQ) + 1, Math.floor(n.s % PPQ / 12) + 1, pName(n.p), Math.max(1, Math.round(n.l / 12))])}); list = j.data.chords; from = 'Claude'; } catch (e) { if (!e.fallback) throw e; await local(e.message); }
      if (!list) list = localChords(mel, P.bars, per);
      const n = applyChords(list, true), names2 = list.slice(0, 8).map(c => c[2] + c[3]).join(' – ');
      const m = `${from}: 코드 ${n}개를 넣었어요 — ${names2}${list.length > 8 ? ' …' : ''} (되돌리기 Ctrl+Z)`; status(m); aiMsg(($('aiMsg').textContent.includes('기본 AI로 했어요') ? $('aiMsg').textContent + ' → ' : '') + m);
    } else {
      let text = null, from = '기본 AI';
      if (claude) try { const song = {bpm:S.bpm, key:names()[S.root] + ' ' + S.mode, meter:BEATS + '/4', bars:S.playlist.clips.length ? songBars() : null,
          channels:S.channels.map(c => { const ns = S.patterns.flatMap(P => P.notes[c.id] || []); return {name:c.name, inst:c.kind === 'drum' ? 'drum:' + c.inst : c.inst, notes:ns.length, low:ns.length ? pName(Math.min(...ns.map(n => n.p))) : null, high:ns.length ? pName(Math.max(...ns.map(n => n.p))) : null}; }),
          patterns:S.patterns.map(P => ({name:P.name, bars:P.bars, chords:P.chords.filter(c => c && !c.x).map(chordName).slice(0, 32)})), playlist:S.playlist.clips.slice(0, 60).map(c => [(S.patterns.find(P => P.id === c.pat) || {}).name, c.bar + 1])};
        const j = await askClaude({task:'feedback', song}); text = j.text; from = 'Claude'; } catch (e) { if (!e.fallback) throw e; await local(e.message); }
      if (!text) text = localFeedback();
      $('aiOut').textContent = text; const m = `${from}의 피드백이에요.`; aiMsg(($('aiMsg').textContent.includes('기본 AI로 했어요') ? $('aiMsg').textContent + ' → ' : '') + m);
    }
  } catch (e) { aiMsg('AI 오류: ' + e.message); }
}
function aiShowTab(t) { aiTab = t; document.querySelectorAll('#aiTabs button').forEach(b => { b.classList.toggle('solid', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); }); document.querySelectorAll('#aiDlg [data-p]').forEach(s => s.hidden = s.dataset.p !== t);
  $('aiRun').textContent = t === 'compose' ? '만들기' : t === 'chords' ? '추천해서 넣기' : '지금 곡 분석'; $('aiAgain').hidden = t !== 'compose'; $('aiChName').textContent = (S.channels[S.ch] || {}).name || '-'; }
document.querySelectorAll('#aiTabs button').forEach(b => b.onclick = () => aiShowTab(b.dataset.t));
$('aiBtn').onclick = () => { aiShowTab(aiTab); aiMsg(authInfo() ? '' : 'Claude 엔진은 로그인해야 쓸 수 있어요. 기본 AI는 바로 돼요.'); openDlg($('aiDlg')); };
$('aiRun').onclick = () => runAI(false); $('aiAgain').onclick = () => runAI(true); $('aiClose').onclick = () => $('aiDlg').close();
$('aiEngine').value = lsGet('msk-ai-engine') || 'music'; $('aiEngine').onchange = () => lsSet('msk-ai-engine', $('aiEngine').value);
