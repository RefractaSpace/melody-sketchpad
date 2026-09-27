/* 04-audio.js — 소리 엔진 (음색 · 믹서 채널 · 사이드체인 · 피아노 샘플)
   채널은 필요할 때 만들어져요: 채널 랙의 채널마다 'ch:<id>', 그리고 코드·베이스 */
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const SAMPLES = {};            // 샘플 칸 → {buf, root, name}
const PIANO = {};              // 건반 번호 → AudioBuffer (Salamander Grand Piano, CC-BY 3.0)
const PIANO_CDN = 'https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/';
const PIANO_L = {soft:{}, hard:{}}, PIANO_LG = {soft:{}, hard:{}};   // 세기 층: 약하게(v4)·세게(v14) 녹음과 크기 맞춤 배수
let ctx = null, E = null, pianoState = 'wait';

// ---- 피아노 소리: piano.js가 뒤에서 도착하면 그때 준비 (그동안은 합성 피아노) ----
function pianoStat(t) { const el = $('pianoStat'); if (el) el.textContent = t; }
async function decodePianoB64(src, into = PIANO) {
  for (const [k, b64] of Object.entries(src)) {
    try { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); into[+k] = await decode(u.buffer); } catch (e) {}
  }
}
// 세기 층은 기본 피아노가 준비된 뒤에 뒤에서 불러와요 (한 파일 버전은 이미 들어 있음)
let layerState = 'wait';
async function decodeLayers() {
  const L = window.PIANO_LAYERS || {};
  for (const n of ['soft', 'hard']) if (L[n] && !Object.keys(PIANO_L[n]).length) { Object.assign(PIANO_LG[n], L[n].gain); await decodePianoB64(L[n].s, PIANO_L[n]); delete L[n].s; }
  if (Object.keys(PIANO_L.soft).length && Object.keys(PIANO_L.hard).length && layerState !== 'ready') { layerState = 'ready'; pianoStat('피아노 세기 층 준비됨 (약하게·세게 친 녹음)'); setTimeout(() => pianoStat(''), 3000); }
}
function loadLayers() {
  if (layerState !== 'wait') return; layerState = 'loading';
  window.addEventListener('piano-layer-ready', () => decodeLayers());
  const L = window.PIANO_LAYERS || {};
  for (const n of ['soft', 'hard']) if (!L[n]) { const sc = document.createElement('script'); sc.src = `piano-${n}.js`; sc.async = true; document.head.appendChild(sc); }
  decodeLayers();
}
async function loadPianoCDN() {
  const pc = {C:0, Ds:3, Fs:6, A:9}, list = [[96, 'C7']];
  for (let o = 2; o <= 6; o++) for (const n of ['C', 'Ds', 'Fs', 'A']) list.push([12 * (o + 1) + pc[n], n + o]);
  await Promise.all(list.map(async ([m, nm]) => { try { const r = await fetch(PIANO_CDN + nm + '.mp3'); if (r.ok) PIANO[m] = await decode(await r.arrayBuffer()); } catch (e) {} }));
}
async function preparePiano() {
  if (pianoState !== 'wait') return; pianoState = 'loading';
  if (window.PIANO_SAMPLES) await decodePianoB64(window.PIANO_SAMPLES); else await loadPianoCDN();
  pianoState = Object.keys(PIANO).length ? 'ready' : 'fail';
  pianoStat(pianoState === 'ready' ? '녹음 피아노 준비됨' : '녹음 피아노를 못 불러와서 합성 피아노를 써요');
  setTimeout(() => { if (pianoState === 'ready' && layerState !== 'ready') pianoStat(''); }, 3000);
  if (pianoState === 'ready' && window.PIANO_SAMPLES) loadLayers();
}
// ---- 서버 에셋: /assets/piano/{base,soft,hard}/<음>.mp3 — 한 번 받으면 내 컴퓨터(캐시)에 보관 ----
const ASSET_BASE = (window.MSK_SERVER || '') + '/assets/piano/', ASSET_CACHE = 'msk-assets-v1';
async function fetchCached(url, networkFirst) {
  let cache = null; try { cache = await caches.open(ASSET_CACHE); } catch (e) {}
  if (cache && !networkFirst) { const hit = await cache.match(url).catch(() => null); if (hit) return hit.arrayBuffer(); }
  try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); if (cache) cache.put(url, r.clone()).catch(() => {}); return await r.arrayBuffer(); }
  catch (e) { if (cache) { const hit = await cache.match(url).catch(() => null); if (hit) return hit.arrayBuffer(); } throw e; }
}
async function loadPianoAssets() {
  if (location.protocol === 'file:' && !window.MSK_SERVER) return false;   // 파일로 연 웹 페이지는 예전 방식(piano.js)
  try {
    const man = JSON.parse(new TextDecoder().decode(await fetchCached(ASSET_BASE + 'manifest.json', true))), L = man.layers;
    const one = async (layer, k, into) => { into[k] = await decode(await fetchCached(`${ASSET_BASE}${layer}/${k}.mp3`)); };
    await Promise.all(L.base.keys.map(k => one('base', k, PIANO)));
    pianoState = 'ready'; pianoStat('녹음 피아노 준비됨 (서버)'); layerState = 'loading';
    for (const n of ['soft', 'hard']) if (L[n]) { Object.assign(PIANO_LG[n], L[n].gain); await Promise.all(L[n].keys.map(k => one(n, k, PIANO_L[n]))); }
    layerState = 'ready'; pianoStat('피아노 세기 층 준비됨'); setTimeout(() => pianoStat(''), 3000); return true;
  } catch (e) { if (!Object.keys(PIANO).length) return false; layerState = 'wait'; return true; }   // 기본 층은 받았으면 그대로 씀
}
function watchPiano() {
  if (window.PIANO_SAMPLES) { preparePiano(); return; }
  pianoStat('녹음 피아노 불러오는 중… (그동안은 합성 피아노)');
  window.addEventListener('piano-samples-ready', () => preparePiano(), {once:true});
  // 화면을 그린 뒤에 요청 → 느린 네트워크에서도 앱이 먼저 떠요. 못 받으면 CDN으로
  setTimeout(() => loadPianoAssets().then(ok => { if (ok) return; const sc = document.createElement('script'); sc.src = window.PIANO_SRC || 'piano.js'; sc.async = true; sc.onerror = () => preparePiano(); document.head.appendChild(sc); }), 30);
}
function pianoSample(E, m, t, d, vel, dest, T) {
  T = T || toneDefault(); const keys = Object.keys(PIANO).map(Number); if (!keys.length) return false;
  let r = keys[0]; for (const k of keys) if (Math.abs(k - m) < Math.abs(r - m)) r = k;
  const ac = E.ac, rate = Math.pow(2, (m - r) / 12);
  // 세기 층 섞기: 약하게 ~0.3 | 섞음 | 0.55~0.75 기본 | 섞음 | 0.95~ 세게 (소리 크기가 같게 섞는 코사인 곡선)
  const hasL = PIANO_L.soft[r] && PIANO_L.hard[r], ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1), cf = x => [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
  let layers = [[PIANO[r], 1]];
  if (hasL) { if (vel < 0.55) { const [a, b] = cf(ramp(vel, 0.3, 0.55)); layers = [[PIANO_L.soft[r], a * (PIANO_LG.soft[r] || 1)], [PIANO[r], b]]; }
    else if (vel > 0.75) { const [a, b] = cf(ramp(vel, 0.75, 0.95)); layers = [[PIANO[r], a], [PIANO_L.hard[r], b * (PIANO_LG.hard[r] || 1)]]; } }
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, ((hasL ? 5000 : 2200) + (hasL ? 11000 : 11000) * vel) * T.br); lp.Q.value = 0.5;
  let longest = 0; const srcs = [];
  for (const [buf, w] of layers) { if (!buf || w < 0.01) continue; const src = ac.createBufferSource(), lg = ac.createGain(); src.buffer = buf; src.playbackRate.value = rate; bendParam(src.playbackRate, rate); lg.gain.value = w; src.connect(lg); lg.connect(lp); srcs.push(src); longest = Math.max(longest, buf.duration); }
  const g = ac.createGain(), lv = (0.45 + 0.55 * vel) * 0.9;
  if (T.atk > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lv, t + T.atk); } else g.gain.setValueAtTime(lv, t);
  const off = Math.max(t + d, t + 0.08 + T.atk); g.gain.setValueAtTime(lv, off); g.gain.setTargetAtTime(0.0001, off, Math.max(0.03, T.rel) / 3);
  lp.connect(g); g.connect(dest);
  for (const src of srcs) { src.start(t); src.stop(Math.min(off + Math.max(0.6, T.rel * 2), t + longest / rate + 0.05)); } return true;
}

