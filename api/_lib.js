// 서버 공통: CORS · 로그인 토큰 · 곡 폴더 찾기  (파일 이름이 _로 시작하면 Vercel이 주소로 만들지 않아요)
import crypto from 'node:crypto';

// 서버를 부를 수 있는 곳: 우리 사이트 · 이 프로젝트의 미리보기 주소 · 내 컴퓨터(개발) · Windows 앱(file:// → 'null')
// 그 밖의 사이트에서 온 요청은 결과를 못 읽고, 쓰기(POST·PUT·DELETE)는 아예 거절한다.
const ORIGINS = [/^https:\/\/melody-sketchpad\.vercel\.app$/, /^https:\/\/melody-sketchpad-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^null$/];
export const originOk = o => !o || ORIGINS.some(r => r.test(o)) || String(process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean).includes(o);
export function cors(req, res) {
  const origin = String((req.headers || {}).origin || '');
  res.setHeader('Vary', 'Origin');
  if (!originOk(origin)) {
    // 다른 사이트: 미리 묻기(OPTIONS)와 쓰기는 거절, 읽기는 답은 하되 브라우저가 그 사이트에 못 보여 줌 (허락 머리말 없음)
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 403; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end('{"error":"origin","message":"허용되지 않은 사이트예요"}'); return true; }
    return false;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'x-msk-key,content-type,authorization');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}
// 관리자 아이디 — 신고된 글 보기, 글·댓글 숨기기/보이기, 목록 다시 만들기
export const ADMINS = ['refracta'];
export const isAdmin = u => !!u && ADMINS.includes(u);
// 요청한 곳(IP)을 한 방향으로 바꾼 값 — 횟수 제한에만 씀, 원래 IP는 어디에도 저장하지 않음
// Vercel은 x-forwarded-for 맨 앞에 실제 접속 주소를 넣어 준다 (사용자가 바꿔 넣은 값은 뒤에 붙음)
export const ipKey = req => {
  const h = req.headers || {}, ip = String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
  return crypto.createHash('sha256').update('msk-ip:' + (process.env.AUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN || '') + ip).digest('base64url').slice(0, 22);
};
// 관리자 아이디로 가입해도 되는지: 관리자 권한이 아이디로 정해지므로, 서버 환경 변수 ADMIN_SIGNUP_KEY 또는 RESET_KEY(16글자 이상)를 아는 사람만
export const adminSignupBlocked = (u, body) => {
  if (!isAdmin(u)) return false;
  const got = String((body && body.adminKey) || '');
  const okKey = want => want.length >= 16 && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  return !(okKey(String(process.env.ADMIN_SIGNUP_KEY || '')) || okKey(String(process.env.RESET_KEY || '')));
};
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
