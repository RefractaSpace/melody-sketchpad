// AI API — Vercel AI Gateway로 Claude를 불러요 (로그인 필요, 한 사람 하루 40번)
//   POST /api/ai  {task:'compose'|'chords'|'feedback', …}
//   답은 정해진 JSON 모양으로 받아서 검사한 뒤 돌려줘요 (화면이 그대로 곡에 넣을 수 있게)
import { cors, readToken, readJson } from './_lib.js';

const MODELS = ['anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5'], LIMIT = 40, used = new Map();
const NOTE = 'C C# D D# E F F# G G# A A# B'.split(' ');
const SYS = {
  compose:`You write short musical patterns for a piano-roll app. Reply with ONLY a JSON object, no prose, no code fences.
Shape: {"title":"short name","channels":[{"name":"Lead","inst":"<inst>","notes":[[bar,beat,step,"C5",lenSteps,vel]]}],"chords":[[bar,beat,"C","maj7"]]}
- bar starts at 1, beat 1..beatsPerBar, step 1..4 (16th note inside the beat), lenSteps = length in 16th notes (1..32), vel 1..127.
- pitch names like C4, F#3, A#5 (sharps only), range C2..C7.
- inst is one of: piano, synth, epiano, strings, pluck, bell, supersaw, chip, bass, harp, celesta, drum:kick, drum:snare, drum:hat, drum:clap, drum:crash (drums: pitch "C5", len 1).
- chord quality one of: "", "m", "7", "maj7", "m7", "sus4", "dim", "aug". chords at most one per beat.
- Stay inside the given bars, key and meter. Use 1-5 channels. Musical, not random.`,
  chords:`You harmonize melodies. Reply with ONLY JSON, no prose: {"chords":[[bar,beat,"A","m7"]]} — roots are sharps-only note names, qualities one of "", "m", "7", "maj7", "m7", "sus4", "dim", "aug". One chord per beat at most; usually 1-2 per bar. Fit the melody and the key.`,
  feedback:`You are a friendly composition teacher for a middle-school student. Reply in Korean, plain text, at most 8 short lines starting with "• ". Be specific about the given song data (structure, harmony, rhythm, instruments, mix). Mention 1-2 strengths, then concrete suggestions.`
};
function parseJson(t) { const s = String(t).replace(/```(json)?/g, ''), i = s.indexOf('{'), j = s.lastIndexOf('}'); return JSON.parse(s.slice(i, j + 1)); }
async function callAI(system, user, maxTokens) {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN; if (!key) throw Object.assign(new Error('AI 연결 정보가 없어요'), {status:503});
  let last = null;
  for (const model of MODELS) {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {method:'POST', headers:{'content-type':'application/json', authorization:'Bearer ' + key},
      body:JSON.stringify({model, max_tokens:maxTokens, messages:[{role:'system', content:system}, {role:'user', content:user}]})});
    const j = await r.json().catch(() => ({}));
    if (r.ok) return {text:j.choices?.[0]?.message?.content || '', model};
    last = Object.assign(new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + r.status), {status:r.status >= 500 ? 502 : r.status});
    if (r.status === 401 || r.status === 403) break;
  }
  throw last;
}
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({error:'method'});
  const a = String(req.headers.authorization || ''), u = a.startsWith('Bearer ') ? readToken(a.slice(7)) : null;
  if (!u) return res.status(401).json({error:'login', message:'AI는 로그인하면 쓸 수 있어요'});
  const day = new Date().toISOString().slice(0, 10), k = u + day, n = used.get(k) || 0;
  if (n >= LIMIT) return res.status(429).json({error:'limit', message:`오늘 AI를 ${LIMIT}번 다 썼어요. 내일 다시 써 주세요`});
  const b = await readJson(req, 64 * 1024), task = String(b.task || '');
  if (!SYS[task]) return res.status(400).json({error:'task'});
  const ctx = `Key: ${NOTE[(b.root | 0) % 12]} ${b.mode === 'minor' ? 'minor' : 'major'}. Meter: ${b.meter || '4/4'}. BPM: ${b.bpm || 120}.`;
  let user;
  if (task === 'compose') user = `${ctx} Bars: ${Math.min(8, Math.max(1, b.bars | 0 || 4))}. Request: ${String(b.prompt || '').slice(0, 400)}`;
  else if (task === 'chords') user = `${ctx} Bars: ${Math.min(16, Math.max(1, b.bars | 0 || 4))}. Melody as [bar,beat,step,pitch,lenSteps]: ${JSON.stringify((b.melody || []).slice(0, 300))}`;
  else user = `Song data (JSON): ${JSON.stringify(b.song || {}).slice(0, 12000)}`;
  try {
    const {text, model} = await callAI(SYS[task], user, task === 'feedback' ? 700 : 3000);
    used.set(k, n + 1);
    if (task === 'feedback') return res.status(200).json({text:text.slice(0, 2000), model, left:LIMIT - n - 1});
    const data = parseJson(text); return res.status(200).json({data, model, left:LIMIT - n - 1});
  } catch (e) { return res.status(e.status || 500).json({error:'ai', message:'AI 오류: ' + String(e.message || e).slice(0, 200)}); }
}
