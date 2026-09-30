/* 33-samples.js — 6: 실제 녹음 샘플로 소리 내기
   처음 그 악기를 쓸 때만 내려받고, 없거나 인터넷이 끊기면 지금까지의 합성 소리로 그대로 감. */
const SMP = {index:null, load:{}, ready:{}, off:false};

async function smpIndex() {
  if (SMP.index || SMP.off) return SMP.index;
  try { SMP.index = await (await fetch('samples/index.json')).json(); }
  catch (e) { SMP.off = true; }                      // 인터넷이 없으면 합성으로
  return SMP.index;
}
// 악기 하나 받아 두기 (같은 악기를 두 번 받지 않음)
function smpLoad(inst) {
  if (SMP.ready[inst] || SMP.off) return SMP.ready[inst] ? Promise.resolve(SMP.ready[inst]) : Promise.resolve(null);
  if (SMP.load[inst]) return SMP.load[inst];
  SMP.load[inst] = (async () => {
    const idx = await smpIndex(); if (!idx || !idx[inst]) return null;
    const dir = 'samples/' + idx[inst].dir;
    try {
      const meta = await (await fetch(dir + '/inst.json')).json();
      ensureCtx();
      const bufs = {};
      await Promise.all(meta.samples.map(async s => {
        const ab = await (await fetch(`${dir}/${s.i}.opus`)).arrayBuffer();
        bufs[s.i] = await ctx.decodeAudioData(ab);
      }));
      const rows = meta.zones.map(z => ({lo:z.k[0], hi:z.k[1], root:z.r, vs:z.vs}));
      return SMP.ready[inst] = {meta, bufs, rows, gain:Math.pow(10, (meta.gain || 0) / 20)};
    } catch (e) { return null; }
  })();
  return SMP.load[inst];
}
// 건반·세기에 맞는 소리 고르기
function smpPick(pack, p, v) {
  const vel = Math.max(1, Math.round((v == null ? 0.9 : v) * 127));
  for (const z of pack.rows) {
    if (p < z.lo || p > z.hi) continue;
    for (const [top, i] of z.vs) if (vel <= top) return {buf:pack.bufs[i], root:z.root};
    const last = z.vs[z.vs.length - 1];
    return last ? {buf:pack.bufs[last[1]], root:z.root} : null;
  }
  return null;
}
// 샘플로 한 음 재생. 낼 수 있으면 true (못 내면 부르는 쪽이 합성으로)
function smpPlay(EE, ch, p, t, d, v, dest) {
  const pack = SMP.ready[ch.inst]; if (!pack) { smpLoad(ch.inst); return false; }
  const hit = smpPick(pack, p, v); if (!hit || !hit.buf) return false;
  const src = EE.ac.createBufferSource(); src.buffer = hit.buf;
  src.playbackRate.value = Math.pow(2, (p - hit.root) / 12);
  const g = EE.ac.createGain(), vol = pack.gain * (v == null ? 0.9 : v);
  const dur = d != null ? d : hit.buf.duration;
  const rel = Math.min(0.25, dur * 0.3);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
  src.connect(g); g.connect(dest); src.start(t);
  src.stop(t + dur + 0.08);
  return true;
}
// 지금 곡이 쓰는 악기를 미리 받아 두기
function smpPreload() { if (SMP.off || !S) return; for (const c of S.channels) if (c.kind === 'synth') smpLoad(c.inst); }