// ---- 엔진 ----
function ensureCtx() { if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); E = makeEngine(ctx, true); applyMix(E, S.mix); } if (ctx.state === 'suspended') ctx.resume(); }
function makeIR(ac, sec) {
  const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < ac.sampleRate * 0.012 ? i / (ac.sampleRate * 0.012) : 1); } }
  return b;
}
function makeEngine(ac, live) {
  const E = {ac, ch:{}}, mk = () => ac.createGain();
  // 마스터: 글루 압축 → 부드러운 클리핑 → 리미터
  E.in = mk(); const glue = ac.createDynamicsCompressor(); glue.threshold.value = -16; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.2;
  const shp = ac.createWaveShaper(), cv = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; cv[i] = Math.tanh(1.3 * x) / Math.tanh(1.3); } shp.curve = cv; shp.oversample = '2x';
  const lim = ac.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
  E.out = mk(); E.mfx = {fxIn:mk(), fxOut:mk(), fxSig:'', fxNodes:[]}; E.mAuto = mk();   // 마스터 이펙트 칸 · 곡 자동화(마스터 볼륨)
  E.in.connect(E.mfx.fxIn); E.mfx.fxIn.connect(E.mfx.fxOut); E.mfx.fxOut.connect(E.mAuto); E.mAuto.connect(glue); glue.connect(shp); shp.connect(lim); lim.connect(E.out); E.out.connect(ac.destination);
  if (live) { E.meter = ac.createAnalyser(); E.meter.fftSize = 1024; E.out.connect(E.meter); }
  // 공간: 리버브 · 핑퐁 딜레이
  E.rev = ac.createConvolver(); E.revRet = mk(); E.revRet.gain.value = 0.9; E.rev.connect(E.revRet); E.revRet.connect(E.in);
  const dl = ac.createDelay(2), dr = ac.createDelay(2), fbl = mk(), fbr = mk(), dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 4500;
  const mg = ac.createChannelMerger(2); E.dlyIn = mk(); E.dlyIn.connect(dlp); dlp.connect(dl); dl.connect(dr); dl.connect(fbl); dr.connect(fbr); fbr.connect(dl);
  dl.connect(mg, 0, 0); dr.connect(mg, 0, 1); E.dlyRet = mk(); E.dlyRet.gain.value = 0.7; mg.connect(E.dlyRet); E.dlyRet.connect(E.in); E._dl = [dl, dr, fbl, fbr];
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; E.noise = nb;
  E.waves = makeWaves(ac); E.size = -1;
  return E;
}
// 채널: 입력 → 사이드체인 → EQ(저·중·고) → 이펙트 칸 → 자동화(볼륨·필터) → 볼륨 → 팬 → 마스터 (+ 리버브·딜레이 센드)
function getCh(E, key) {
  if (E.ch[key]) return E.ch[key];
  const ac = E.ac, mk = () => ac.createGain();
  const inp = mk(), duck = mk(), vol = mk(), pan = ac.createStereoPanner(), rs = mk(), ds = mk();
  const lo = ac.createBiquadFilter(), md = ac.createBiquadFilter(), hi = ac.createBiquadFilter();
  lo.type = 'lowshelf'; lo.frequency.value = 180; md.type = 'peaking'; md.frequency.value = 1200; md.Q.value = 0.8; hi.type = 'highshelf'; hi.frequency.value = 5000;
  // 곡 자동화용: sVol · sCut · sPan (패턴 자동화 aVol·aCut과 따로)
  const sVol = mk(), sCut = ac.createBiquadFilter(), sPan = ac.createStereoPanner(); sCut.type = 'lowpass'; sCut.frequency.value = AUTO_CUT_MAX; sCut.Q.value = 0.7;
  const fxIn = mk(), fxOut = mk(), aVol = mk(), aCut = ac.createBiquadFilter(); aCut.type = 'lowpass'; aCut.frequency.value = AUTO_CUT_MAX; aCut.Q.value = 0.7;
  inp.connect(duck); duck.connect(lo); lo.connect(md); md.connect(hi); hi.connect(fxIn); fxIn.connect(fxOut); fxOut.connect(aVol); aVol.connect(aCut); aCut.connect(sVol); sVol.connect(sCut); sCut.connect(vol); vol.connect(pan); pan.connect(sPan); pan.connect(rs); pan.connect(ds); rs.connect(E.rev); ds.connect(E.dlyIn);
  const m = S.mix[key] || chDefault(key, key.startsWith('ch:') ? chById(key.slice(3)) : null); vol.gain.value = m.v; pan.pan.value = m.pan; rs.gain.value = m.rev; ds.gain.value = m.dly;
  sPan.connect(outDest(E, key, m));   // 출력: 마스터 또는 버스 (m이 정해진 뒤에)
  const ch = E.ch[key] = {inp, duck, vol, pan, rs, ds, lo, md, hi, fxIn, fxOut, aVol, aCut, sVol, sCut, sPan, outKey:outKey(key, m), fxSig:'', fxNodes:[]};
  applyFx(E, ch, m.fx || []); return ch;
}
// 채널 출력: 마스터 또는 버스 1·2 (버스 자신은 늘 마스터로)
const BUSES = ['bus1', 'bus2'], outKey = (key, m) => !BUSES.includes(key) && key !== 'master' && m && BUSES.includes(m.out) ? m.out : 'master';
function outDest(E, key, m) { const o = outKey(key, m); return o === 'master' ? E.in : getCh(E, o).inp; }
// ---- 이펙트 칸 (채널마다 3칸) — a·b는 0~1 손잡이 ----
const FX_TYPES = ['', 'comp', 'dist', 'lpf', 'hpf', 'chorus', 'reverb', 'delay', 'eq', 'width', 'eq4', 'gate'], FX_SLOTS = 5, FX_KEYS = ['a', 'b', 'c', 'd'];   // 뒤에만 덧붙이기 (MSK 번호표)
const FX_NAME = {'':'비어 있음', comp:'압축기', dist:'디스토션', lpf:'로우패스', hpf:'하이패스', chorus:'코러스', reverb:'리버브', delay:'딜레이', eq:'EQ (한 밴드)', width:'스테레오 폭', eq4:'EQ (4밴드)', gate:'트랜스 게이트'};
const FX_KNOBS = {comp:['임계값', '비율'], dist:['세기', '밝기'], lpf:['주파수', '공명'], hpf:['주파수', '공명'], chorus:['깊이', '섞기'], reverb:['길이', '섞기'], delay:['시간', '섞기'], eq:['주파수', '증감'], width:['폭', '출력'], eq4:['저음 100Hz', '중저 500Hz', '중고 2.5kHz', '고음 8kHz'], gate:['박자', '깊이']};
const FX_AUTOK = {comp:0, dist:1, lpf:0, hpf:0, chorus:1, reverb:1, delay:1, eq:1, width:0, eq4:0, gate:1};   // 곡 자동화가 움직이는 손잡이
const DELAY_NOTES = [[0.25, '1/16'], [0.5, '1/8'], [0.75, '3/16'], [1, '1/4'], [1.5, '3/8'], [2, '1/2']];
const FX_DEF = {comp:[0.7, 0.16], dist:[0.3, 0.5], lpf:[0.7, 0.1], hpf:[0.2, 0.1], chorus:[0.5, 0.4], reverb:[0.35, 0.3], delay:[0.55, 0.3], eq:[0.5, 0.65], width:[0.75, 0.67], eq4:[0.5, 0.5, 0.5, 0.5], gate:[0.5, 0.8]};
const AUTO_CUT_MAX = 18000, cutHz = v => 40 * Math.pow(AUTO_CUT_MAX / 40, clamp(v, 0, 1));   // 0~1 → 40Hz~18kHz (귀에 고르게)
function makeFx(ac, f) {
  const g = () => ac.createGain(), a = f.a, b = f.b;
  if (f.type === 'comp') {   // 압축기: 큰 소리를 눌러 고르게, 줄어든 만큼 다시 키움
    const c = ac.createDynamicsCompressor(), thr = -60 + a * 60, ratio = 1 + b * 19, mk = g();
    c.threshold.value = thr; c.ratio.value = ratio; c.knee.value = 6; c.attack.value = 0.005; c.release.value = 0.15;
    mk.gain.value = Math.pow(10, (-thr * (1 - 1 / ratio)) / 40); c.connect(mk); return {inp:c, out:mk, pa:c.threshold, map:v => -60 + v * 60};
  }
  if (f.type === 'dist') {   // 디스토션: tanh로 찌그러뜨리고 로우패스로 밝기 조절
    const pre = g(), sh = ac.createWaveShaper(), tone = ac.createBiquadFilter(), post = g(), k = 1 + a * 30, cv = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); } sh.curve = cv; sh.oversample = '2x';
    tone.type = 'lowpass'; tone.frequency.value = 1500 + b * 16000; post.gain.value = 1 / (1 + a * 1.5);
    pre.connect(sh); sh.connect(tone); tone.connect(post); return {inp:pre, out:post, pa:tone.frequency, map:v => 1500 + v * 16000};
  }
  if (f.type === 'lpf' || f.type === 'hpf') { const q = ac.createBiquadFilter(); q.type = f.type === 'lpf' ? 'lowpass' : 'highpass'; q.frequency.value = cutHz(a); q.Q.value = 0.5 + b * 15; return {inp:q, out:q, pa:q.frequency, map:cutHz}; }
  if (f.type === 'chorus') {   // 코러스: 살짝 흔들리는 지연 소리를 섞어서 넓게
    const inp = g(), out = g(), dry = g(), wet = g(), d1 = ac.createDelay(0.1), d2 = ac.createDelay(0.1), lfo = ac.createOscillator(), dep = g(), dep2 = g(), p1 = ac.createStereoPanner(), p2 = ac.createStereoPanner();
    d1.delayTime.value = 0.017; d2.delayTime.value = 0.023; lfo.frequency.value = 0.8; dep.gain.value = 0.002 + a * 0.006; dep2.gain.value = -(0.002 + a * 0.006);
    lfo.connect(dep); lfo.connect(dep2); dep.connect(d1.delayTime); dep2.connect(d2.delayTime); lfo.start();
    p1.pan.value = -0.6; p2.pan.value = 0.6; dry.gain.value = 1 - b * 0.4; wet.gain.value = b * 0.8;
    inp.connect(dry); dry.connect(out); inp.connect(d1); inp.connect(d2); d1.connect(p1); d2.connect(p2); p1.connect(wet); p2.connect(wet); wet.connect(out);
    return {inp, out, pa:wet.gain, map:v => v * 0.8, stop:() => { try { lfo.stop(); } catch (e) {} }};
  }
  if (f.type === 'reverb') {   // 리버브: 잡음을 지수로 줄인 울림(IR)을 합성
    const inp = g(), out = g(), dry = g(), wet = g(), cv = ac.createConvolver(), sec = 0.4 + a * 4, n = Math.floor(ac.sampleRate * sec), ir = ac.createBuffer(2, n, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    cv.buffer = ir; dry.gain.value = 1 - b * 0.5; wet.gain.value = b; inp.connect(dry); dry.connect(out); inp.connect(cv); cv.connect(wet); wet.connect(out);
    return {inp, out, pa:wet.gain, map:v => v};
  }
  if (f.type === 'delay') {   // 딜레이: 템포에 맞춘 시간, 되먹임 40%, 되먹임은 점점 어둡게
    const inp = g(), out = g(), wet = g(), dl = ac.createDelay(4), fb = g(), lp = ac.createBiquadFilter(), beats = DELAY_NOTES[Math.min(5, Math.floor(a * 6))][0];
    dl.delayTime.value = Math.min(3.9, beats * 60 / S.bpm); fb.gain.value = 0.4; lp.type = 'lowpass'; lp.frequency.value = 5000; wet.gain.value = b;
    inp.connect(out); inp.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(out);
    return {inp, out, pa:wet.gain, map:v => v};
  }
  if (f.type === 'eq') { const q = ac.createBiquadFilter(); q.type = 'peaking'; q.frequency.value = cutHz(a); q.Q.value = 1.2; q.gain.value = (b - 0.5) * 24; return {inp:q, out:q, pa:q.gain, map:v => (v - 0.5) * 24}; }
  if (f.type === 'width') {   // 스테레오 폭: 가운데(L+R)는 그대로, 옆(L−R)을 w배
    const inp = g(), out = g(), sp = ac.createChannelSplitter(2), mg = ac.createChannelMerger(2), w = a * 2;
    inp.channelCount = 2; inp.channelCountMode = 'explicit'; inp.channelInterpretation = 'speakers'; inp.connect(sp);
    const link = (from, to, v) => { const k = g(); k.gain.value = v; sp.connect(k, from); k.connect(mg, 0, to); };
    link(0, 0, 0.5 + w / 2); link(1, 0, 0.5 - w / 2); link(0, 1, 0.5 - w / 2); link(1, 1, 0.5 + w / 2);
    out.gain.value = b * 1.5; mg.connect(out); return {inp, out};
  }
  if (f.type === 'eq4') {   // 4밴드 EQ: 저음 셸프 · 피크 둘 · 고음 셸프, 손잡이마다 ±12dB
    const bands = [['lowshelf', 100], ['peaking', 500], ['peaking', 2500], ['highshelf', 8000]].map(([ty, hz], i) => { const q = ac.createBiquadFilter(); q.type = ty; q.frequency.value = hz; q.Q.value = 0.9; q.gain.value = ((f[FX_KEYS[i]] == null ? 0.5 : f[FX_KEYS[i]]) - 0.5) * 24; return q; });
    for (let i = 0; i < 3; i++) bands[i].connect(bands[i + 1]); return {inp:bands[0], out:bands[3], pa:bands[0].gain, map:v => (v - 0.5) * 24};
  }
  if (f.type === 'gate') {   // 트랜스 게이트: 템포에 맞춘 사각파로 소리를 켰다 껐다 (1/4·1/8·1/16·1/32)
    const inp = g(), out = g(), lfo = ac.createOscillator(), sh = ac.createWaveShaper(), div = [1, 2, 4, 8][Math.min(3, Math.floor(a * 4))], dep = clamp(b, 0, 1), cv = new Float32Array(256);
    for (let i = 0; i < 256; i++) cv[i] = i < 128 ? 1 - dep : 1; sh.curve = cv; lfo.type = 'square'; lfo.frequency.value = S.bpm / 60 * div; out.gain.value = 0;
    lfo.connect(sh); sh.connect(out.gain); lfo.start(0); inp.connect(out); return {inp, out, stop:() => { try { lfo.stop(); } catch (e) {} }};
  }
  return null;
}
function applyFx(E, ch, fx) {
  const sig = JSON.stringify(fx); if (sig === ch.fxSig) return; ch.fxSig = sig;
  try { ch.fxIn.disconnect(); } catch (e) {}
  for (const n of ch.fxNodes) { try { n.out.disconnect(); } catch (e) {} if (n.stop) n.stop(); }
  ch.fxNodes = []; let prev = ch.fxIn;
  for (const f of fx) { const n = makeFx(E.ac, f); if (!n) continue; prev.connect(n.inp); prev = n.out; ch.fxNodes.push(n); }
  prev.connect(ch.fxOut);
}
function applyMix(E, mix) {
  const t = E.ac.currentTime, keys = Object.keys(mix).filter(k => k !== 'master'), anySolo = keys.some(k => mix[k].solo);
  for (const k of keys) {
    const m = mix[k], ch = getCh(E, k), on = !m.mute && (!anySolo || m.solo || (BUSES.includes(k) && keys.some(j => mix[j].solo && mix[j].out === k)));   // 솔로한 채널이 이 버스로 가면 버스도 켜둠
    const ok = outKey(k, m); if (ch.outKey !== ok) { try { ch.sPan.disconnect(); } catch (e) {} ch.sPan.connect(outDest(E, k, m)); ch.outKey = ok; }
    ch.vol.gain.setTargetAtTime(on ? m.v : 0, t, 0.015); ch.pan.pan.setTargetAtTime(m.pan, t, 0.015); ch.rs.gain.setTargetAtTime(m.rev, t, 0.015); ch.ds.gain.setTargetAtTime(m.dly, t, 0.015);
    ch.lo.gain.setTargetAtTime(m.lo || 0, t, 0.015); ch.md.gain.setTargetAtTime(m.mid || 0, t, 0.015); ch.hi.gain.setTargetAtTime(m.hi || 0, t, 0.015);
    applyFx(E, ch, m.fx || []);
  }
  if (mix.master) applyFx(E, E.mfx, mix.master.fx || []);
  for (const k of Object.keys(E.ch)) if (!mix[k]) E.ch[k].vol.gain.setTargetAtTime(0, t, 0.015);   // 지운 트랙
  E.out.gain.setTargetAtTime(mix.master.v, t, 0.015);
  const secs = [0.9, 1.6, 2.6, 3.8][mix.master.size] || 1.6; if (E.size !== mix.master.size) { E.rev.buffer = makeIR(E.ac, secs); E.size = mix.master.size; }
  const beat = 60 / S.bpm, [dl, dr, fbl, fbr] = E._dl; dl.delayTime.setValueAtTime(beat * 0.75, t); dr.delayTime.setValueAtTime(beat * 0.75, t); fbl.gain.value = 0.35; fbr.gain.value = 0.35;
}
function playSample(E, slot, m, t, d, vel, dest) {
  const s = SAMPLES[slot]; if (!s) return false;
  const ch = slot.startsWith('ch:') ? chById(slot.slice(3)) : null, cfg = ch && ch.smp, dur = s.buf.duration;
  if (cfg && cfg.slices && m != null) {   // 조각: C4부터 건반마다 한 조각, 음높이는 그대로
    const N = cfg.slices, k = ((m - 60) % N + N) % N, len = dur / N, src = E.ac.createBufferSource(), g = E.ac.createGain(); src.buffer = s.buf; g.gain.value = vel;
    src.connect(g); g.connect(dest); const play = Math.min(len, d != null ? d + 0.02 : len); src.start(t, k * len, play); g.gain.setValueAtTime(vel, t + Math.max(0, play - 0.01)); g.gain.linearRampToValueAtTime(0.0001, t + play); src.stop(t + play + 0.02); return true;
  }
  const src = E.ac.createBufferSource(); src.buffer = s.buf; src.playbackRate.value = m == null ? 1 : Math.pow(2, (m - s.root) / 12); bendParam(src.playbackRate, src.playbackRate.value);
  if (cfg && cfg.loop && d != null) { src.loop = true; src.loopStart = cfg.ls * dur; src.loopEnd = Math.max(cfg.ls * dur + 0.01, cfg.le * dur); }   // 구간 반복: 누르는 동안 계속
  const g = E.ac.createGain(); g.gain.setValueAtTime(vel, t);
  if (d != null) { g.gain.setValueAtTime(vel, t + d); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.08); }
  src.connect(g); g.connect(dest); src.start(t); src.stop(t + (d != null ? d + 0.1 : s.buf.duration / src.playbackRate.value + 0.05)); return true;
}
function sidechain(EE, t) {
  const amt = S.mix.master.sc; if (amt <= 0) return; const beat = 60 / S.bpm;
  for (const k of Object.keys(S.mix)) {
    if (k === 'master' || !S.mix[k].sc) continue;
    const g = getCh(EE, k).duck.gain; g.setValueAtTime(1 - amt * (k === 'bass' ? 1 : 0.85), t); g.setTargetAtTime(1, t + 0.02, beat * 0.18);
  }
}
// 지금 트랙 악기로 한 음 들려주기
function playTrackNote(EE, ch, p, t, d, v, b) {
  if (ch.kind === 'drum') { drumHit(ch.inst, t, EE, v, chKey(ch)); return; }
  if (b) BEND = {r:Math.pow(2, b / 12), t0:t + Math.min(0.08, d * 0.25), t1:t + Math.max(0.02, d)};   // 음이 끝날수록 b반음까지 휨
  try { voice(EE, ch.inst, p, t, d, v, getCh(EE, chKey(ch)).inp, ch.tone, chKey(ch)); } finally { BEND = null; }
}
function preview(p, v) { ensureCtx(); playTrackNote(E, curTrack(), p, ctx.currentTime + 0.01, 0.3, v == null ? 0.9 : v); }

