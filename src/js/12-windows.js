/* 12-windows.js — 떠다니는 창 (FL Studio처럼 끌어서 옮기고, 모서리로 크기 조절)
   휴대폰(폭 760px 이하)에서는 창이 위아래로 쌓여요 */
const WINS = ['browser', 'playlist', 'rack', 'roll', 'mixer'];
const WIN_NAME = {browser:'브라우저', playlist:'플레이리스트', rack:'채널 랙', roll:'피아노 롤', mixer:'믹서'};
const LAYOUT_KEY = 'melody-sketchpad-layout-v1', ws = $('workspace');
let layout = {}, zTop = 10;
const winEl = n => $('win-' + n);
const stacked = () => window.matchMedia('(max-width:760px)').matches;
const winOpen = n => !winEl(n).hidden;
function defaultLayout() {
  // 화면 높이에 맞춰 배치: 위 플레이리스트 · 가운데 채널 랙+믹서 · 아래 피아노 롤, 왼쪽 브라우저
  const W = Math.max(900, ws.clientWidth), L = 266, R = W - L, top = ws.getBoundingClientRect().top + scrollY;
  const avail = Math.max(820, innerHeight - top - 14), plH = 210, midH = 236, rollY = plH + midH + 12, rollH = Math.max(360, avail - rollY);
  return {
    browser: {x:0, y:0, w:L - 6, h:rollY + rollH, open:true},
    playlist:{x:L, y:0, w:R, h:plH, open:true},
    rack:    {x:L, y:plH + 6, w:Math.round(R * 0.56) - 3, h:midH, open:true},
    mixer:   {x:L + Math.round(R * 0.56) + 3, y:plH + 6, w:R - Math.round(R * 0.56) - 3, h:midH, open:true},
    roll:    {x:L, y:rollY, w:R, h:rollH, open:true}
  };
}
function saveLayout() { lsSet(LAYOUT_KEY, JSON.stringify(layout)); }
function applyLayout() {
  let bottom = 0;
  for (const n of WINS) {
    const el = winEl(n), L = layout[n]; el.hidden = !L.open;
    if (!stacked()) { el.style.left = L.x + 'px'; el.style.top = L.y + 'px'; el.style.width = L.w + 'px'; el.style.height = L.h + 'px'; }
    else { el.style.left = el.style.top = el.style.width = ''; if (n !== 'roll' && n !== 'playlist' && n !== 'browser') el.style.height = ''; }
    if (L.open) bottom = Math.max(bottom, L.y + L.h);
    document.querySelectorAll(`[data-win-toggle="${n}"]`).forEach(b => b.setAttribute('aria-pressed', L.open));
  }
  ws.style.minHeight = stacked() ? '' : (bottom + 10) + 'px';
}
function redrawWin(n) {
  if (n === 'roll') drawAll();
  else if (n === 'playlist') drawPlaylist();
}
function frontWin(n) { const el = winEl(n); el.style.zIndex = ++zTop; document.querySelectorAll('.win.front').forEach(w => w.classList.remove('front')); el.classList.add('front'); }
function openWin(n) { layout[n].open = true; applyLayout(); frontWin(n); saveLayout(); requestAnimationFrame(() => redrawWin(n)); }
function closeWin(n) { layout[n].open = false; applyLayout(); saveLayout(); }
function toggleWin(n) { if (winOpen(n) && winEl(n).classList.contains('front')) closeWin(n); else { openWin(n); announce(WIN_NAME[n] + ' 창을 열었어요.'); } }
function initWindows() {
  const def = defaultLayout(); let saved = null; try { saved = JSON.parse(lsGet(LAYOUT_KEY) || 'null'); } catch (e) {}
  layout = {}; for (const n of WINS) layout[n] = {...def[n], ...((saved && saved[n]) || {})};
  applyLayout(); frontWin('roll');
  for (const n of WINS) {
    const el = winEl(n), head = el.querySelector('.wh');
    el.addEventListener('pointerdown', () => frontWin(n), true);
    head.addEventListener('pointerdown', e => {
      if (stacked() || e.button !== 0 || e.target.closest('button,select,input,label,.grp,.copy,.zoom')) return;
      e.preventDefault(); const L = layout[n], sx = e.clientX, sy = e.clientY, ox = L.x, oy = L.y;
      const mv = ev => { L.x = clamp(ox + ev.clientX - sx, -L.w + 80, ws.clientWidth - 80); L.y = Math.max(0, oy + ev.clientY - sy); el.style.left = L.x + 'px'; el.style.top = L.y + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); applyLayout(); saveLayout(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    // 크기 조절(오른쪽 아래 모서리)이 끝나면 저장하고 다시 그림
    let rt = 0;
    new ResizeObserver(() => {
      if (el.hidden) return;
      if (!stacked()) { const L = layout[n]; L.w = el.offsetWidth; L.h = el.offsetHeight; }
      clearTimeout(rt); rt = setTimeout(() => { if (!stacked()) { applyLayout(); saveLayout(); } redrawWin(n); }, 60);
    }).observe(el);
  }
  document.querySelectorAll('[data-win-toggle]').forEach(b => b.onclick = () => toggleWin(b.dataset.winToggle));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeWin(b.dataset.close));
  $('layoutReset').onclick = () => { layout = defaultLayout(); applyLayout(); saveLayout(); drawAll(); drawPlaylist(); status('창 배치를 처음처럼 되돌렸어요.'); };
  window.matchMedia('(max-width:760px)').addEventListener('change', () => { applyLayout(); drawAll(); drawPlaylist(); });
}
