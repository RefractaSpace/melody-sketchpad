// DB 로컬 테스트 — 진짜 PostgreSQL(PGlite)에서 실제 SQL을 돌리고, 파일 저장소는 메모리로 바꿔 끼움.
// 기존 파일 형식 데이터를 넣어 두고 자동 옮기기 → 로그인·커뮤니티·동시 좋아요/댓글·신고·관리자·계정 삭제까지 검사
//   node tests/db_local_test.mjs      (먼저: npm install && npm install --no-save @electric-sql/pglite)
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
globalThis.__MSK_PG = new PGlite();
const files = new Map(); let seq = 0;
globalThis.__MSK_STORE = {
  put: (path, body) => { const url = `mem://${path}?${++seq}`; files.set(url, {pathname:path, url, size:body.length, body:Buffer.from(body)}); return url; },
  list: prefix => [...files.values()].filter(f => f.pathname.startsWith(prefix)).map(({pathname, url, size}) => ({pathname, url, size})),
  read: url => { const f = files.get(url); if (!f) throw new Error('없는 파일'); return f.body; },
  del: urls => urls.forEach(u => files.delete(u)),
};
process.env.BLOB_READ_WRITE_TOKEN = 'test';
const { userDir } = await import('../api/_lib.js');
const MSK = readFileSync(new URL('../songs/Plum풍_1번_진행.msk', import.meta.url));
// ── 기존 형식 데이터 (파일 저장소 시절) ──
const scrypt = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(pw, salt, 64, {N:16384, r:8, p:1}, (e, k) => e ? bad(e) : ok(k)));
const salt = crypto.randomBytes(16), store = globalThis.__MSK_STORE;
store.put(userDir('olduser') + 'account-abc.json', Buffer.from(JSON.stringify({u:'olduser', salt:salt.toString('base64'), hash:(await scrypt('old_pass_123', salt)).toString('base64'), created:'2026-09-01T00:00:00.000Z'})));
store.put('community/aaaaaaaaaaaa/song-x.msk', MSK);
store.put('community/aaaaaaaaaaaa/post-x.json', Buffer.from(JSON.stringify({id:'aaaaaaaaaaaa', title:'옛 글', desc:'파일 시절 글', tags:['옛날'], author:'olduser', created:'2026-09-02T00:00:00.000Z', likes:['olduser', 'ghost'], comments:[{id:'c0ffee01', user:'olduser', text:'옛 댓글', at:'2026-09-02T01:00:00.000Z', reports:[]}], reports:[], bpm:138, bars:18, size:MSK.length})));
store.put('community/bbbbbbbbbbbb/song-y.msk', MSK);
store.put('community/bbbbbbbbbbbb/post-y.json', Buffer.from(JSON.stringify({id:'bbbbbbbbbbbb', title:'지워진 사람 글', desc:'', tags:[], author:'ghost', created:'2026-09-03T00:00:00.000Z', likes:[], comments:[], reports:[]})));

const chat = (await import('../api/chat.js')).default, auth = (await import('../api/auth.js')).default, lic = (await import('../api/license.js')).default, pay = (await import('../api/checkout.js')).default, comm = (await import('../api/community.js')).default, { migrateFromBlob } = await import('../api/_db.js');
const call = (h, {method = 'GET', query = {}, tok, body} = {}) => new Promise(resolve => {
  const res = {c:200, setHeader() {}, status(c) { this.c = c; return this; },
    set statusCode(c) { this.c = c; }, get statusCode() { return this.c; },
    json(o) { resolve({s:this.c, j:o}); }, send(b) { resolve({s:this.c, j:b}); },
    end(b) { let j = b; if (typeof b === 'string') { try { j = JSON.parse(b); } catch (e) {} } resolve({s:this.c, j}); }};
  h({method, query, headers:tok ? {authorization:'Bearer ' + tok} : {}, body}, res).catch(e => resolve({s:599, j:String(e)}));
});
const results = []; const check = (name, ok, d = '') => { results.push(!!ok); console.log((ok ? '  ✅ ' : '  ❌ ') + name + (d ? '  — ' + d : '')); };
const signup = async (u, pw = 'pass_word_123') => (await call(auth, {method:'POST', query:{action:'signup'}, body:{username:u, password:pw}})).j.token;