// ---- 음색 (파형 · 봉투 · 악기들) ----
function makeWaves(ac){const N=40,re=new Float32Array(N),im=new Float32Array(N);
  for(let k=1;k<N;k++)im[k]=Math.pow(k,-1.25)*(k%7===0?0.2:1)*(1+0.3*Math.sin(k*1.7));   // 피아노 배음
  const piano=ac.createPeriodicWave(re,im);
  const re2=new Float32Array(N),im2=new Float32Array(N);for(let k=1;k<N;k++)im2[k]=(2/(k*Math.PI))*Math.sin(k*Math.PI*0.25);   // 25% 펄스
  const pulse=ac.createPeriodicWave(re2,im2);return{piano,pulse}}

function adsr(g,t,a,peak,d,sus,end,rel){g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(peak*sus,t+a,d/3);g.gain.setTargetAtTime(0.0001,Math.max(end,t+a),rel/4)}
let BEND = null;   // 피치 벤드: {r:목표 배수, t0, t1} — 음을 예약하는 동안만 켜짐
function bendParam(prm, v0) { if (BEND) { prm.setValueAtTime(v0, BEND.t0); prm.exponentialRampToValueAtTime(v0 * BEND.r, BEND.t1); } }
function osc(ac,type,f,det,t,stop,dest){const o=ac.createOscillator();if(typeof type==='string')o.type=type;else o.setPeriodicWave(type);o.frequency.value=f;bendParam(o.frequency,f);o.detune.value=det||0;o.connect(dest);o.start(t);o.stop(stop);return o}
function noiseBurst(E,t,d,type,f,q,v,dest){const s=E.ac.createBufferSource();s.buffer=E.noise;s.loop=true;const fl=E.ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=E.ac.createGain();
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);s.connect(fl);fl.connect(g);g.connect(dest);s.start(t,Math.random()*0.5);s.stop(t+d+0.05)}

