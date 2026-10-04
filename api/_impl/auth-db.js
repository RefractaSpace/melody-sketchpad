// 로그인 API — DB 버전 (계정은 users 표, 틀린 횟수는 login_fails 표라서 모든 서버가 공유)
import crypto from 'node:crypto';
import { cors, makeToken, readToken, userDir, readJson, isAdmin } from '../_lib.js';
import { q, ensureDB } from '../_db.js';
import { listFiles, delFiles } from '../_store.js';

const scrypt = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(pw, salt, 64, {N:16384, r:8, p:1}, (e, k) => e ? bad(e) : ok(k)));
const verify = async (pw, rec) => crypto.timingSafeEqual(await scrypt(String(pw || ''), Buffer.from(rec.salt, 'base64')), Buffer.from(rec.hash, 'base64'));
const bearer = req => readToken(String(req.headers.authorization || '').replace(/^Bearer /, ''));
const user = async u => (await q(`select username, salt, hash, created from users where username = $1`, [u]))[0] || null;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const action = String(req.query.action || '');
  try {
    await ensureDB();
    if (action === 'health') { const [c] = await q(`select (select count(*) from users)::int as users, (select count(*) from posts)::int as posts, (select v from meta where k = 'migrated') as migrated`); return res.status(200).json({db:true, ...c}); }
    if (action === 'me') {
      const u = bearer(req); if (!u) return res.status(401).json({error:'bad-token', message:'로그인이 필요해요'});
      const rec = await user(u); if (!rec) return res.status(401).json({error:'bad-token', message:'계정이 없어요. 다시 로그인해 주세요'});
      const songs = await listFiles(userDir(u) + 'songs/');
      return res.status(200).json({username:u, admin:isAdmin(u), created:rec.created, songs:songs.length, bytes:songs.reduce((a, b) => a + b.size, 0), limitBytes:4 * 1024 * 1024});
    }
    if (req.method !== 'POST') return res.status(405).json({error:'method'});
    const body = await readJson(req);
    /* 비밀번호를 잊었을 때 — Vercel 환경변수 RESET_KEY 를 아는 사람만 바꿀 수 있다.
       로그인이 필요 없으므로, 열쇠가 없으면 아예 동작하지 않게 막는다. */
    if (action === 'reset') {
      const KEY = process.env.RESET_KEY || '';
      if (KEY.length < 16) return res.status(503).json({error:'off', message:'재설정이 꺼져 있어요'});
      const given = String(body.key || '');
      // 길이가 달라도 시간이 같게 비교 (열쇠를 한 글자씩 알아내는 공격 막기)
      const ok = given.length === KEY.length &&
        crypto.timingSafeEqual(Buffer.from(given), Buffer.from(KEY));
      if (!ok) {
        await new Promise(r => setTimeout(r, 800));          // 마구 찔러보지 못하게
        return res.status(403).json({error:'bad-key', message:'열쇠가 달라요'});
      }
      const who = String(body.username || '').trim();
      const np = String(body.password || '');
      if (np.length < 8 || np.length > 200) return res.status(400).json({error:'bad-password', message:'새 비밀번호는 8글자 이상이에요'});
      const rec2 = await user(who);
      if (!rec2) return res.status(404).json({error:'no-user', message:'없는 계정이에요'});
      const salt = crypto.randomBytes(16), hash = await scrypt(np, salt);
      await q(`update users set salt = $2, hash = $3, changed = now() where username = $1`,
              [who, salt.toString('base64'), hash.toString('base64')]);
      return res.status(200).json({ok:true, username:who});
    }

    if (action === 'signup' || action === 'login') {
      const username = String(body.username || '').trim().toLowerCase(), password = String(body.password || '');
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({error:'bad-username', message:'아이디는 영문 소문자·숫자·_ 3~20글자예요'});
      if (password.length < 8 || password.length > 200) return res.status(400).json({error:'bad-password', message:'비밀번호는 8글자 이상이에요'});
      const [f] = await q(`select n, at from login_fails where username = $1`, [username]);
      if (f && f.n >= 8 && Date.now() - new Date(f.at) < 10 * 60e3) return res.status(429).json({error:'slow-down', message:'로그인을 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요'});
      if (action === 'signup') {
        // 만 14세 미만은 가입을 받지 않는다 (보호자 동의 절차가 없으므로). 앱 화면만 막으면 우회되니 서버에서도 확인
        if (body.age14 !== true) return res.status(400).json({error:'age', message:'만 14세 이상만 가입할 수 있어요 (개인정보처리방침 동의 필요)'});
        const salt = crypto.randomBytes(16), hash = await scrypt(password, salt);
        const ins = await q(`insert into users (username, salt, hash, agreed) values ($1, $2, $3, now()) on conflict do nothing returning username`, [username, salt.toString('base64'), hash.toString('base64')]);   // 같은 아이디 동시 가입도 DB 기본 키가 막음
        if (!ins.length) return res.status(409).json({error:'taken', message:'이미 있는 아이디예요'});
        return res.status(200).json({token:makeToken(username), username});
      }
      const rec = await user(username);
      if (!rec || !(await verify(password, rec))) {
        await q(`insert into login_fails (username, n, at) values ($1, 1, now()) on conflict (username) do update set n = case when now() - login_fails.at > interval '10 minutes' then 1 else login_fails.n + 1 end, at = now()`, [username]);
        return res.status(401).json({error:'wrong', message:'아이디나 비밀번호가 틀렸어요'});
      }
      await q(`delete from login_fails where username = $1`, [username]);
      return res.status(200).json({token:makeToken(username), username});
    }
    const u = bearer(req); if (!u) return res.status(401).json({error:'bad-token', message:'로그인이 필요해요'});
    const rec = await user(u); if (!rec) return res.status(404).json({error:'not-found'});
    if (action === 'password') {
      const np = String(body.password || ''); if (np.length < 8 || np.length > 200) return res.status(400).json({error:'bad-password', message:'새 비밀번호는 8글자 이상이에요'});
      if (!(await verify(body.old, rec))) return res.status(401).json({error:'wrong', message:'지금 비밀번호가 틀렸어요'});
      const salt = crypto.randomBytes(16), hash = await scrypt(np, salt);
      await q(`update users set salt = $2, hash = $3, changed = now() where username = $1`, [u, salt.toString('base64'), hash.toString('base64')]);
      return res.status(200).json({ok:true, token:makeToken(u)});
    }
    if (action === 'delete') {
      if (!(await verify(body.password, rec))) return res.status(401).json({error:'wrong', message:'비밀번호가 틀렸어요'});
      const posts = await q(`select blob_url from posts where author = $1`, [u]);
      const shares = await q(`select url from shares where username = $1`, [u]), msgs = await q(`select song_url from messages where username = $1 and song_url is not null`, [u]);
      await q(`delete from shares where username = $1`, [u]);   // 공유 링크는 on delete set null 이라 직접 지움
      await q(`delete from ai_usage where username = $1`, [u]); await q(`delete from login_fails where username = $1`, [u]);   // 계정과 묶이지 않은 기록
      await q(`delete from users where username = $1`, [u]);   // 글·좋아요·댓글·신고는 DB가 함께 지움 (on delete cascade)
      const files = await listFiles(userDir(u));
      await delFiles([...new Set([...files.map(f => f.url), ...posts.map(p => p.blob_url), ...shares.map(s => s.url), ...msgs.map(m => m.song_url)])]);
      return res.status(200).json({ok:true, deleted:files.length, posts:posts.length, shares:shares.length});
    }
    return res.status(400).json({error:'action'});
  } catch (e) { return res.status(500).json({error:'server', message:String(e.message || e).slice(0, 200)}); }
}