let r = await call(auth, {query:{action:'health'}});
const mig = JSON.parse(r.j.migrated || '{}');
check('자동 옮기기: 계정 1 · 글 1 (주인 없는 글은 뺌) · 좋아요 1 (없는 사람 뺌) · 댓글 1', r.s === 200 && r.j.users === 1 && r.j.posts === 1 && mig.likes === 1 && mig.comments === 1, JSON.stringify(mig));
r = await call(auth, {method:'POST', query:{action:'login'}, body:{username:'olduser', password:'old_pass_123'}}); const tOld = r.j.token;
check('옮긴 계정이 예전 비밀번호로 로그인', r.s === 200 && tOld);
r = await call(comm, {query:{id:'aaaaaaaaaaaa'}});
check('옮긴 글: 좋아요·댓글·태그 유지', r.s === 200 && r.j.post.likes === 1 && r.j.post.comments.length === 1 && r.j.post.tags[0] === '옛날', `좋아요 ${r.j.post && r.j.post.likes}, 댓글 ${r.j.post && r.j.post.comments.length}`);
check('다시 옮겨도 중복 없음', Object.values(await migrateFromBlob()).every(v => v === 0));

const tA = await signup('usera'), tAdmin = await signup('refracta');
check('회원가입', tA && tAdmin);
check('같은 아이디 거절', (await call(auth, {method:'POST', query:{action:'signup'}, body:{username:'usera', password:'pass_word_123'}})).s === 409);
const race = await Promise.all(Array.from({length:6}, () => call(auth, {method:'POST', query:{action:'signup'}, body:{username:'sameid', password:'pass_word_123'}})));
check('같은 아이디 6명 동시 가입 → 딱 1명만 성공', race.filter(x => x.s === 200).length === 1 && race.filter(x => x.s === 409).length === 5, race.map(x => x.s).join(','));
for (let i = 0; i < 8; i++) await call(auth, {method:'POST', query:{action:'login'}, body:{username:'usera', password:'wrong_wrong'}});
check('8번 틀리면 잠금 (DB에 저장 → 모든 서버 공유)', (await call(auth, {method:'POST', query:{action:'login'}, body:{username:'usera', password:'pass_word_123'}})).s === 429);
await globalThis.__MSK_PG.query(`delete from login_fails`);
r = await call(auth, {method:'POST', query:{action:'password'}, tok:tA, body:{old:'pass_word_123', password:'new_pass_456'}});
check('비밀번호 바꾸기 → 옛 비번 거절 · 새 비번 로그인', r.s === 200 && (await call(auth, {method:'POST', query:{action:'login'}, body:{username:'usera', password:'pass_word_123'}})).s === 401 && (await call(auth, {method:'POST', query:{action:'login'}, body:{username:'usera', password:'new_pass_456'}})).s === 200);
check('내 정보 · 관리자 표시', (await call(auth, {query:{action:'me'}, tok:tAdmin})).j.admin === true && (await call(auth, {query:{action:'me'}, tok:tA})).j.admin === false);