function voice(E,inst,m,t,d,vel=1,dest,tone,slot){const ac=E.ac,f=hz(m),end=t+d;dest=dest||getCh(E,trackKey(curTrack())).inp;const T=tone||toneDefault(),br=T.br,rel=Math.max(0.03,T.rel),atk=T.atk;if(inst==='synth'){synthVoice(E,f,t,d,vel,dest,slot);return}
  if(inst==='sample'){if(playSample(E,slot||'melody',m,t,d,vel*0.9,dest)||playSample(E,'melody',m,t,d,vel*0.9,dest))return;inst='piano'}
  if(inst==='bass'){   // 서브 베이스: 사인파 + 약한 찌그러짐(배음) + 낮은 필터
    const g=ac.createGain(),sh=ac.createWaveShaper(),lp=ac.createBiquadFilter(),cv=new Float32Array(256);for(let i=0;i<256;i++){const x=i/127.5-1;cv[i]=Math.tanh(1.8*x)/Math.tanh(1.8)}sh.curve=cv;
    lp.type='lowpass';lp.frequency.value=Math.min(4000,420*br);sh.connect(lp);lp.connect(g);g.connect(dest);const st=end+rel+0.1;
    osc(ac,'sine',f,0,t,st,sh);const o2=ac.createGain();o2.gain.value=0.25;o2.connect(sh);osc(ac,'triangle',f,0,t,st,o2);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.55*vel,t+0.006+atk);g.gain.setValueAtTime(0.55*vel,Math.max(end,t+0.01));g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.01),rel/4);return}
  if(inst==='celesta'){   // 첼레스타: 맑은 사인파 + 4배 배음(금속 막대), 빨리 사라짐
    const g=ac.createGain();g.connect(dest);const st=t+2.2+rel;osc(ac,'sine',f,0,t,st,g);
    const h=ac.createGain();h.gain.setValueAtTime(0.35,t);h.gain.exponentialRampToValueAtTime(0.001,t+0.25);h.connect(g);osc(ac,'sine',f*4,0,t,st,h);
    const lv=0.22*vel;g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(lv,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.01,0.45*br);return}
  if(inst==='harp'){   // 하프: 삼각파 + 짧은 줄 튕김 잡음, 부드럽게 사라짐
    const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(Math.min(16000,f*8*br),t);lp.frequency.setTargetAtTime(Math.max(600,f*2),t,0.3);lp.connect(g);g.connect(dest);
    const st=t+Math.max(2,d+rel+1);osc(ac,'triangle',f,0,t,st,lp);const s2=ac.createGain();s2.gain.value=0.3;s2.connect(lp);osc(ac,'sine',f*2,0,t,st,s2);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.32*vel,t+0.004);g.gain.setTargetAtTime(0.0001,t+0.01,0.6);noiseBurst(E,t,0.015,'bandpass',Math.min(9000,f*6),1.5,0.04*vel,dest);return}
  if(inst==='timpani'){   // 팀파니: 낮은 사인파(살짝 내려가는 음) + 둥 하는 잡음
    const g=ac.createGain();g.connect(dest);const st=t+2.2;const o=osc(ac,'sine',f*1.02,0,t,st,g);o.frequency.setTargetAtTime(f,t,0.05);
    const o2=ac.createGain();o2.gain.value=0.3;o2.connect(g);osc(ac,'sine',f*1.5,0,t,st,o2);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.6*vel,t+0.005);g.gain.setTargetAtTime(0.0001,t+0.02,0.5);noiseBurst(E,t,0.08,'lowpass',400,0.7,0.25*vel,dest);return}
  if(inst==='strings'){   // 스트링 패드: 톱니파 4개를 조금씩 어긋나게 + 부드러운 필터 + 느린 비브라토 + 천천히 켜지고 꺼짐
    const g=ac.createGain(),lp=ac.createBiquadFilter(),hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=160;lp.type='lowpass';lp.frequency.value=Math.min(12000,(1500+f*1.1)*br);lp.Q.value=0.3;
    hp.connect(lp);lp.connect(g);g.connect(dest);const a=Math.max(0.22,atk),r=Math.max(0.7,rel*3),hold=Math.max(end,t+a),st=hold+r*2.5;
    const lfo=ac.createOscillator(),ld=ac.createGain();lfo.frequency.value=4.8;ld.gain.setValueAtTime(0,t);ld.gain.linearRampToValueAtTime(7,t+a+0.4);lfo.connect(ld);lfo.start(t);lfo.stop(st);
    [-11,-4,4,11].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=[-.55,-.2,.2,.55][i];p.connect(hp);const o=osc(ac,'sawtooth',f,c,t+i*0.004,st,p);ld.connect(o.detune)});
    const lv=0.05*(0.55+0.45*vel);g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(lv,t+a);g.gain.setValueAtTime(lv,hold);g.gain.setTargetAtTime(0.0001,hold,r/3);return}
  if(inst==='piano'&&pianoSample(E,m,t,d,vel,dest,T))return;
  if(inst==='piano'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';const b=(1400+2600*vel+f*1.5)*br;
    lp.frequency.setValueAtTime(Math.min(18000,b*2.2),t);lp.frequency.setTargetAtTime(Math.max(400,b*0.5),t+0.02,0.35);lp.connect(g);g.connect(dest);
    const st=Math.max(end,t+0.3)+rel+1.2;[-3,3].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=i?0.3:-0.3;p.connect(lp);osc(ac,E.waves.piano,f,c,t+i*0.0015,st,p)});
    const sub=ac.createGain();sub.gain.value=0.25;sub.connect(lp);osc(ac,'sine',f,0,t,st,sub);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.4*vel,t+0.004+atk);g.gain.setTargetAtTime(0.17*vel,t+0.004+atk,0.18);g.gain.setTargetAtTime(0.05*vel,t+0.3+atk,1.2);g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.12),rel/3);
    noiseBurst(E,t,0.03,'bandpass',Math.min(8000,f*4),1.2,0.05*vel,dest);return}
  if(inst==='epiano'){const g=ac.createGain(),trem=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,5000*br);lp.connect(trem);trem.connect(g);g.connect(dest);
    const st=Math.max(end,t+0.2)+rel+0.3;const car=ac.createOscillator(),mod=ac.createOscillator(),mi=ac.createGain();car.frequency.value=f;mod.frequency.value=f;
    mi.gain.setValueAtTime(f*(0.6+1.4*vel)*br,t);mi.gain.setTargetAtTime(f*0.15,t,0.45);mod.connect(mi);mi.connect(car.frequency);
    const p=ac.createStereoPanner();p.pan.value=((m%12)/11-0.5)*0.6;car.connect(p);p.connect(lp);
    const tine=ac.createOscillator(),tg=ac.createGain();tine.frequency.value=f*14;tg.gain.setValueAtTime(0.12*vel,t);tg.gain.exponentialRampToValueAtTime(0.0001,t+0.06);tine.connect(tg);tg.connect(lp);
    const lfo=ac.createOscillator(),lg=ac.createGain();lfo.frequency.value=4.5;lg.gain.value=0.15;lfo.connect(lg);lg.connect(trem.gain);trem.gain.value=0.85;
    [car,mod,tine,lfo].forEach(o=>{o.start(t);o.stop(st)});
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.3*vel,t+0.003+atk);g.gain.setTargetAtTime(0.12*vel,t+0.003+atk,0.6);g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.05),rel/3);return}
  if(inst==='supersaw'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=1.2;lp.frequency.setValueAtTime(Math.min(18000,2500*br),t);lp.frequency.linearRampToValueAtTime(Math.min(18000,6500*br),t+0.05+atk);lp.frequency.setTargetAtTime(Math.min(18000,4200*br),t+0.05+atk,0.2);
    lp.connect(g);g.connect(dest);const st=end+rel+0.4;[-24,-14,-6,0,6,14,24].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,(i-3)/3));p.connect(lp);osc(ac,'sawtooth',f,c,t+(i===3?0:Math.random()*0.004),st,p)});
    const sq=ac.createGain();sq.gain.value=0.5;sq.connect(lp);osc(ac,'square',f/2,0,t,st,sq);adsr(g,t,0.006+atk,0.13*vel,0.15,0.75,end,rel);return}
  if(inst==='pluck'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=3;lp.frequency.setValueAtTime(Math.min(18000,7000*br),t);lp.frequency.setTargetAtTime(500*br,t,0.08);lp.connect(g);g.connect(dest);
    const st=t+Math.max(d,0.2)+rel+0.6;[-8,8].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=i?0.6:-0.6;p.connect(lp);osc(ac,'sawtooth',f,c,t+i*0.002,st,p)});osc(ac,'square',f,0,t,st,lp);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.24*vel,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.003+atk,0.08+rel*0.35);return}
  if(inst==='chip'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,9000*br);lp.connect(g);g.connect(dest);const o=osc(ac,E.waves.pulse,f,0,t,end+rel+0.1,lp);const lfo=ac.createOscillator(),lg=ac.createGain();lfo.frequency.value=6;lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(18,t+0.25);lfo.connect(lg);lg.connect(o.detune);lfo.start(t);lfo.stop(end+rel+0.1);
    adsr(g,t,0.002+atk,0.14*vel,0.05,0.8,end,Math.min(rel,0.3));return}
  // bell (FM)
  const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,9000*br);lp.connect(g);g.connect(dest);const car=ac.createOscillator(),mod=ac.createOscillator(),mi=ac.createGain();car.frequency.value=f;mod.frequency.value=f*3.5;
  mi.gain.setValueAtTime(f*2.5*br,t);mi.gain.setTargetAtTime(f*0.3,t,0.4);mod.connect(mi);mi.connect(car.frequency);car.connect(lp);const st=t+Math.max(d,0.4)+rel+1.6;car.start(t);mod.start(t);car.stop(st);mod.stop(st);
  const c2=ac.createGain();c2.gain.value=0.3;c2.connect(lp);osc(ac,'sine',f*2,3,t,st,c2);
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.22*vel,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.003+atk,0.3+rel*0.5)}

