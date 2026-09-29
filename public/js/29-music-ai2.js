/* 29-music-ai2.js — 음악 AI 2: 신경망 반주(MusicVAE multitrack_chords) · 사람처럼 치는 드럼(GrooVAE) · 곡 전체 편곡
   모델은 처음 쓸 때만 받고, 사용자 컴퓨터에 그래픽카드(WebGL)가 있으면 자동으로 씀. */
const MV_CK = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/', mvModels = {};
let mmBackendP = null;
function mmBackend() { return mmBackendP || (mmBackendP = (async () => { try { if (mm.tf.getBackend() !== 'webgl') { await mm.tf.setBackend('webgl'); await mm.tf.ready(); } } catch (e) { try { await mm.tf.setBackend('cpu'); } catch (_) {} } return mm.tf.getBackend(); })()); }
const rnnModel = mmModel; mmModel = async name => { await mmLoad(); await mmBackend(); return rnnModel(name); };
async function mvModel(name) { await mmLoad(); await mmBackend(); if (!mvModels[name]) mvModels[name] = (async () => { const m = new mm.MusicVAE(MV_CK + name); await m.initialize(); return m; })().catch(e => { delete mvModels[name]; throw e; }); return mvModels[name]; }
// GM 악기 번호 → 이 앱의 악기 (베이스·효과음·민속 악기는 버림: 베이스는 따로 신경망이 만들고, 나머지는 반주에 어울리지 않음)
function progInst(p) {
  if (p <= 5) return 'piano'; if (p <= 7) return 'pluck'; if (p === 8) return 'celesta'; if (p <= 15) return 'bell';
  if (p <= 23) return 'strings'; if (p <= 31) return 'pluck'; if (p <= 39) return null; if (p === 46) return 'harp';
  if (p <= 55) return 'strings'; if (p <= 79) return 'synth'; if (p <= 87) return 'synth'; if (p <= 95) return 'strings'; return null;
}
const chordSym = ([rn, q]) => rn + ({'':'', m:'m', '7':'7', maj7:'maj7', m7:'m7', sus4:'', dim:'dim', aug:'aug'}[q] ?? '');
// 신경망 반주: 후보(스타일 값) K개를 코드마다 한 번에 풀어 보고, 코드음·악기·음역 점수가 가장 좋은 스타일을 고름
async function neuralComp(barChords, {K = 3, temp = .5, melTop = 76, energy = 1, avoid = [], cache = null, key = null} = {}) {
  const mc = await mvModel('multitrack_chords'), zDims = (mc.decoder && mc.decoder.zDims) || 256;
  // 곡 하나 = 반주 스타일 하나: 스타일 값(z)과 코드별 결과를 곡 전체에서 공유 → 같은 코드는 한 번만 계산, 구간이 바뀌어도 같은 악기
  const C = cache || {}; if (!C.z) { C.z = mm.tf.randomNormal([K, zDims]); C.byChord = {}; C.K = K; }
  const uniq = [...new Set(barChords.map(chordSym))], byChord = C.byChord; K = C.K;
  try { for (const c of uniq) if (!byChord[c]) byChord[c] = await mc.decode(C.z, temp, {chordProgression:[c]}); } finally { if (!cache) { C.z.dispose(); } }
  const cands = [];
  for (let k = 0; k < K; k++) {
    const parts = {}; let tot = 0, ct = 0, good = 0, all = 0, high = 0;
    barChords.forEach((ch, b) => {
      const ns = byChord[chordSym(ch)][k], pcs = pcsOfChord(ch[0], ch[1]);
      for (const n of ns.notes) {
        all++; if (n.isDrum) continue; const inst = progInst(n.program || 0); if (!inst) continue; good++;
        const s = n.quantizedStartStep * 2, e = Math.max(s + 3, n.quantizedEndStep * 2); if (s >= BAR_T) continue;   // 24칸/박 × 2 = 48틱/박
        (parts[inst] = parts[inst] || []).push({s:b * BAR_T + s, l:Math.min(e, BAR_T) - s, p:n.pitch, v:Math.min(1, (n.velocity || 80) / 127 * (.65 + .35 * energy))});
        tot++; if (pcs.includes(n.pitch % 12)) ct++; if (n.pitch > melTop) high++;
      }
    });
    const kinds = Object.keys(parts).filter(i => !avoid.includes(i)); if (!tot || !kinds.length) continue;
    const score = 3 * ct / tot + 1.5 * good / Math.max(1, all) - 2 * high / tot - (kinds.length > 3 ? .5 : 0) + (tot / barChords.length >= 2 ? .5 : -1) + (C.k === k ? 2 : 0);
    cands.push({parts, kinds, score, ct:ct / tot, k});
  }
  cands.sort((a, b) => b.score - a.score); const best = cands[0]; if (!best) return null; if (cache && C.k == null) C.k = best.k;
  // 에너지를 음 수로: 약한 구간은 박마다(인트로·아웃트로) 또는 8분음표 칸만(벌스) 남김 → 후렴이 가장 빽빽해짐
  const grid = energy < .5 ? PPQ : energy < .8 ? PPQ / 2 : 0;
  for (const i of best.kinds) { let ns = best.parts[i]; if (grid) ns = ns.filter(n => n.s % grid === 0).map(n => ({...n, l:Math.max(n.l, grid)}));
    if (key) { const sc = key.minor ? MIN : MAJ, ok = p => sc.includes((p - key.root + 120) % 12); ns.forEach(n => { if (!ok(n.p) && n.l >= PPQ / 2) n.p = ok(n.p - 1) ? n.p - 1 : n.p + 1; }); }   // 조 밖 긴 음 보정
    best.parts[i] = ns; }
  const NAME = {piano:'AI 반주 피아노', pluck:'AI 반주 기타', strings:'AI 반주 현악', synth:'AI 반주 신스', bell:'AI 반주 벨', celesta:'AI 반주 첼레스타', harp:'AI 반주 하프'};
  return {channels:best.kinds.slice(0, energy < .8 ? 1 : 3).map(i =>   // 약한 구간(벌스·브리지·인트로·아웃트로)은 반주 악기 하나, 후렴만 전부
 ({name:NAME[i] || 'AI 반주', inst:i, notes:best.parts[i]})), chordTone:best.ct, score:best.score, K:cands.length};
}
// 사람처럼: 2마디씩 GrooVAE에 넣어 나온 박자 흔들림·세기만 가져옴 (새 타격은 더하지 않음)
async function humanizeDrums(chs, bars, bpm) {
  const gv = await mvModel('groovae_2bar_humanize'), SPB = BEATS * 4, PIT = {kick:36, snare:38, hat:42, clap:39, crash:49};
  const hits = []; chs.forEach((c, ci) => c.notes.forEach((n, ni) => { const s = Array.isArray(n) ? (n[0] - 1) * SPB + (n[1] - 1) * 4 + n[2] - 1 : Math.round(n.s / 12); hits.push({ci, ni, s, p:PIT[c.inst.slice(5)] || 42, v:Array.isArray(n) ? n[5] : n.v}); }));
  const secTick = 60 / bpm / PPQ, out = new Map(); let moved = 0, dev = 0;
  for (let c0 = 0; c0 < bars * SPB; c0 += 32) {
    const chunk = hits.filter(h => h.s >= c0 && h.s < c0 + 32); if (!chunk.length) continue;
    const q = {notes:chunk.map(h => ({pitch:h.p, quantizedStartStep:h.s - c0, quantizedEndStep:h.s - c0 + 1, isDrum:true, velocity:Math.round(h.v * 127)})), quantizationInfo:{stepsPerQuarter:4}, totalQuantizedSteps:32, tempos:[{time:0, qpm:bpm}]};
    const zz = await gv.encode([q]); const h = (await gv.decode(zz, .001, undefined, undefined, bpm))[0]; zz.dispose();
    for (const o of chunk) {
      const want = (o.s - c0) * 12 * secTick; let best = null;
      for (const n of h.notes) if (n.pitch === o.p && Math.abs(n.startTime - want) < 12 * secTick * .75 && (!best || Math.abs(n.startTime - want) < Math.abs(best.startTime - want))) best = n;
      if (!best) continue; const off = Math.max(-6, Math.min(6, Math.round((best.startTime - want) / secTick)));
      out.set(o.ci + ':' + o.ni, {off, v:Math.max(.08, Math.min(1, .35 * o.v + .65 * (best.velocity || 80) / 127))}); moved++; dev += (off * secTick * 1000) ** 2;
    }
  }
  chs.forEach((c, ci) => { c.notes = c.notes.map((n, ni) => { const s = Array.isArray(n) ? ((n[0] - 1) * SPB + (n[1] - 1) * 4 + n[2] - 1) * 12 : n.s, m = out.get(ci + ':' + ni); return {s:Math.max(0, s + (m ? m.off : 0)), l:6, p:72, v:m ? m.v : (Array.isArray(n) ? n[5] : n.v)}; }); });
  return {moved, rmsMs:moved ? Math.sqrt(dev / moved) : 0};
}
// 드럼 필인: 구간 마지막 마디를 DrumsRNN이 앞 마디를 듣고 더 세게(온도 높게) 다시 침
async function drumFill(chs, bars) {
  if (bars < 2) return false; const SPB = BEATS * 4, PIT = {kick:36, snare:38, hat:42, clap:39, crash:49}, back = {36:'kick', 38:'snare', 40:'snare', 42:'hat', 44:'hat', 46:'hat', 39:'clap', 49:'crash', 57:'crash', 45:'snare', 47:'snare', 48:'snare', 50:'snare'};
  const tick = n => Array.isArray(n) ? ((n[0] - 1) * SPB + (n[1] - 1) * 4 + n[2] - 1) * 12 : n.s, lastS = (bars - 1) * SPB * 12, prevS = (bars - 2) * SPB * 12;
  const seedN = []; chs.forEach(c => c.notes.forEach(n => { const t = tick(n); if (t >= prevS && t < lastS) { const s = Math.round((t - prevS) / 12); seedN.push([PIT[c.inst.slice(5)] || 42, s, s + 1]); } }));
  if (!seedN.length) return false;
  const dr = await mmModel('drum_kit_rnn'), g = await dr.continueSequence(mmSeq(seedN, SPB, true), SPB, 1.3);
  chs.forEach(c => { c.notes = c.notes.filter(n => tick(n) < lastS); });
  for (const n of g.notes) { const inst = back[n.pitch]; const c = chs.find(x => x.inst === 'drum:' + inst); if (!c || n.quantizedStartStep >= SPB) continue; c.notes.push({s:lastS + n.quantizedStartStep * 12, l:6, p:72, v:inst === 'hat' ? .5 : .9}); }
  return true;
}
// 한 구간(또는 한 패턴) 만들기: 멜로디·베이스(음악 AI 1) + 신경망 반주 + 필인 + 사람처럼
async function musicSection({prompt, bars, seed, tries, degs, lift = 0, form = 'song', noMelody = false, energy = 1, drums = 'auto', fill = false, pad = true, neural = true, compCache = null}) {
  const {data, info} = await musicCompose({prompt, bars, seed, tries, degs, lift, form, noMelody, bassTries:compCache ? Math.max(1, tries >> 1) : tries}), notes = [];
  const drumCh = data.channels.filter(c => /^drum:/.test(c.inst));
  if (drums === 'none') data.channels = data.channels.filter(c => !/^drum:/.test(c.inst));
  else if (drums === 'light') data.channels = data.channels.filter(c => !['drum:snare', 'drum:crash'].includes(c.inst));
  if (!pad) data.channels = data.channels.filter(c => c.name !== 'AI 패드');
  let comp = null;
  if (neural) {
    const melTop = Math.max(64, ...data.channels[0].notes.map(n => Array.isArray(n) ? pitchOf(n[3]) : n.p)) - 2;
    comp = await neuralComp(data.chords.map(c => [c[2], c[3]]), {K:tries >= 8 ? 4 : 3, melTop:noMelody ? 84 : melTop, energy, cache:compCache, key:data.key}).catch(() => null);
    if (comp && comp.chordTone >= .6) { data.channels = data.channels.filter(c => c.name !== 'AI 반주'); data.channels.push(...comp.channels); } else comp = null;   // 코드와 안 맞으면 규칙 반주 유지
  }
  let fillDone = false, hum = null; const dch = data.channels.filter(c => /^drum:/.test(c.inst));
  if (dch.length) { if (fill) fillDone = await drumFill(dch, bars).catch(() => false); hum = await humanizeDrums(dch, bars, S.bpm).catch(() => null); }
  // 세기: 구간 에너지에 맞춰 (드럼·반주 제외 나머지)
  if (energy < 1) data.channels.forEach(c => { if (/^drum:/.test(c.inst)) return; c.notes = c.notes.map(n => Array.isArray(n) ? [...n.slice(0, 5), n[5] * (.55 + .45 * energy)] : {...n, v:n.v * (.55 + .45 * energy)}); });
  void notes; void drumCh;
  return {data, info:info + (comp ? ` · 신경망 반주(코드음 ${Math.round(comp.chordTone * 100)}%)` : ' · 규칙 반주') + (fillDone ? ' · 필인' : '') + (hum ? ` · 사람처럼(±${hum.rmsMs.toFixed(0)}ms)` : '')};
}
// 곡 전체 편곡: 구간마다 패턴을 만들고 지금 곡 뒤에 플레이리스트로 이어 붙임
async function musicArrange({prompt, seed, tries, onStep = () => {}}) {
  const key = localCompose({prompt, bars:4, seed}).key, minor = key.minor, t = prompt.toLowerCase(), hasDrums = /신나|빠르|댄스|edm|강하|파워|여름|축제|드럼|비트/.test(t);
  const D = minor ? {verse:[0, 5, 2, 6], chorus:[5, 6, 0, 4, 5, 6, 0, 0], bridge:[3, 6, 2, 4], intro:[5, 6, 0, 0], outro:[5, 6, 0, 0]}
                  : {verse:[0, 5, 3, 4], chorus:[3, 4, 0, 5, 3, 4, 0, 0], bridge:[5, 3, 0, 4], intro:[3, 4, 0, 5], outro:[3, 4, 0, 0]};
  const SECS = [
    {id:'intro', name:'인트로', bars:4, degs:D.intro, noMelody:true, energy:.35, drums:hasDrums ? 'light' : 'none', pad:true},
    {id:'verse', name:'벌스', bars:8, degs:D.verse, energy:.65, drums:hasDrums ? 'light' : 'none', pad:false, fill:hasDrums},
    {id:'chorus', name:'후렴', bars:8, degs:D.chorus, lift:4, form:'chorus', energy:1, drums:'auto', pad:true},
    {id:'bridge', name:'브리지', bars:4, degs:D.bridge, lift:2, energy:.55, drums:hasDrums ? 'light' : 'none', pad:true, fill:hasDrums},
    {id:'outro', name:'아웃트로', bars:4, degs:D.outro, noMelody:true, energy:.3, drums:'none', pad:true}];
  const ORDER = ['intro', 'verse', 'chorus', 'bridge', 'chorus', 'outro'], made = {}, infos = [], compCache = {};
  const ORD = ['chorus', 'verse', 'bridge', 'intro', 'outro'];   // 후렴을 먼저 만들어 곡의 반주 스타일을 후렴 기준으로 정함
  for (let j = 0; j < ORD.length; j++) {
    const i = SECS.findIndex(x => x.id === ORD[j]), s = SECS[i]; onStep(`${s.name} 만드는 중 (${j + 1}/${SECS.length})`);
    const {data, info} = await musicSection({prompt, bars:s.bars, seed:seed + i * 7, tries, degs:s.degs, lift:s.lift || 0, form:s.form || 'song', noMelody:!!s.noMelody, energy:s.energy, drums:s.drums, fill:!!s.fill, pad:s.pad, compCache});
    data.title = s.name; made[s.id] = data; infos.push(`${s.name}: ${info.split(' · ').slice(1).join(' · ')}`);
  }
  if (compCache.z) compCache.z.dispose();
  pushUndo(); const start = S.playlist.clips.length ? songBars() : 0, pats = {};
  for (const s of SECS) { const res = applyCompose(made[s.id], s.name); res.P.name = `AI 편곡: ${s.name}`; pats[s.id] = res.P; }
  let bar = start; const clips = [];
  for (const id of ORDER) { const P = pats[id]; S.playlist.clips.push({id:newId(), pat:P.id, t:0, bar}); clips.push([id, bar]); bar += P.bars; }
  S.playMode = 'song'; save(); refreshAll();
  return {bars:bar - start, start, sections:ORDER.length, patterns:SECS.length, infos, pats};
}
// 대화상자 연결: 작곡은 음악 AI 2로, "곡 전체"는 편곡으로. 대화상자를 열면 모델을 미리 받아 둠
const ai1Run = runAI;
runAI = async function (again) {
  if ($('aiEngine').value === 'music' && aiTab === 'compose') {
    const t0 = performance.now(), tries = +$('aiTries').value, song = $('aiBars').value === 'song', prompt = $('aiPrompt').value.trim();
    if (again) aiSeed++; else aiSeed = (Date.now() & 0xffff) || 1;
    const tick = msg => aiMsg(`${msg} · ${((performance.now() - t0) / 1000).toFixed(0)}초`);
    try {
      tick(mvModels.multitrack_chords ? '음악 AI 2가 짓는 중' : '음악 AI 2 모델을 받는 중 (처음 한 번)');
      if (song) { const r = await musicArrange({prompt, seed:aiSeed, tries, onStep:tick}); const m = `음악 AI 2: 곡 전체 편곡 ${r.bars}마디 (인트로·벌스·후렴·브리지·후렴·아웃트로)를 ${r.start + 1}마디부터 붙였어요 · ${((performance.now() - t0) / 1000).toFixed(1)}초 (되돌리기 Ctrl+Z)`; aiMsg(m); status(m); }
      else { const bars = +$('aiBars').value, {data, info} = await musicSection({prompt, bars, seed:aiSeed, tries, fill:false, neural:tries > 1});
        const res = applyCompose(data, prompt), m = `음악 AI 2: 새 패턴 "${res.P.name}" · ${res.P.bars}마디 · 음 ${res.notes}개 · ${info} (${((performance.now() - t0) / 1000).toFixed(1)}초)`; aiMsg(m); status(m); }
    } catch (e) { aiMsg('음악 AI 2 오류: ' + e.message); }
    return;
  }
  return ai1Run(again);
};
$('aiBtn').addEventListener('click', () => setTimeout(() => { if ($('aiEngine').value !== 'music') return; mmLoad().then(() => Promise.all([mmModel('chord_pitches_improv'), mvModel('multitrack_chords')])).catch(() => {}); }, 400));