r = await call(comm, {method:'POST', query:{action:'publish', title:'새 글', tags:'db,테스트', bpm:'120', bars:'4'}, tok:tA, body:MSK}); const pid = r.j.post && r.j.post.id;
check('게시 (곡 파일 1개만 파일 저장소에, 나머지는 DB)', r.s === 200 && pid && files.size === 6, `파일 ${files.size}개 (기존 5 + 새 곡 1)`);
check('MSK 아닌 파일 거절', (await call(comm, {method:'POST', query:{action:'publish', title:'x'}, tok:tA, body:Buffer.from('hello')})).s === 400);
const many = []; for (let i = 0; i < 25; i++) many.push(await signup('liker' + i));
await Promise.all(many.map(t => call(comm, {method:'POST', query:{action:'like', id:pid}, tok:t})));
await Promise.all(many.map((t, i) => call(comm, {method:'POST', query:{action:'comment', id:pid}, tok:t, body:{text:'댓글 ' + i}})));
r = await call(comm, {query:{id:pid}});
check('25명이 동시에 좋아요 → 25개 (하나도 안 사라짐)', r.j.post.likes === 25, `좋아요 ${r.j.post.likes}`);
check('25명이 동시에 댓글 → 25개', r.j.post.comments.length === 25, `댓글 ${r.j.post.comments.length}`);
r = await call(comm, {method:'POST', query:{action:'like', id:pid}, tok:many[0]});
check('좋아요 다시 누르면 취소', r.j.likes === 24 && r.j.liked === false);
r = await call(comm, {query:{q:'테스트'}});
check('목록·검색', r.s === 200 && r.j.posts.length === 1 && r.j.posts[0].id === pid && r.j.posts[0].reports === undefined);
check('내 글 신고 거절', (await call(comm, {method:'POST', query:{action:'report', id:pid}, tok:tA, body:{reason:'x'}})).s === 400);
const rep = [];
for (const t of many.slice(0, 2)) rep.push(await call(comm, {method:'POST', query:{action:'report', id:pid}, tok:t, body:{reason:'테스트'}}));
check('같은 사람 두 번 신고 거절 (DB 고유 규칙)', (await call(comm, {method:'POST', query:{action:'report', id:pid}, tok:many[0], body:{reason:'또'}})).s === 409);
rep.push(await call(comm, {method:'POST', query:{action:'report', id:pid}, tok:many[2], body:{reason:'셋째'}}));
check('3명 신고 → 자동 숨김', rep[2].j.hidden === true && rep[2].j.reports === 3);
check('숨긴 글: 일반 목록·상세에서 사라짐, 글쓴이·관리자는 보임', !(await call(comm, {})).j.posts.some(p => p.id === pid) && (await call(comm, {query:{id:pid}})).s === 404
  && (await call(comm, {tok:tA})).j.posts.some(p => p.id === pid) && (await call(comm, {query:{id:pid}, tok:tAdmin})).s === 200);
check('관리자 아닌 사람의 숨기기·신고 목록 거절', (await call(comm, {method:'POST', query:{action:'unhide', id:pid}, tok:many[3]})).s === 403 && (await call(comm, {query:{reported:'1'}, tok:many[3]})).s === 403);
r = await call(comm, {query:{reported:'1'}, tok:tAdmin});
check('관리자 신고 목록', r.j.posts[0].id === pid && r.j.posts[0].reports === 3);
await call(comm, {method:'POST', query:{action:'unhide', id:pid}, tok:tAdmin});
check('관리자 보이기 → 다시 보임 · 신고 기록 비움', (await call(comm, {})).j.posts.find(p => p.id === pid)?.reports === undefined && (await call(comm, {query:{reported:'1'}, tok:tAdmin})).j.posts.every(p => p.id !== pid || p.reports === 0));
const cid = (await call(comm, {query:{id:pid}})).j.post.comments[0].id;
r = await call(comm, {method:'POST', query:{action:'report', id:pid, comment:cid}, tok:tA, body:{reason:'x'}});
check('댓글 신고', r.s === 200 && r.j.reports === 1);
check('남의 글 지우기 거절', (await call(comm, {method:'DELETE', query:{id:pid}, tok:many[4]})).s === 403);
r = await call(auth, {method:'POST', query:{action:'delete'}, tok:many[5], body:{password:'pass_word_123'}});
const after = (await call(comm, {query:{id:pid}})).j.post;
check('계정 삭제 → 그 사람의 좋아요·댓글도 DB가 함께 지움', r.s === 200 && after.likes === 23 && after.comments.length === 24, `좋아요 ${after.likes}, 댓글 ${after.comments.length}`);
const before = files.size; r = await call(auth, {method:'POST', query:{action:'delete'}, tok:tA, body:{password:'new_pass_456'}});
check('글쓴이 계정 삭제 → 글·곡 파일까지 삭제', r.s === 200 && r.j.posts === 1 && (await call(comm, {query:{id:pid}})).s === 404 && files.size === before - 1);
const [cnt] = (await globalThis.__MSK_PG.query(`select (select count(*) from likes where post_id = $1)::int l, (select count(*) from comments where post_id = $1)::int c, (select count(*) from reports where post_id = $1)::int r`, [pid])).rows;
check('지운 글의 좋아요·댓글·신고 줄이 남지 않음', cnt.l === 0 && cnt.c === 0 && cnt.r === 0, JSON.stringify(cnt));

