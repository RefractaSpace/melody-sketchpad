/* 04-audio.js — 소리 엔진 (음색 · 믹서 채널 · 사이드체인 · 피아노 샘플)
   채널은 필요할 때 만들어져요: 채널 랙의 채널마다 'ch:<id>', 그리고 코드·베이스 */
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const SAMPLES = {};            // 샘플 칸 → {buf, root, name}
const PIANO = {};              // 건반 번호 → AudioBuffer (Salamander Grand Piano, CC-BY 3.0)
const PIANO_CDN = 'https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/';
let ctx = null, E = null, pianoState = 'wait';

// ---- 피아노 소리: piano.js가 뒤에서 도착하면 그때 준비 (그동안은 합성 피아노) ----
function pianoStat(t) { const el = $('pianoStat'); if (el) el.textContent = t; }
async function decodePianoB64(src) {
  for (const [k, b64] of Object.entries(src)) {
    try { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); PIANO[+k] = await decode(u.buffer); } catch (e) {}
  }
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
  setTimeout(() => { if (pianoState === 'ready') pianoStat(''); }, 3000);
}
function watchPiano() {
  if (window.PIANO_SAMPLES) { preparePiano(); return; }
  pianoStat('녹음 피아노 불러오는 중… (그동안은 합성 피아노)');
  window.addEventListener('piano-samples-ready', () => preparePiano(), {once:true});
  window.addEventListener('load', () => setTimeout(() => { if (pianoState === 'wait') preparePiano(); }, 300), {once:true});
}
function pianoSample(E, m, t, d, vel, dest, T) {
  T = T || toneDefault(); const keys = Object.keys(PIANO).map(Number); if (!keys.length) return false;
  let r = keys[0]; for (const k of keys) if (Math.abs(k - m) < Math.abs(r - m)) r = k;
  const ac = E.ac, src = ac.createBufferSource(); src.buffer = PIANO[r]; src.playbackRate.value = Math.pow(2, (m - r) / 12);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, (2200 + 11000 * vel) * T.br); lp.Q.value = 0.5;
  const g = ac.createGain(), lv = (0.45 + 0.55 * vel) * 0.9;
  if (T.atk > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lv, t + T.atk); } else g.gain.setValueAtTime(lv, t);
  const off = Math.max(t + d, t + 0.08 + T.atk); g.gain.setValueAtTime(lv, off); g.gain.setTargetAtTime(0.0001, off, Math.max(0.03, T.rel) / 3);
  src.connect(lp); lp.connect(g); g.connect(dest); src.start(t);
  src.stop(Math.min(off + Math.max(0.6, T.rel * 2), t + src.buffer.duration / src.playbackRate.value + 0.05)); return true;
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
  E.out = mk(); E.in.connect(glue); glue.connect(shp); shp.connect(lim); lim.connect(E.out); E.out.connect(ac.destination);
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
// 채널: 입력 → 사이드체인 → EQ(저·중·고) → 볼륨 → 팬 → 마스터 (+ 리버브·딜레이 센드)
function getCh(E, key) {
  if (E.ch[key]) return E.ch[key];
  const ac = E.ac, mk = () => ac.createGain();
  const inp = mk(), duck = mk(), vol = mk(), pan = ac.createStereoPanner(), rs = mk(), ds = mk();
  const lo = ac.createBiquadFilter(), md = ac.createBiquadFilter(), hi = ac.createBiquadFilter();
  lo.type = 'lowshelf'; lo.frequency.value = 180; md.type = 'peaking'; md.frequency.value = 1200; md.Q.value = 0.8; hi.type = 'highshelf'; hi.frequency.value = 5000;
  inp.connect(duck); duck.connect(lo); lo.connect(md); md.connect(hi); hi.connect(vol); vol.connect(pan); pan.connect(E.in); pan.connect(rs); pan.connect(ds); rs.connect(E.rev); ds.connect(E.dlyIn);
  const m = S.mix[key] || chDefault(key, key.startsWith('ch:') ? chById(key.slice(3)) : null); vol.gain.value = m.v; pan.pan.value = m.pan; rs.gain.value = m.rev; ds.gain.value = m.dly;
  return E.ch[key] = {inp, duck, vol, pan, rs, ds, lo, md, hi};
}
function applyMix(E, mix) {
  const t = E.ac.currentTime, keys = Object.keys(mix).filter(k => k !== 'master'), anySolo = keys.some(k => mix[k].solo);
  for (const k of keys) {
    const m = mix[k], ch = getCh(E, k), on = !m.mute && (!anySolo || m.solo);
    ch.vol.gain.setTargetAtTime(on ? m.v : 0, t, 0.015); ch.pan.pan.setTargetAtTime(m.pan, t, 0.015); ch.rs.gain.setTargetAtTime(m.rev, t, 0.015); ch.ds.gain.setTargetAtTime(m.dly, t, 0.015);
    ch.lo.gain.setTargetAtTime(m.lo || 0, t, 0.015); ch.md.gain.setTargetAtTime(m.mid || 0, t, 0.015); ch.hi.gain.setTargetAtTime(m.hi || 0, t, 0.015);
  }
  for (const k of Object.keys(E.ch)) if (!mix[k]) E.ch[k].vol.gain.setTargetAtTime(0, t, 0.015);   // 지운 트랙
  E.out.gain.setTargetAtTime(mix.master.v, t, 0.015);
  const secs = [0.9, 1.6, 2.6, 3.8][mix.master.size] || 1.6; if (E.size !== mix.master.size) { E.rev.buffer = makeIR(E.ac, secs); E.size = mix.master.size; }
  const beat = 60 / S.bpm, [dl, dr, fbl, fbr] = E._dl; dl.delayTime.setValueAtTime(beat * 0.75, t); dr.delayTime.setValueAtTime(beat * 0.75, t); fbl.gain.value = 0.35; fbr.gain.value = 0.35;
}
function playSample(E, slot, m, t, d, vel, dest) {
  const s = SAMPLES[slot]; if (!s) return false;
  const src = E.ac.createBufferSource(); src.buffer = s.buf; src.playbackRate.value = m == null ? 1 : Math.pow(2, (m - s.root) / 12);
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
function playTrackNote(EE, ch, p, t, d, v) {
  if (ch.kind === 'drum') { drumHit(ch.inst, t, EE, v, chKey(ch)); return; }
  voice(EE, ch.inst, p, t, d, v, getCh(EE, chKey(ch)).inp, ch.tone, chKey(ch));
}
function preview(p, v) { ensureCtx(); playTrackNote(E, curTrack(), p, ctx.currentTime + 0.01, 0.3, v == null ? 0.9 : v); }

// ---- 음색 (파형 · 봉투 · 악기들) ----
function makeWaves(ac){const N=40,re=new Float32Array(N),im=new Float32Array(N);
  for(let k=1;k<N;k++)im[k]=Math.pow(k,-1.25)*(k%7===0?0.2:1)*(1+0.3*Math.sin(k*1.7));   // 피아노 배음
  const piano=ac.createPeriodicWave(re,im);
  const re2=new Float32Array(N),im2=new Float32Array(N);for(let k=1;k<N;k++)im2[k]=(2/(k*Math.PI))*Math.sin(k*Math.PI*0.25);   // 25% 펄스
  const pulse=ac.createPeriodicWave(re2,im2);return{piano,pulse}}

function adsr(g,t,a,peak,d,sus,end,rel){g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(peak*sus,t+a,d/3);g.gain.setTargetAtTime(0.0001,Math.max(end,t+a),rel/4)}
function osc(ac,type,f,det,t,stop,dest){const o=ac.createOscillator();if(typeof type==='string')o.type=type;else o.setPeriodicWave(type);o.frequency.value=f;o.detune.value=det||0;o.connect(dest);o.start(t);o.stop(stop);return o}
function noiseBurst(E,t,d,type,f,q,v,dest){const s=E.ac.createBufferSource();s.buffer=E.noise;s.loop=true;const fl=E.ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=E.ac.createGain();
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);s.connect(fl);fl.connect(g);g.connect(dest);s.start(t,Math.random()*0.5);s.stop(t+d+0.05)}

function voice(E,inst,m,t,d,vel=1,dest,tone,slot){const ac=E.ac,f=hz(m),end=t+d;dest=dest||getCh(E,trackKey(curTrack())).inp;const T=tone||toneDefault(),br=T.br,rel=Math.max(0.03,T.rel),atk=T.atk;
  if(inst==='sample'){if(playSample(E,slot||'melody',m,t,d,vel*0.9,dest)||playSample(E,'melody',m,t,d,vel*0.9,dest))return;inst='piano'}
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
  else{const[tail,lv]=K.c;for(let k=0;k<3;k++)noiseBurst(EE,t+k*0.009,0.02,'bandpass',1500,1.5,0.5*vel,dest);noiseBurst(EE,t+0.027,tail,'bandpass',1400,1.2,lv*vel,dest)}}
