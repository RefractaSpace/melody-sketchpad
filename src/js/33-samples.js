/* 33-samples.js — 6: 실제 녹음 샘플로 소리 내기
   처음 그 악기를 쓸 때만 내려받고, 없거나 인터넷이 끊기면 지금까지의 합성 소리로 그대로 감. */
const SMP = {index:null, load:{}, ready:{}, off:false};
// 앱이 /app 과 /app/ 어느 쪽으로 열려도 샘플을 찾도록 바탕 주소를 정해 둔다.
// (/app 으로 열면 상대 주소가 /samples/ 로 풀려 404 → 오케스트라 악기가 안 나왔음)
const SMP_BASE = (() => {
  const p = location.pathname;
  if (/\/app(\/|$)/.test(p)) return p.replace(/\/app\/?$/, '/app/').replace(/[^/]+$/, '');
  return p.endsWith('/') ? p : p.replace(/[^/]+$/, '');
})();

async function smpIndex() {
  if (SMP.index || SMP.off) return SMP.index;
  try { SMP.index = await (await fetch(SMP_BASE + 'samples/index.json')).json(); }
  catch (e) { SMP.off = true; }                      // 인터넷이 없으면 합성으로
  return SMP.index;
}
// 악기 하나 받아 두기 (같은 악기를 두 번 받지 않음)
function smpLoad(inst) {
  if (SMP.ready[inst] || SMP.off) return SMP.ready[inst] ? Promise.resolve(SMP.ready[inst]) : Promise.resolve(null);
  if (SMP.load[inst]) return SMP.load[inst];
  SMP.load[inst] = (async () => {
    const idx = await smpIndex(); if (!idx || !idx[inst]) return null;
    const dir = SMP_BASE + 'samples/' + idx[inst].dir;
    try {
      const meta = await (await fetch(dir + '/inst.json')).json();
      ensureCtx();
      const bufs = {};
      // 한꺼번에 다 받으면 샘플이 많은 악기(피아노 122개)에서 실패하므로 8개씩 나눠 받는다
      for (let i = 0; i < meta.samples.length; i += 8) {
        await Promise.all(meta.samples.slice(i, i + 8).map(async s => {
          const ab = await (await fetch(`${dir}/${s.i}.opus`)).arrayBuffer();
          bufs[s.i] = await ctx.decodeAudioData(ab);
        }));
      }
      // 두 가지 정보 형식을 모두 받음:
      //   살라만더·VSCO → vs: [[세기 위끝, 소리 번호], …]
      //   GeneralUser GS → s: 소리 번호 하나 + va: [[세기 위끝, 음량 깎기(0.1dB)], …]
      const rows = meta.zones.map(z => z.vs
        ? {lo:z.k[0], hi:z.k[1], root:z.r, vs:z.vs}
        : {lo:z.k[0], hi:z.k[1], root:z.r, one:z.s, va:z.va || null,
           ct:z.ct || 0, ft:z.ft || 0, lp:z.lp || 0});
      return SMP.ready[inst] = {meta, bufs, rows, gain:Math.pow(10, (meta.gain || 0) / 20)};
    } catch (e) {
      // 한 번 실패해도 다시 받아 볼 수 있게 기록을 지운다 (안 그러면 영원히 합성음)
      delete SMP.load[inst];
      console.warn('샘플을 받지 못했어요:', inst, e && e.message);
      return null;
    }
  })();
  return SMP.load[inst];
}
// 건반·세기에 맞는 소리 고르기
// 한 건반에 구역이 여러 개면 모두 겹쳐서 낸다 (악기 하나가 여러 소리를 합쳐 두껍게 만드는 경우)
/* 샘플 음높이 바로잡기
   오케스트라 샘플의 inst.json 에 적힌 원음(r)이 모두 12 낮게 들어가 있다.
   (바이올린 최저 r=43 인데 실제 바이올린 최저음은 55)
   그래서 C4 를 치면 C5 가 울렸다. 글로켄슈필은 반대로 12 높게 적혀 있음.
   서버 파일을 다시 만들기 전까지 재생할 때 바로잡는다.
   값은 실제 소리의 기본 주파수를 재서 구한 것. */
const PITCH_FIX = {
  'violin': -12,
  'viola': -12,
  'cello': -12,
  'flute': -12,
  'oboe': -12,
  'clarinet': -12,
  'bassoon': -12,
  'horn': -12,
  'trumpet': -12,
  'trombone': -12,
  'glock': -12,
  'tuba': -12,
  'contrabass': -12
};

function smpPickAll(pack, p, v) {
  const vel = Math.max(1, Math.round((v == null ? 0.9 : v) * 127)), out = [];
  for (const z of pack.rows) {
    if (p < z.lo || p > z.hi) continue;
    if (z.vs) {                                   // 세기마다 다른 소리 (VSCO·살라만더)
      const hit = z.vs.find(([top]) => vel <= top) || z.vs[z.vs.length - 1];
      if (hit && pack.bufs[hit[1]]) out.push({buf:pack.bufs[hit[1]], root:z.root, att:0});
      continue;
    }
    let att = 0;                                  // 소리 하나 + 세기별 음량 깎기 (GeneralUser GS)
    if (z.va) { const hit = z.va.find(([top]) => vel <= top); att = hit ? hit[1] : z.va[z.va.length - 1][1]; }
    if (att >= 960) continue;                     // 96dB 넘게 깎이면 사실상 무음
    const buf = pack.bufs[z.one];
    if (buf) out.push({buf, root:z.root, att, ct:z.ct, ft:z.ft});
  }
  return out;
}
function smpPick(pack, p, v) {                     // 가장 크게 들릴 하나 (음 고르기 확인용)
  const all = smpPickAll(pack, p, v);
  if (!all.length) return null;
  return all.reduce((a, b) => (b.att || 0) < (a.att || 0) ? b : a);
}
// 샘플로 한 음 재생. 낼 수 있으면 true (못 내면 부르는 쪽이 합성으로)
function smpPlay(EE, ch, p, t, d, v, dest) {
  const inst = typeof playInst === 'function' ? playInst(ch.inst) : ch.inst;   // 등급에 따라 대신할 악기
  const pack = SMP.ready[inst]; if (!pack) { smpLoad(inst); return false; }
  const hits = smpPickAll(pack, p, v); if (!hits.length) return false;
  for (const hit of hits) {
    const src = EE.ac.createBufferSource(); src.buffer = hit.buf;
    src.playbackRate.value = Math.pow(2, (p - hit.root + (PITCH_FIX[inst] || 0)) / 12 + (hit.ct || 0) / 12 + (hit.ft || 0) / 1200);
    const g = EE.ac.createGain(), vol = pack.gain * (v == null ? 0.9 : v) * Math.pow(10, -(hit.att || 0) / 200);   // att는 0.1dB 단위로 깎기
    const dur = d != null ? d : hit.buf.duration;
    const rel = Math.min(0.25, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    src.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.08);
  }
  return true;
}
// 지금 곡이 쓰는 악기를 미리 받아 두기
function smpPreload() { if (SMP.off || !S) return; for (const c of S.channels) if (c.kind === 'synth') smpLoad(c.inst); }