// ── 6: 라이선스 (등급) ──────────────────────────────────────────
{
  const tB = await signup('tieruser');
  let r = await call(lic, {});
  check('라이선스: 로그인 안 하면 SE', r.s === 200 && r.j.tier === 'se' && r.j.signedIn === false, JSON.stringify(r.j));

  r = await call(lic, {tok:tB});
  check('라이선스: 로그인해도 산 적 없으면 SE', r.s === 200 && r.j.tier === 'se' && r.j.signedIn === true, JSON.stringify(r.j));

  r = await call(lic, {method:'POST', tok:tB, body:{tier:'pro'}});
  check('라이선스: 일반 사용자는 등급을 못 바꿈 (403)', r.s === 403, `${r.s} ${JSON.stringify(r.j)}`);

  r = await call(lic, {method:'POST', tok:tAdmin, body:{tier:'pro', username:'tieruser', note:'시험'}});
  check('라이선스: 관리자가 Pro로 올림', r.s === 200 && r.j.tier === 'pro' && r.j.username === 'tieruser', JSON.stringify(r.j));

  r = await call(lic, {tok:tB});
  check('라이선스: 올린 등급이 서버에서 그대로 보임', r.s === 200 && r.j.tier === 'pro', JSON.stringify(r.j));

  r = await call(lic, {method:'POST', tok:tAdmin, body:{tier:'ultra', username:'tieruser'}});
  check('라이선스: 없는 등급은 거절 (400)', r.s === 400, `${r.s}`);

  await globalThis.__MSK_PG.query(`update licenses set expires = now() - interval '1 day' where username = 'tieruser'`);
  r = await call(lic, {tok:tB});
  check('라이선스: 기간이 끝나면 SE로 내려감', r.s === 200 && r.j.tier === 'se' && r.j.expired === true, JSON.stringify(r.j));

  await globalThis.__MSK_PG.query(`update licenses set expires = now() + interval '30 days' where username = 'tieruser'`);
  r = await call(lic, {tok:tB});
  check('라이선스: 기간이 남아 있으면 그대로', r.s === 200 && r.j.tier === 'pro' && !r.j.expired, JSON.stringify(r.j));

  await call(auth, {method:'POST', query:{action:'delete'}, tok:tB, body:{password:'pass_word_123'}});
  const [lc] = (await globalThis.__MSK_PG.query(`select count(*)::int n from licenses where username = 'tieruser'`)).rows;
  check('라이선스: 계정을 지우면 라이선스도 함께 지워짐', lc.n === 0, JSON.stringify(lc));
}


