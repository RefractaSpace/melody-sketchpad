/* 31-ui6.js — 6 화면: 아래 줄의 파일 메뉴 (열기·닫기, 바깥 누르기·Esc, 위아래 화살표) */
(() => {
  const btn = $('fileMenuBtn'), pop = $('fileMenu');
  const items = () => [...pop.querySelectorAll('button, a')].filter(e => !e.hidden);
  const open = focus => { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); if (focus) (items()[0] || pop).focus(); };
  const close = back => { if (pop.hidden) return; pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (back) btn.focus(); };
  btn.addEventListener('click', () => pop.hidden ? open(false) : close(false));
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); open(true); } });
  pop.addEventListener('click', e => { if (e.target.closest('button, a')) setTimeout(() => close(false), 0); });   // 항목의 원래 동작이 먼저 실행된 뒤 닫힘
  pop.addEventListener('keydown', e => { const l = items(), i = l.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); l[(i + 1) % l.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); l[(i - 1 + l.length) % l.length].focus(); } });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !e.target.closest('.fm')) close(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); close(true); } }, true);   // 버튼에 초점이 있어도 Esc로 닫힘
  items().forEach(e => e.setAttribute('role', 'menuitem'));
})();

/* 소리 출처 · 라이선스 (CC-BY 표기 의무) */
(() => {
  const btn = $('creditBtn'), dlg = $('creditDlg');
  if (!btn || !dlg) return;
  btn.addEventListener('click', () => dlg.showModal());
  $('creditClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
