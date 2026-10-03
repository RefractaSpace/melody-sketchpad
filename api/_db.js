// PostgreSQL 연결 (Neon 서버리스 HTTP 드라이버). 테스트 때는 globalThis.__MSK_PG(PGlite)로 바꿔 끼움.
// 처음 요청 때 표를 만들고(IF NOT EXISTS), 기존 파일 저장소의 계정·커뮤니티 글을 한 번만 옮겨 옴.
import { neon } from '@neondatabase/serverless';
import { listFiles, readFile } from './_store.js';
const URL = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
export const hasDB = () => !!(globalThis.__MSK_PG || URL());
let sql = null, ready = null;
export async function q(text, params = []) {
  if (globalThis.__MSK_PG) return (await globalThis.__MSK_PG.query(text, params)).rows;
  sql = sql || neon(URL()); return sql.query(text, params);
}
const SCHEMA = [
  `create table if not exists meta (k text primary key, v text)`,
  `create table if not exists users (username text primary key, salt text not null, hash text not null, created timestamptz not null default now(), changed timestamptz)`,
  `create table if not exists posts (id text primary key, author text not null references users(username) on delete cascade, title text not null, descr text not null default '', tags text[] not null default '{}',
     bpm int, bars int, size int not null default 0, blob_url text not null, created timestamptz not null default now(), hidden boolean not null default false, hidden_by text)`,
  `create index if not exists posts_created on posts (created desc)`,
  `create table if not exists likes (post_id text not null references posts(id) on delete cascade, username text not null references users(username) on delete cascade, at timestamptz not null default now(), primary key (post_id, username))`,
  `create table if not exists comments (id text primary key, post_id text not null references posts(id) on delete cascade, username text not null references users(username) on delete cascade,
     text text not null, at timestamptz not null default now(), hidden boolean not null default false)`,
  `create index if not exists comments_post on comments (post_id, at)`,
  `create table if not exists reports (id bigserial primary key, post_id text not null references posts(id) on delete cascade, comment_id text references comments(id) on delete cascade,
     username text not null references users(username) on delete cascade, reason text not null default '', at timestamptz not null default now())`,
  `create unique index if not exists reports_once on reports (post_id, coalesce(comment_id, ''), username)`,   // 같은 사람이 같은 대상을 두 번 신고할 수 없음 (DB가 막음)
  `create table if not exists login_fails (username text primary key, n int not null, at timestamptz not null)`,
  `create table if not exists ai_usage (username text not null, day date not null, n int not null, primary key (username, day))`,
  // 6: 라이선스 — 누가 어느 등급인지 (결제로 생기고, 서버에서만 확인)
  `create table if not exists licenses (
     username text primary key references users(username) on delete cascade,
     tier text not null default 'se',
     source text,
     order_id text,
     started timestamptz not null default now(),
     expires timestamptz,
     note text)`,
  `create index if not exists licenses_tier on licenses(tier)`,
  // 6: 결제 기록 — 무엇을 얼마에 샀는지 (환불·문의 대응용)
  `create table if not exists payments (
     id text primary key,
     username text not null references users(username) on delete cascade,
     tier text not null,
     amount integer not null,
     currency text not null default 'KRW',
     provider text not null,
     provider_id text,
     status text not null default 'pending',
     created timestamptz not null default now(),
     paid timestamptz,
     refunded timestamptz,
     raw text)`,
  `create index if not exists payments_user on payments(username, created desc)`,
  // 채팅 커뮤니티 (디스코드식): 채널 안의 메시지와 이모지 반응
  `create table if not exists messages (
     id bigserial primary key,
     channel text not null,
     username text not null references users(username) on delete cascade,
     text text not null default '',
     song_url text, song_name text, song_bars int, song_bpm int, song_size int,
     created timestamptz not null default now(),
     edited timestamptz,
     deleted boolean not null default false,
     hidden boolean not null default false, hidden_by text)`,
  `create index if not exists messages_ch on messages (channel, id desc)`,
  `create table if not exists reactions (
     message_id bigint not null references messages(id) on delete cascade,
     username text not null references users(username) on delete cascade,
     emoji text not null,
     at timestamptz not null default now(),
     primary key (message_id, username, emoji))`,
  `create index if not exists reactions_msg on reactions (message_id)`,
  // 메시지 신고 — 같은 사람이 같은 메시지를 두 번 신고하지 못하게 DB가 막는다
  `create table if not exists msg_reports (
     message_id bigint not null references messages(id) on delete cascade,
     username text not null references users(username) on delete cascade,
     reason text not null default '',
     at timestamptz not null default now(),
     primary key (message_id, username))`,
  `create index if not exists msg_reports_msg on msg_reports (message_id)`,
  // 곡 공유 링크 — 짧은 주소 하나로 곡을 들려준다
  `create table if not exists shares (
     id text primary key,
     username text references users(username) on delete set null,
     name text not null default '',
     url text not null,
     bars int, bpm int, size int,
     plays int not null default 0,
     created timestamptz not null default now(),
     hidden boolean not null default false)`,
  `create index if not exists shares_user on shares (username, created desc)`,
  // 접속 통계 — 날마다 한 줄씩 쌓아 둔다 (누가 왔는지는 남기지 않음)
  `create table if not exists daily (
     day date not null,
     kind text not null,
     key text not null default '',
     n int not null default 0,
     primary key (day, kind, key))`,
  // 오류 기록 — 앱에서 터진 것을 모아 본다
  `create table if not exists errlog (
     id bigserial primary key,
     at timestamptz not null default now(),
     msg text not null,
     where_ text not null default '',
     ua text not null default '',
     n int not null default 1)`,
  `create index if not exists errlog_at on errlog (at desc)`,
  // 누가 언제 접속해 있었는지 (사람 목록용)
  `create table if not exists presence (
     username text primary key references users(username) on delete cascade,
     channel text, at timestamptz not null default now())`,
];
export function ensureDB() { return ready || (ready = setup().catch(e => { ready = null; throw e; })); }
async function setup() {
  for (const s of SCHEMA) await q(s);
  if ((await q(`select 1 from meta where k = 'migrated'`)).length) return;
  const n = await migrateFromBlob();
  await q(`insert into meta (k, v) values ('migrated', $1) on conflict (k) do nothing`, [JSON.stringify({at:new Date().toISOString(), ...n})]);
}
// 기존 파일 저장소 → DB (여러 번 실행해도 같은 결과: ON CONFLICT DO NOTHING)
export async function migrateFromBlob() {
  const out = {users:0, posts:0, likes:0, comments:0, reports:0};
  for (const f of (await listFiles('users/')).filter(f => /\/account[^/]*\.json$/.test(f.pathname))) {
    try { const r = JSON.parse(await readFile(f.url)); const x = await q(`insert into users (username, salt, hash, created) values ($1,$2,$3,$4) on conflict do nothing returning 1`, [r.u, r.salt, r.hash, r.created || new Date().toISOString()]); out.users += x.length; } catch (e) {}
  }
  const all = await listFiles('community/');
  for (const f of all.filter(f => /^community\/[a-z0-9]+\/post[^/]*\.json$/.test(f.pathname))) {
    try {
      const p = JSON.parse(await readFile(f.url)), song = all.find(g => g.pathname.startsWith(`community/${p.id}/song`)); if (!song) continue;
      const ins = await q(`insert into posts (id, author, title, descr, tags, bpm, bars, size, blob_url, created, hidden, hidden_by) select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 where exists (select 1 from users where username = $2) on conflict do nothing returning 1`,
        [p.id, p.author, p.title, p.desc || '', p.tags || [], p.bpm || null, p.bars || null, p.size || 0, song.url, p.created, !!p.hidden, p.hiddenBy || null]);
      if (!ins.length) continue; out.posts++;
      for (const u of p.likes || []) out.likes += (await q(`insert into likes (post_id, username) select $1,$2 where exists (select 1 from users where username = $2) on conflict do nothing returning 1`, [p.id, u])).length;
      for (const c of p.comments || []) {
        out.comments += (await q(`insert into comments (id, post_id, username, text, at, hidden) select $1,$2,$3,$4,$5,$6 where exists (select 1 from users where username = $3) on conflict do nothing returning 1`, [c.id, p.id, c.user, c.text, c.at, !!c.hidden])).length;
        for (const r of c.reports || []) out.reports += (await q(`insert into reports (post_id, comment_id, username, reason, at) select $1,$2,$3,$4,$5 where exists (select 1 from users where username = $3) and exists (select 1 from comments where id = $2) on conflict do nothing returning 1`, [p.id, c.id, r.user, r.reason || '', r.at])).length;
      }
      for (const r of p.reports || []) out.reports += (await q(`insert into reports (post_id, username, reason, at) select $1,$2,$3,$4 where exists (select 1 from users where username = $2) on conflict do nothing returning 1`, [p.id, r.user, r.reason || '', r.at])).length;
    } catch (e) {}
  }
  return out;
}