// ── 6: 결제 (공격 시도가 막히는지 중심으로) ─────────────────────
{
  const tC = await signup('buyer');
  let r = await call(pay, {query:{action:'plans'}});
  check('결제: 가격표는 로그인 없이도 보임', r.s === 200 && r.j.plans.length === 3 && r.j.plans.find(p => p.tier === 'max').amount === 119000, JSON.stringify(r.j.plans.map(p => p.tier + ':' + p.amount)));

  r = await call(pay, {method:'POST', query:{action:'start'}, body:{tier:'pro'}});
  check('결제: 로그인 없이 주문 → 거절 (401)', r.s === 401, String(r.s));

  r = await call(pay, {method:'POST', query:{action:'start'}, tok:tC, body:{tier:'ultra'}});
  check('결제: 없는 등급 주문 → 거절 (400)', r.s === 400, String(r.s));

  r = await call(pay, {method:'POST', query:{action:'start'}, tok:tC, body:{tier:'pro'}});
  const ord = r.j.orderId;
  check('결제: 주문 만들기 (Pro ₩89,000)', r.s === 200 && !!ord && r.j.amount === 89000, JSON.stringify({id:!!ord, amount:r.j.amount}));

  // 공격 1: 결제 안 하고 완료라고 우기기
  r = await call(pay, {method:'POST', query:{action:'finish'}, tok:tC, body:{orderId:ord, provider_id:'아무거나'}});
  const afterFake = (await call(lic, {tok:tC})).j.tier;
  check('🛡 결제 안 하고 완료 주장 → 거절 (402) · 등급 그대로', r.s === 402 && afterFake === 'se', `${r.s} · 등급 ${afterFake}`);

  // 공격 2: 적은 금액만 내고 비싼 등급 받기
  const ord2 = (await call(pay, {method:'POST', query:{action:'start'}, tok:tC, body:{tier:'pro'}})).j.orderId;
  r = await call(pay, {method:'POST', query:{action:'finish'}, tok:tC, body:{orderId:ord2, provider_id:'ok_100'}});
  const afterCheap = (await call(lic, {tok:tC})).j.tier;
  check('🛡 100원만 내고 Pro 받기 → 거절 (금액 확인) · 등급 그대로', r.s === 402 && r.j.reason === 'amount' && afterCheap === 'se', `${r.s} ${r.j.reason} · 등급 ${afterCheap}`);

  // 공격 3: 남의 주문번호로 등급 받기
  const tD = await signup('other');
  const ordD = (await call(pay, {method:'POST', query:{action:'start'}, tok:tD, body:{tier:'max'}})).j.orderId;
  r = await call(pay, {method:'POST', query:{action:'finish'}, tok:tC, body:{orderId:ordD, provider_id:'ok_119000'}});
  check('🛡 남의 주문번호로 받기 → 거절 (404)', r.s === 404, String(r.s));

  // 정상 결제
  const ord3 = (await call(pay, {method:'POST', query:{action:'start'}, tok:tC, body:{tier:'pro'}})).j.orderId;
  r = await call(pay, {method:'POST', query:{action:'finish'}, tok:tC, body:{orderId:ord3, provider_id:'ok_89000'}});
  const nowTier = (await call(lic, {tok:tC})).j.tier;
  check('결제: 금액이 맞으면 Pro 등급이 들어감', r.s === 200 && r.j.ok && nowTier === 'pro', `${r.s} · 등급 ${nowTier}`);

  // 공격 4: 같은 결제로 두 번 받기
  r = await call(pay, {method:'POST', query:{action:'finish'}, tok:tC, body:{orderId:ord3, provider_id:'ok_89000'}});
  check('🛡 같은 결제 두 번 쓰기 → 이미 처리됨으로 넘김', r.s === 200 && r.j.already === true, JSON.stringify(r.j));

  // 이미 Pro인데 또 Pro 사기
  r = await call(pay, {method:'POST', query:{action:'start'}, tok:tC, body:{tier:'pro'}});
  check('결제: 이미 가진 등급은 다시 못 삼 (409)', r.s === 409, `${r.s} ${r.j.message || ''}`);

  r = await call(pay, {method:'POST', query:{action:'start'}, tok:tC, body:{tier:'max'}});
  check('결제: 더 높은 등급(Max)은 살 수 있음', r.s === 200 && r.j.amount === 119000, String(r.s));

  r = await call(pay, {query:{action:'orders'}, tok:tC});
  check('결제: 내 주문 기록이 남음 (실패·성공 모두)', r.s === 200 && r.j.orders.length >= 4 && r.j.orders.some(o => o.status === 'paid') && r.j.orders.some(o => o.status === 'failed'),
        r.j.orders.map(o => o.status).join(','));
}

