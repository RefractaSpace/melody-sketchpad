/* 24-desktop.js — 데스크톱 앱에서만: .msk 파일 두 번 클릭·파일 > 열기로 넘어온 곡 열기 (웹에서는 아무것도 안 함) */
if (window.mskDesktop) {
  window.mskDesktop.onOpenFile(async (name, bytes) => {
    try { const r = await loadAny(new File([bytes], name), name.replace(/\.[^.]+$/, '')); await openLoaded(r); status(L2(`${r.from} 파일 "${name}"을 열었어요.`, `Opened ${fmtL(r.from)} file "${name}".`)); }
    catch (e) { status(L2(`"${name}"을 열지 못했어요: `, `Couldn't open "${name}": `) + (e.message || L2('알 수 없는 형식', 'unknown format'))); }
  });
  window.mskDesktop.info().then(i => { document.title = `멜로디 스케치패드 ${i.version}`; }).catch(() => {});
}