function chordPlay(E,inst,notes,t,d){const ac=E.ac,dest=getCh(E,'chords').inp,end=t+d,T=S.chordTone,br=T.br,rel=Math.max(0.03,T.rel);
  if(inst==='piano'||inst==='epiano'){notes.forEach(m=>voice(E,inst,m,t,d,0.65,dest,T));return}
  if(inst==='pluck'){for(let k=0;k<Math.max(1,Math.round(d/(60/S.bpm)));k++)notes.forEach(m=>voice(E,'pluck',m+12,t+k*60/S.bpm,0.2,0.6,dest,T));return}
  const saw=inst==='supersaw';const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,(saw?5200:1600)*br);lp.Q.value=0.7;lp.connect(g);g.connect(dest);
  const dets=saw?[-18,-7,0,7,18]:[-10,0,10];notes.forEach(m=>dets.forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=(i/(dets.length-1)-.5)*2;p.connect(lp);osc(ac,'sawtooth',hz(saw?m+12:m),c,t+Math.random()*0.005,end+rel+0.8,p)}));
  if(!saw){notes.forEach(m=>osc(ac,'triangle',hz(m),0,t,end+rel+0.8,lp))}
  const pk=(saw?0.12:0.09)/Math.sqrt(notes.length);adsr(g,t,(saw?0.01:0.03)+T.atk,pk,0.3,0.85,end,rel)}