// ── 채팅 커뮤니티 ───────────────────────────────────────────────
{
  const t1 = await signup('chatter'), t2 = await signup('friend');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let r = await call(chat, {query:{action:'channels'}});
  check('채팅: 채널 4개 (공개곡·질문·자랑·잡담)', r.s === 200 && r.j.channels.length === 4 && r.j.channels[0].id === 'songs', r.j.channels.map(c => c.name).join(','));

  r = await call(chat, {method:'POST', query:{action:'send'}, body:{channel:'talk', text:'안녕'}});
  check('채팅: 로그인 없이 보내기 → 거절 (401)', r.s === 401, String(r.s));

  r = await call(chat, {method:'POST', query:{action:'send'}, tok:t1, body:{channel:'없는채널', text:'x'}});
  check('채팅: 없는 채널 → 거절 (400)', r.s === 400, String(r.s));

  r = await call(chat, {method:'POST', query:{action:'send'}, tok:t1, body:{channel:'talk', text:''}});
  check('채팅: 빈 메시지 → 거절 (400)', r.s === 400, String(r.s));

  r = await call(chat, {method:'POST', query:{action:'send'}, tok:t1, body:{channel:'talk', text:'첫 메시지'}});
  const m1 = r.j.id;
  check('채팅: 메시지 보내기', r.s === 200 && !!m1, JSON.stringify(r.j).slice(0, 60));

  r = await call(chat, {method:'POST', query:{action:'send'}, tok:t1, body:{channel:'talk', text:'연속'}});
  check('🛡 채팅: 5초 안에 또 보내기 → 도배 막힘 (429)', r.s === 429, String(r.s));

  await wait(5100);
  r = await call(chat, {method:'POST', query:{action:'send'}, tok:t1, body:{channel:'songs', text:'곡 올려요', song:{url:'https://x/a.msk', name:'첫 곡', bars:8, bpm:120, size:900}}});
  const m2 = r.j.id;
  check('채팅: 곡을 붙여서 보내기', r.s === 200 && !!m2, String(r.s));

  r = await call(chat, {query:{channel:'talk'}});
  check('채팅: 채널별로 나뉨 (잡담에 1개)', r.s === 200 && r.j.messages.length === 1 && r.j.messages[0].text === '첫 메시지', `${r.j.messages.length}개`);

  r = await call(chat, {query:{channel:'songs'}, tok:t2});
  const got = r.j.messages[0];
  check('채팅: 공개곡 채널에 곡이 붙어서 보임', got && got.song_name === '첫 곡' && got.song_bars === 8, JSON.stringify({n:got?.song_name, b:got?.song_bars}));

  r = await call(chat, {method:'POST', query:{action:'react'}, tok:t2, body:{id:m2, emoji:'\u2764'}});
  check('채팅: 이모지 반응 켜기', r.s === 200 && r.j.on === true && r.j.n === 1, JSON.stringify(r.j));

  r = await call(chat, {method:'POST', query:{action:'react'}, tok:t2, body:{id:m2, emoji:'\u2764'}});
  check('채팅: 같은 반응 다시 누르면 꺼짐', r.s === 200 && r.j.on === false && r.j.n === 0, JSON.stringify(r.j));

  await call(chat, {method:'POST', query:{action:'react'}, tok:t2, body:{id:m2, emoji:'\u2764'}});
  await call(chat, {method:'POST', query:{action:'react'}, tok:t1, body:{id:m2, emoji:'\u2764'}});
  r = await call(chat, {query:{channel:'songs'}});
  check('채팅: 반응이 메시지에 함께 옴 (2명)', r.j.messages[0].reactions[0].n === 2, JSON.stringify(r.j.messages[0].reactions));

  r = await call(chat, {method:'POST', query:{action:'react'}, tok:t2, body:{id:m2, emoji:'\uD83D\uDCA9'}});
  check('🛡 채팅: 정해진 이모지 아니면 거절 (400)', r.s === 400, String(r.s));

  r = await call(chat, {method:'POST', query:{action:'delete'}, tok:t2, body:{id:m2}});
  check('🛡 채팅: 남의 메시지 지우기 → 거절 (403)', r.s === 403, String(r.s));

  const before = (await call(chat, {query:{channel:'songs'}})).j.messages.length;
  r = await call(chat, {query:{channel:'songs', after:m2}});
  check('채팅: after로 물어보면 새 것만 (지금은 0개)', r.s === 200 && r.j.messages.length === 0, `전체 ${before}개 중 새 것 ${r.j.messages.length}개`);

  r = await call(chat, {query:{channel:'songs'}, tok:t1});
  check('채팅: 접속 중인 사람 목록', r.s === 200 && r.j.online.some(o => o.username === 'chatter'), r.j.online.map(o => o.username).join(','));

  r = await call(chat, {method:'POST', query:{action:'delete'}, tok:t1, body:{id:m2}});
  const after2 = (await call(chat, {query:{channel:'songs'}})).j.messages[0];
  check('채팅: 내 메시지 지우기 → 내용은 지워지고 자리는 남음', r.s === 200 && after2.deleted === true && !after2.text && !after2.song_url, JSON.stringify({d:after2.deleted, t:after2.text}));

  r = await call(chat, {method:'POST', query:{action:'hide'}, tok:t1, body:{id:m1}});
  check('🛡 채팅: 관리자 아닌 사람의 숨기기 → 거절 (403)', r.s === 403, String(r.s));

  // 신고
  const tE = await signup('reporter'), tF = await signup('reporter2'), tG = await signup('reporter3');
  await wait(5100);
  const mr = (await call(chat, {method:'POST', query:{action:'send'}, tok:t1, body:{channel:'help', text:'신고 대상 메시지'}})).j.id;

  let rr = await call(chat, {method:'POST', query:{action:'report'}, tok:t1, body:{id:mr, reason:'내 것'}});
  check('🛡 신고: 내 메시지는 신고 못 함 (400)', rr.s === 400, String(rr.s));

  rr = await call(chat, {method:'POST', query:{action:'report'}, tok:tE, body:{id:mr, reason:'욕설'}});
  check('신고: 신고하면 쌓임 (1명)', rr.s === 200 && rr.j.n === 1 && rr.j.hidden === false, JSON.stringify(rr.j));

  rr = await call(chat, {method:'POST', query:{action:'report'}, tok:tE, body:{id:mr}});
  check('🛡 신고: 같은 사람이 두 번 신고 → 거절 (409)', rr.s === 409, String(rr.s));

  await call(chat, {method:'POST', query:{action:'report'}, tok:tF, body:{id:mr, reason:'광고'}});
  rr = await call(chat, {method:'POST', query:{action:'report'}, tok:tG, body:{id:mr}});
  check('신고: 3명이 신고하면 자동으로 숨겨짐', rr.s === 200 && rr.j.n === 3 && rr.j.hidden === true, JSON.stringify(rr.j));

  rr = await call(chat, {query:{channel:'help'}});
  check('신고: 숨겨진 메시지는 목록에서 사라짐', !rr.j.messages.some(m => m.id === mr), `${rr.j.messages.length}개 남음`);

  rr = await call(chat, {query:{action:'reports'}, tok:tE});
  check('🛡 신고: 관리자 아닌 사람의 신고 목록 → 거절 (403)', rr.s === 403, String(rr.s));

  rr = await call(chat, {query:{action:'reports'}, tok:tAdmin});
  const first = rr.j.reports[0];
  check('신고: 관리자는 신고 목록과 이유를 봄', rr.s === 200 && first && first.reports === 3 && first.reasons.length === 2,
        `${rr.j.reports.length}건 · 신고 ${first?.reports} · 이유 ${JSON.stringify(first?.reasons)}`);

  await call(chat, {method:'POST', query:{action:'unhide'}, tok:tAdmin, body:{id:mr}});
  rr = await call(chat, {query:{channel:'help'}});
  const back = rr.j.messages.some(m => m.id === mr);
  const left = (await call(chat, {query:{action:'reports'}, tok:tAdmin})).j.reports.some(r => r.id === mr);
  check('신고: 관리자가 되돌리면 다시 보이고 신고 기록이 비워짐', back && !left, `보임 ${back} · 신고기록남음 ${left}`);

  await call(chat, {method:'POST', query:{action:'hide'}, tok:tAdmin, body:{id:m1}});
  r = await call(chat, {query:{channel:'talk'}});
  check('채팅: 관리자가 숨기면 목록에서 사라짐', r.j.messages.length === 0, `${r.j.messages.length}개`);
}

console.log(`\nDB 결과: ${results.filter(Boolean).length}/${results.length} 통과`); process.exit(results.every(Boolean) ? 0 : 1);
