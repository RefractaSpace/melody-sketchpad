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
}
function setLang(v) {
  if (!I18N_LANGS[v]) return false;
  LANG = v;
  try { localStorage.setItem('msk.lang', v); } catch (e) {}
  applyLang();
  return true;
}
const toggleLang = () => setLang(LANG === 'ko' ? 'en' : 'ko');

(() => {
  LANG = pickLang();
  const go = () => { applyLang(); const b = document.getElementById('langBtn'); if (b) b.onclick = toggleLang; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, {once:true});
  else go();
})();
