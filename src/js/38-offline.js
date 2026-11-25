/* 38-offline.js — 서비스 워커 등록 (한 번 연 뒤에는 인터넷 없이도 앱이 열리게, 규칙은 src/sw.js)
   웹(https)·내 컴퓨터 시험 서버(localhost)에서만. 데스크톱 앱(file://)은 파일이 이미 내 컴퓨터에 있어서 필요 없음
   /app(슬래시 없음)으로 들어와도 주소창을 /app/ 로 바꿔 둔다 — 워커가 맡는 범위가 /app/ 아래라서,
   이렇게 해야 오프라인에서 새로고침했을 때도 열린다 (페이지를 다시 불러오지는 않음) */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  if (location.pathname === '/app') history.replaceState(history.state, '', '/app/' + location.search + location.hash);
  if (location.pathname.startsWith('/app/'))
    addEventListener('load', () => { navigator.serviceWorker.register('/app/sw.js', {scope:'/app/'}).catch(() => {}); });
}
