// 서버 공통: CORS · 로그인 토큰 · 곡 폴더 찾기  (파일 이름이 _로 시작하면 Vercel이 주소로 만들지 않아요)
import crypto from 'node:crypto';

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');   // .exe 앱(file://)에서도 부를 수 있게
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-msk-key,content-type,authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
export const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const b64u = b => Buffer.from(b).toString('base64url');
// 토큰 서명 비밀: AUTH_SECRET이 있으면 그것, 없으면 서버만 아는 저장소 토큰에서 만듦
const secret = () => crypto.createHash('sha256').update('msk-session:' + (process.env.AUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN || '')).digest();
export function makeToken(user, days = 30) {
  const body = b64u(JSON.stringify({u:user, exp:Date.now() + days * 864e5}));
  return body + '.' + b64u(crypto.createHmac('sha256', secret()).update(body).digest());
}
export function readToken(tok) {
  const [body, sig] = String(tok || '').split('.'); if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest(), got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p.u : null; } catch (e) { return null; }
}
export const userDir = u => 'users/' + sha('user:' + u).slice(0, 32) + '/';
// 곡 폴더: 로그인 토큰이 있으면 계정 폴더, 없으면 저장소 키 폴더
export function songDir(req) {
  const auth = String(req.headers.authorization || ''), u = auth.startsWith('Bearer ') ? readToken(auth.slice(7)) : null;
  if (auth && !u) return {error:[401, 'bad-token', '로그인이 만료됐어요. 다시 로그인해 주세요']};
  if (u) return {dir:userDir(u) + 'songs/', who:u};
  const key = String(req.headers['x-msk-key'] || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return {error:[401, 'bad-key', '로그인하거나 저장소 키가 필요해요']};
  return {dir:'songs/' + sha(key).slice(0, 32) + '/', who:null};
}
export async function readJson(req, max = 4096) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > max) throw new Error('too big'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return {}; }
}
