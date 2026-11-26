/* 멜로디 스케치패드 — 서비스 워커 (한 번 연 뒤에는 인터넷 없이도 앱이 열리게)
   맡는 범위: /app/ 아래 페이지 (소개 페이지는 건드리지 않음)

   파일 종류별 규칙
     앱 화면·코드 (/app/, app.js, style.css, piano*.js)  인터넷 먼저 → 실패하면 창고   ← 옛 버전이 남지 않게
     악기 샘플 (/app/samples/)                           창고 먼저 → 없으면 받아서 넣기  ← 바뀌지 않는 큰 파일
     음악 AI 모델 · MP3 변환기 · 글꼴 (외부)               창고 먼저 → 없으면 받아서 넣기
     서버 API (/api/), 피아노 (/assets/, 앱이 따로 저장)   건드리지 않음 (계정·곡 정보는 창고에 안 넣음)

   VERSION은 빌드할 때 app.js·style.css·index.html 내용으로 정해짐 → 앱이 바뀌면 sw.js도 바뀌어
   브라우저가 새 워커를 설치하고, 옛 화면 창고는 지운다. */
const VERSION = '41b63ae54c4d';
const SHELL = 'msk-shell-' + VERSION;     // 앱 화면·코드
const RUNTIME = 'msk-runtime-v1';         // 악기 샘플·외부 파일 (버전이 바뀌어도 유지)
const PRECACHE = ['/app/', '/app/app.js', '/app/style.css'];
const NET_WAIT = 4000;                    // 인터넷이 이 시간(ms) 안에 답이 없으면 창고 사본을 씀

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // cache:'reload' — 브라우저 HTTP 캐시가 아니라 서버의 최신 파일로 채운다
    await c.addAll(PRECACHE.map(u => new Request(u, {cache:'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('msk-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

// 인터넷 먼저: 성공하면 창고도 새로 고침, 실패하거나 너무 느리면 창고 사본
async function networkFirst(req, key) {
  const c = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, no) => setTimeout(() => no(new Error('timeout')), NET_WAIT)),
    ]);
    if (res.ok) c.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key || req, {ignoreSearch:true});
    if (hit) return hit;
    throw err;
  }
}

// 창고 먼저: 없을 때만 받아서 넣기
async function cacheFirst(req, allowOpaque) {
  const c = await caches.open(RUNTIME);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || (allowOpaque && res.type === 'opaque')) c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url), same = u.origin === self.location.origin;

  if (same) {
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/assets/')) return;
    if (req.mode === 'navigate' && u.pathname.startsWith('/app/')) { e.respondWith(networkFirst(req, '/app/')); return; }
    if (/^\/app\/(app\.js|style\.css|piano(-soft|-hard)?\.js)$/.test(u.pathname)) { e.respondWith(networkFirst(req)); return; }
    if (u.pathname.startsWith('/app/samples/')) { e.respondWith(cacheFirst(req)); return; }
    return;
  }
  // 외부: 주소에 버전이 박혀 있어 내용이 안 바뀌는 것만
  if (u.hostname === 'storage.googleapis.com' && u.pathname.startsWith('/magentadata/')) { e.respondWith(cacheFirst(req)); return; }
  if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.startsWith('/npm/@magenta/')) { e.respondWith(cacheFirst(req)); return; }
  if (u.hostname === 'cdnjs.cloudflare.com') { e.respondWith(cacheFirst(req)); return; }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req, true)); return; }
});