function bassPlay(E,inst,m,t,d){const ac=E.ac,f=hz(m),end=t+d,dest=getCh(E,'bass').inp;const g=ac.createGain();g.connect(dest);
  if(inst==='sub'){const sh=ac.createWaveShaper();const cv=new Float32Array(256);for(let i=0;i<256;i++){const x=i/127.5-1;cv[i]=Math.tanh(2*x)}sh.curve=cv;sh.connect(g);osc(ac,'sine',f,0,t,end+0.2,sh);adsr(g,t,0.004,0.35,0.1,0.9,end,0.05);return}
  const lp=ac.createBiquadFilter();lp.type='lowpass';lp.connect(g);
  if(inst==='reese'){lp.frequency.value=700;lp.Q.value=1.5;[-16,16].forEach(c=>osc(ac,'sawtooth',f,c,t,end+0.2,lp));const s=ac.createGain();s.gain.value=0.9;s.connect(g);osc(ac,'sine',f,0,t,end+0.2,s);adsr(g,t,0.006,0.2,0.1,0.9,end,0.05);return}
  lp.Q.value=4;lp.frequency.setValueAtTime(2200,t);lp.frequency.setTargetAtTime(350,t,0.07);osc(ac,'sawtooth',f,0,t,end+0.2,lp);osc(ac,'square',f/2,0,t,end+0.2,lp);adsr(g,t,0.003,0.22,0.08,0.7,end,0.04)}

