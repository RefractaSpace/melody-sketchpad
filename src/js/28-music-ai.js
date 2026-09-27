/* 28-music-ai.js — 음악 AI: Magenta(Google)의 음악 전용 신경망을 브라우저에서 실행
   ImprovRNN(코드 위 멜로디) · MelodyRNN(멜로디 이어 쓰기) · DrumsRNN(드럼) — 처음 쓸 때만 모델을 받아요.
   한 번에 여러 개(후보)를 짓고 음악 점수가 가장 높은 것을 골라요. */
const MM_LIB = 'https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1/dist/magentamusic.min.js', MM_CK = 'https://storage.googleapis.com/magentadata/js/checkpoints/';
let mmLib = null; const mmModels = {};
function mmLoad() { return mmLib || (mmLib = new Promise((ok, bad) => { if (window.mm) return ok(); const s = document.createElement('script'); s.src = MM_LIB; s.onload = ok; s.onerror = () => { mmLib = null; bad(new Error('음악 AI 라이브러리를 받지 못했어요 (인터넷 연결 확인)')); }; document.head.appendChild(s); })); }
async function mmModel(name) {
  await mmLoad();
  if (!mmModels[name]) mmModels[name] = (async () => { const m = new mm.MusicRNN(MM_CK + 'music_rnn/' + name); await m.initialize(); return m; })().catch(e => { delete mmModels[name]; throw e; });
  return mmModels[name];
}
const mmSeq = (notes, steps, drum) => ({notes:notes.map(([p, s, e]) => ({pitch:p, quantizedStartStep:s, quantizedEndStep:e, isDrum:!!drum})), quantizationInfo:{stepsPerQuarter:4}, totalQuantizedSteps:steps});
const MM_Q = {'':'', m:'m', '7':'7', maj7:'maj7', m7:'m7', sus4:'sus4', dim:'dim', aug:'aug'};
// 멜로디 점수 — 높을수록 좋음 (조 안 · 센박 코드음 · 알맞은 음역 · 계단 진행 · 밀도 · 끝음)
function melScore(notes, {root, minor, chordAt, steps, dens}) {
  if (notes.length < 3) return -9;
  const sc = minor ? MIN : MAJ, inKey = notes.filter(n => sc.includes((n.p - root + 120) % 12)).length / notes.length;
  const strong = notes.filter(n => n.s % 4 === 0), ct = chordAt ? strong.filter(n => chordAt(n.s).includes(n.p % 12)).length / Math.max(1, strong.length) : .5;
  const ps = notes.map(n => n.p), range = Math.max(...ps) - Math.min(...ps), iv = notes.slice(1).map((n, i) => Math.abs(n.p - notes[i].p));
  const step = iv.filter(x => x <= 2).length / Math.max(1, iv.length), big = iv.filter(x => x > 9).length / Math.max(1, iv.length), d = notes.length / steps;
  const last = notes[notes.length - 1], end = chordAt ? (chordAt(steps - 1)[0] === last.p % 12 ? 1 : chordAt(steps - 1).includes(last.p % 12) ? .5 : 0) : .5;
  return 3 * inKey + 2 * ct + (range >= 7 && range <= 16 ? 1 : range < 5 ? -1 : 0) + 1.2 * Math.min(step, .7) - 2 * big - 3 * Math.max(0, Math.abs(d - dens) - .12) + end;
}
// 길거나(8분음표 이상) 센박에 오는 조 밖 음만 가장 가까운 조 안 음으로 (짧은 경과음은 멜로디의 색이라 그대로)
function fixKey(notes, root, minor) { const sc = minor ? MIN : MAJ, ok = p => sc.includes((p - root + 120) % 12); let fixed = 0;
  for (const n of notes) if (!ok(n.p) && (n.e - n.s >= 2 || n.s % 4 === 0)) { const up = n.p + 1, dn = n.p - 1; n.p = ok(dn) ? dn : up; fixed++; } return fixed; }
