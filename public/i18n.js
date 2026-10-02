/* 36-i18n.js — 언어 (한국어 · English)
   고른 언어를 기억하고, 없으면 브라우저 언어를 본다.
   화면 글자는 data-i18n 표시가 붙은 곳을 바꾸고, 코드 안 문구는 t() 로 꺼낸다. */
const I18N_LANGS = {ko:'한국어', en:'English'};
let LANG = 'ko';

function pickLang() {
  try { const v = localStorage.getItem('msk.lang'); if (I18N_LANGS[v]) return v; } catch (e) {}
  const n = (navigator.languages || [navigator.language || 'en']).map(x => String(x).toLowerCase());
  for (const x of n) { if (x.startsWith('ko')) return 'ko'; if (x.startsWith('en')) return 'en'; }
  return 'en';                                   // 한국어도 영어도 아니면 영어가 더 널리 통함
}
// 글자 하나 꺼내기. 없으면 한국어 원문을 그대로 (번역이 덜 돼도 앱이 멀쩡하게)
function t(key, vars) {
  const tb = (window.I18N && window.I18N[LANG]) || {};
  let s = tb[key];
  if (s == null) s = ((window.I18N && window.I18N.ko) || {})[key];
  if (s == null) s = key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
// 화면 전체 바꿔치기
function applyLang() {
  document.documentElement.lang = LANG;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const v = t(el.dataset.i18n);
    if (el.dataset.i18nAttr) el.setAttribute(el.dataset.i18nAttr, v);
    else el.textContent = v;
  }
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  const b = document.getElementById('langBtn');
  if (b) { b.textContent = LANG === 'ko' ? 'EN' : '한국어'; b.title = LANG === 'ko' ? 'Switch to English' : '한국어로 바꾸기'; }
  document.dispatchEvent(new CustomEvent('langchange', {detail:{lang:LANG}}));
  if (typeof refreshAll === 'function' && typeof S !== 'undefined' && S) try { refreshAll(); } catch (e) {}   // 코드가 만드는 이름도 다시 그리기
}
function setLang(v) {
  if (!I18N_LANGS[v]) return false;
  LANG = v;
  try { localStorage.setItem('msk.lang', v); } catch (e) {}
  applyLang();
  return true;
}
const toggleLang = () => setLang(LANG === 'ko' ? 'en' : 'ko');

/* 알림 문구 번역 — 코드를 거의 안 건드리고 출력할 때 바꾼다.
   통째로 맞으면 그대로, 아니면 "…했어요"처럼 섞인 문장을 조각으로 나눠 아는 것만 바꾼다. */
function tMsg(s) {
  if (LANG === 'ko' || typeof s !== 'string' || !/[가-힣]/.test(s)) return s;
  const tb = (window.I18N && window.I18N.en) || {};
  if (tb[s]) return tb[s];
  // 숫자·따옴표 안 이름이 섞인 문장: 그 부분을 자리표시로 바꿔 맞춰 본다
  // 코드의 `"${name}"` 같은 자리는 번역표에 따옴표가 남아 있으므로, 두 가지 모양으로 찾아본다
  const makers = [
    str => str.replace(/(?<=")[^"]*(?=")/g, '\u0000').replace(/(?<=“)[^“”]*(?=”)/g, '\u0000').replace(/\d+(?:\.\d+)?/g, '\u0000'),
    str => str.replace(/"[^"]*"|[“”][^“”]*[“”]|\d+(?:\.\d+)?/g, '\u0000'),
  ];
  const grabbers = [
    str => (str.match(/(?<=")[^"]*(?=")|(?<=“)[^“”]*(?=”)|\d+(?:\.\d+)?/g) || []),
    str => (str.match(/"[^"]*"|[“”][^“”]*[“”]|\d+(?:\.\d+)?/g) || []),
  ];
  for (let i = 0; i < makers.length; i++) {
    const shape = makers[i](s), got = grabbers[i](s);
    if (tb[shape]) { let j = 0; return tb[shape].replace(/\u0000/g, () => got[j++] ?? ''); }
  }
  // 끝내 모르면 한국어 그대로 (영어 사용자에겐 아쉽지만 앱은 멀쩡히 돌아감)
  return s;
}


(() => {
  LANG = pickLang();
  const go = () => { applyLang(); const b = document.getElementById('langBtn'); if (b) b.onclick = toggleLang; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, {once:true});
  else go();
})();