const KITS={edm:{k:[190,48,.09,.09,2.5,.5],s:[[185,330],2600,.2,.55,.14],h:[1,.06,.35],c:[.18,.4]},
  '808':{k:[125,44,.25,.34,1.3,.12],s:[[180,330],1800,.15,.45,.1],h:[1.3,.045,.3],c:[.3,.45]},
  hard:{k:[320,55,.06,.13,7,.9],s:[[200,380],3000,.3,.7,.12],h:[1,.05,.45],c:[.22,.55]},
  acoustic:{k:[110,58,.05,.07,1,.3],s:[[190,290],3600,.26,.6,.08],h:[0,.09,.3],c:[.14,.35]}};

function drumHit(d,t,EE,vel,key){EE=EE||E;vel=vel==null?1:vel;const ac=EE.ac,dest=getCh(EE,key||d).inp,K=KITS[S.kit]||KITS.edm;
  if((key&&playSample(EE,key,null,t,null,vel,dest))||playSample(EE,d,null,t,null,vel,dest)){if(d==='kick')sidechain(EE,t);return}
  if(d==='kick'){const[f0,f1,sw,tau,drive,click]=K.k;const o=ac.createOscillator(),g=ac.createGain(),sh=ac.createWaveShaper();const cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/255.5-1;cv[i]=Math.tanh(drive*x)/Math.tanh(drive)}sh.curve=cv;
    o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+sw);g.gain.setValueAtTime(vel,t);g.gain.setTargetAtTime(0.0001,t+0.04,tau);o.connect(sh);sh.connect(g);g.connect(dest);o.start(t);o.stop(t+tau*6+0.1);
    if(S.kit==='acoustic')noiseBurst(EE,t,0.03,'bandpass',900,0.8,click*vel,dest);else noiseBurst(EE,t,0.012,'highpass',3000,0.7,click*vel,dest);sidechain(EE,t)}
  else if(d==='snare'){const[tones,nf,nd,nv,td]=K.s;tones.forEach((fr,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(fr*1.4,t);o.frequency.exponentialRampToValueAtTime(fr,t+0.03);g.gain.setValueAtTime((i?0.25:0.45)*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+td);o.connect(g);g.connect(dest);o.start(t);o.stop(t+td+0.05)});
    noiseBurst(EE,t,nd,'bandpass',nf,0.6,nv*vel,dest);noiseBurst(EE,t,nd*0.6,'highpass',6500,0.7,0.25*vel,dest)}
  else if(d==='hat'){const[mul,dec,lv]=K.h;const g=ac.createGain();g.connect(dest);
    if(!mul){noiseBurst(EE,t,dec,'highpass',8000,0.7,lv*vel,dest);return}
    const bp=ac.createBiquadFilter(),hp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=10000;bp.Q.value=0.8;hp.type='highpass';hp.frequency.value=7000;
    bp.connect(hp);hp.connect(g);[2,3,4.16,5.43,6.79,8.21].forEach(r=>osc(ac,'square',40*r*4*mul,0,t,t+dec+0.08,bp));g.gain.setValueAtTime(lv*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dec)}
  else if(d==='crash'){   // 크래시 심벌: 금속성 사각파 여러 개 + 밝은 잡음, 길게 사라짐
    const g=ac.createGain(),hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=4200;hp.connect(g);g.connect(dest);
    [2,3,4.16,5.43,6.79,8.21,9.6].forEach(r=>osc(ac,'square',40*r*3.1,0,t,t+2.2,hp));g.gain.setValueAtTime(0.16*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+1.9);
    noiseBurst(EE,t,1.6,'highpass',5500,0.5,0.55*vel,dest)}
  else{const[tail,lv]=K.c;for(let k=0;k<3;k++)noiseBurst(EE,t+k*0.009,0.02,'bandpass',1500,1.5,0.5*vel,dest);noiseBurst(EE,t+0.027,tail,'bandpass',1400,1.2,lv*vel,dest)}}