const fromMM = (seq, off = 0) => seq.notes.map(n => ({p:n.pitch, s:n.quantizedStartStep + off, e:n.quantizedEndStep + off})).sort((a, b) => a.s - b.s);
const DRUM_MAP = {35:'kick', 36:'kick', 37:'snare', 38:'snare', 40:'snare', 39:'clap', 42:'hat', 44:'hat', 46:'hat', 49:'crash', 57:'crash', 55:'crash'};
// 작곡: 규칙 AI로 조·코드·반주 틀을 잡고, 멜로디와 드럼을 신경망이 지음
async function musicCompose({prompt, bars, seed, tries}) {
  const base = localCompose({prompt, bars, seed}), {root, minor} = base.key, SPB = BEATS * 4, steps = bars * SPB;
  const t = prompt.toLowerCase(), hi = /신나|빠르|댄스|edm|강하|파워|여름|축제|드럼/.test(t), calm = !hi && /잔잔|피아노|발라드|느리|조용|꿈|lofi|로파이/.test(t);
  const chordOfBar = base.chords.map(([, , rn, q]) => ({name:rn + MM_Q[q]}));
  const pcsOf = (rn, q) => { const r0 = NN.indexOf(rn), iv = {'':[0,4,7], m:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], m7:[0,3,7,10], sus4:[0,5,7], dim:[0,3,6], aug:[0,4,8]}[q] || [0,4,7]; return iv.map(x => (r0 + x) % 12); };
  const barPcs = base.chords.map(([, , rn, q]) => pcsOf(rn, q)), chordAt = s => barPcs[Math.min(bars - 1, Math.floor(s / SPB))];
  const perStep = Array.from({length:steps}, (_, s) => chordOfBar[Math.min(bars - 1, Math.floor(s / SPB))].name);
  const imp = await mmModel('chord_pitches_improv'), temp = calm ? .9 : hi ? 1.1 : 1.0, dens = calm ? .22 : hi ? .45 : .32;
  const seedP = 60 + ((barPcs[0][0] - 60) % 12 + 12) % 12 + 12, cands = [];
  for (let k = 0; k < tries; k++) {
    const g = await imp.continueSequence(mmSeq([[seedP, 0, 2]], 2), steps - 2, temp, perStep.slice(2));
    const notes = [{p:seedP, s:0, e:2}, ...fromMM(g, 2)].filter(n => n.s < steps).map(n => ({...n, e:Math.min(steps, Math.max(n.s + 1, n.e))}));
    const fixed = fixKey(notes, root, minor);
    cands.push({notes, fixed, score:melScore(notes, {root, minor, chordAt, steps, dens})});
  }
  cands.sort((a, b) => b.score - a.score); const best = cands[0];
  base.channels[0].notes = best.notes.map(n => [Math.floor(n.s / SPB) + 1, Math.floor(n.s % SPB / 4) + 1, n.s % 4 + 1, pName(Math.max(48, Math.min(96, n.p))), n.e - n.s, n.s % 4 === 0 ? .85 : .7]);
  base.channels[0].name = 'AI 멜로디';
  // 드럼: 첫 마디(규칙 비트)를 DrumsRNN이 이어서
  const dIdx = base.channels.map((c, i) => /^drum:/.test(c.inst) ? i : -1).filter(i => i >= 0);
  if (dIdx.length && bars > 1) {
    const dr = await mmModel('drum_kit_rnn'), PIT = {kick:36, snare:38, hat:42, clap:39, crash:49}, seedN = [];
    for (const i of dIdx) for (const [b, bt, st] of base.channels[i].notes) if (b === 1) { const s = (bt - 1) * 4 + st - 1; seedN.push([PIT[base.channels[i].inst.slice(5)], s, s + 1]); }
    const g = await dr.continueSequence(mmSeq(seedN, SPB, true), steps - SPB, temp), byInst = {};
    for (const i of dIdx) { const inst = base.channels[i].inst.slice(5); byInst[inst] = base.channels[i]; base.channels[i].notes = base.channels[i].notes.filter(n => n[0] === 1); }
    for (const n of fromMM(g, SPB)) { const inst = DRUM_MAP[n.p]; if (!inst || n.s >= steps) continue; const ch = byInst[inst] || (byInst[inst] = (base.channels.push({name:DRUM_NAME[inst], inst:'drum:' + inst, notes:[]}), base.channels[base.channels.length - 1]));
      ch.notes.push([Math.floor(n.s / SPB) + 1, Math.floor(n.s % SPB / 4) + 1, n.s % 4 + 1, 'C5', 1, inst === 'hat' ? .5 : .85]); }
  }
  base.title = (prompt || '음악 AI').slice(0, 24);
  return {data:base, info:`후보 ${tries}개 중 점수 ${best.score.toFixed(2)} (가장 낮은 후보 ${cands[cands.length - 1].score.toFixed(2)})${best.fixed ? ` · 조 밖 긴 음 ${best.fixed}개 고침` : ''}`};
}
// 이어 쓰기: 지금 채널 멜로디의 끝 2마디를 MelodyRNN에 주고 뒤를 지음
async function musicContinue({addBars, tries}) {
  const c = S.channels[S.ch]; if (!c || c.kind === 'drum') throw new Error('멜로디 채널(악기)을 골라 주세요');
  const P = curPat(), src = (P.notes[c.id] || []).slice().sort((a, b) => a.s - b.s); if (src.length < 2) throw new Error(`"${c.name}" 채널에 음이 2개 이상 있어야 해요`);
  const SPB = BEATS * 4, top = new Map(); for (const n of src) { const s = Math.round(n.s / 12); if (!top.has(s) || top.get(s).p < n.p) top.set(s, {p:n.p, s, e:Math.max(s + 1, Math.round((n.s + n.l) / 12))}); }
  const mono = [...top.values()].sort((a, b) => a.s - b.s); for (let i = 0; i < mono.length - 1; i++) mono[i].e = Math.min(mono[i].e, mono[i + 1].s);
  const endStep = Math.max(...mono.map(n => n.e)), from = Math.max(0, endStep - 2 * SPB), seedN = mono.filter(n => n.s >= from).map(n => [n.p, n.s - from, n.e - from]);
  const gen = addBars * SPB, needBars = Math.ceil((endStep + gen) / SPB); if (needBars > 8) throw new Error(`패턴이 8마디를 넘어요 (지금 음이 ${Math.ceil(endStep / SPB)}마디까지) — 이어 쓸 길이를 줄이거나 새 패턴에서 해 주세요`);
  const rnn = await mmModel('melody_rnn'), ps = mono.map(n => n.p), lo = Math.min(...ps), hi = Math.max(...ps), dens = Math.min(.6, Math.max(.12, mono.length / Math.max(SPB, endStep))), cands = [];
  for (let k = 0; k < tries; k++) {
    const g = await rnn.continueSequence(mmSeq(seedN, endStep - from), gen, 1.0), notes = fromMM(g, endStep).filter(n => n.s < endStep + gen).map(n => ({...n, e:Math.min(endStep + gen, Math.max(n.s + 1, n.e))})); fixKey(notes, S.root, S.mode === 'minor');
    const sc = melScore(notes.map(n => ({...n, s:n.s - endStep})), {root:S.root, minor:S.mode === 'minor', chordAt:null, steps:gen, dens}) - .15 * notes.filter(n => n.p < lo - 5 || n.p > hi + 5).length;
    cands.push({notes, score:sc});
  }
  cands.sort((a, b) => b.score - a.score); const best = cands[0]; if (!best.notes.length) throw new Error('AI가 음을 짓지 못했어요. 다시 해 보세요');
  pushUndo(); if (needBars > P.bars) { P.bars = [1, 2, 4, 8].find(b => b >= needBars); P.chords = Array.from({length:P.bars * BEATS}, (_, i) => P.chords[i] || null); }
  const arr = P.notes[c.id] = P.notes[c.id] || []; for (const n of best.notes) arr.push({s:n.s * 12, l:(n.e - n.s) * 12, p:Math.max(LOW, Math.min(HIGH, n.p)), v:n.s % 4 === 0 ? .85 : .7});
  save(); refreshAll(); return {n:best.notes.length, from:Math.floor(endStep / SPB) + 1, bars:addBars, info:`후보 ${tries}개 중 점수 ${best.score.toFixed(2)}`};
}
// 대화상자 연결: 음악 AI 엔진이면 작곡·이어 쓰기를 여기서
const ruleRunAI = runAI, ruleShowTab = aiShowTab;
runAI = async function (again) {
  const eng = $('aiEngine').value;
  if (aiTab === 'continue' || (eng === 'music' && aiTab === 'compose')) {
    const t0 = performance.now(), tries = +$('aiTries').value, first = !mmModels.chord_pitches_improv && !mmModels.melody_rnn;
    aiMsg(first ? '음악 AI 모델을 받는 중… (처음 한 번, 몇 초)' : `음악 AI가 후보 ${tries}개를 짓는 중…`);
    try {
      if (aiTab === 'compose') { if (again) aiSeed++; else aiSeed = (Date.now() & 0xffff) || 1;
        const prompt = $('aiPrompt').value.trim(), {data, info} = await musicCompose({prompt, bars:+$('aiBars').value, seed:aiSeed, tries});
        const res = applyCompose(data, prompt), m = `음악 AI: 새 패턴 "${res.P.name}" · ${res.P.bars}마디 · 음 ${res.notes}개 · ${info} (${((performance.now() - t0) / 1000).toFixed(1)}초)`; aiMsg(m); status(m);
      } else { const r = await musicContinue({addBars:+$('aiAdd').value, tries}); const m = `음악 AI: ${r.from}마디부터 ${r.bars}마디를 이어 썼어요 · 음 ${r.n}개 · ${r.info} (${((performance.now() - t0) / 1000).toFixed(1)}초, 되돌리기 Ctrl+Z)`; aiMsg(m); status(m); }
    } catch (e) { if (aiTab === 'compose' && /라이브러리|fetch|network|Failed/i.test(e.message)) { aiMsg('음악 AI를 쓸 수 없어서 규칙 AI로 했어요 (' + e.message + ')'); $('aiEngine').value = 'local'; await ruleRunAI(again); $('aiEngine').value = 'music'; } else aiMsg('음악 AI 오류: ' + e.message); }
    return;
  }
  return ruleRunAI(again);
};
aiShowTab = function (t) { ruleShowTab(t); if (t === 'continue') { $('aiRun').textContent = '이어 쓰기'; $('aiAgain').hidden = true; } $('aiTriesRow').hidden = !(t === 'continue' || (t === 'compose' && $('aiEngine').value === 'music')); document.querySelectorAll('.aiChName').forEach(x => x.textContent = (S.channels[S.ch] || {}).name || '-'); };
$('aiEngine').addEventListener('change', () => aiShowTab(aiTab));
document.querySelectorAll('#aiTabs button').forEach(b => b.onclick = () => aiShowTab(b.dataset.t));
