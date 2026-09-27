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

const auth = (await import('../api/auth.js')).default, comm = (await import('../api/community.js')).default, { migrateFromBlob } = await import('../api/_db.js');
const call = (h, {method = 'GET', query = {}, tok, body} = {}) => new Promise(resolve => {
  const res = {c:200, setHeader() {}, status(c) { this.c = c; return this; }, json(o) { resolve({s:this.c, j:o}); }, send(b) { resolve({s:this.c, j:b}); }, end() { resolve({s:this.c}); }};
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
console.log(`\nDB 결과: ${results.filter(Boolean).length}/${results.length} 통과`); process.exit(results.every(Boolean) ? 0 : 1);
