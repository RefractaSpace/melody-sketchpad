/* 35-tier.js — 6: 등급별 악기
   SE(무료) 합성 12개 · 6 +표준 128개 · Pro +오케스트라 실제 녹음 15종 · Max +그랜드 피아노 Max
   지금은 브라우저에 저장된 값으로 확인해요 (개발용). 판매를 시작하면 서버에서 확인하도록 바꿔야 해요. */
// 출시(결제 시작) 전까지 표준 악기 128개를 무료로 열어 둔다. 결제가 열리면 false로.
const FREE_GM = true;
const TIERS = ['se', 'six', 'pro', 'max'];
const TIER_NAME = {se:'SE', six:'스케치패드 6', pro:'6 Pro', max:'6 Max'};
const TIER_RANK = {se:0, six:1, pro:2, max:3};

// 악기 → 필요한 등급 (없으면 SE)
function instTier(inst) {
  if (inst === 'pianoMax') return 'max';
  if (inst === 'pianoPro') return 'pro';
  if (/^gm\d+$/.test(inst)) return FREE_GM ? 'se' : 'six';   // 출시 전에는 표준 악기 128개도 무료
  if (['violin','viola','cello','contrabass','flute','clarinet','oboe','bassoon',
       'trumpet','horn','trombone','tuba','marimba','glock','xylo'].includes(inst)) return 'pro';
  return 'se';                                  // 기존 합성 악기·드럼·드럼 키트
}
let serverTier = null;                            // 서버가 알려 준 등급 (이게 있으면 이걸 씀)
function myTier() {
  if (serverTier) return serverTier;
  try { const t = localStorage.getItem('msk.tier'); if (TIERS.includes(t)) return t; } catch (e) {}
  return 'se';
}
// 서버에 내 등급을 물어본다 (로그인했고 DB가 켜져 있을 때만 값이 옴)
async function fetchTier() {
  try {
    const a = typeof authInfo === 'function' ? authInfo() : null;
    const tok = a && a.token;
    if (!tok) return null;                        // 로그인 안 했으면 물어볼 것도 없음
    const r = await fetch((window.MSK_SERVER || '') + '/api/license', {headers:{authorization:'Bearer ' + tok}});
    if (!r.ok) return null;
    const j = await r.json();
    if (j && TIERS.includes(j.tier) && j.signedIn && !j.note) { serverTier = j.tier; applyTier(); return j.tier; }
  } catch (e) {}
  return null;
}
function setTier(t) {
  if (!TIERS.includes(t)) return false;
  if (serverTier) { status(`등급은 서버에서 정해져요 (지금 ${TIER_NAME[serverTier]})`); return false; }   // 서버가 정한 뒤에는 못 바꿈
  try { localStorage.setItem('msk.tier', t); } catch (e) {}
  applyTier(); status(`${TIER_NAME[t]} 등급으로 바꿨어요 · 악기 ${countUnlocked()}개 (개발용)`);
  return true;
}
const canUse = inst => TIER_RANK[instTier(inst)] <= TIER_RANK[myTier()];
const countUnlocked = () => Object.keys(INSTS).filter(canUse).length;

// 채널 추가 목록에서 잠긴 악기를 숨긴다 (분류가 통째로 비면 분류도 숨김)
function applyTier() {
  const sel = $('chAdd'); if (!sel) return;
  for (const o of sel.querySelectorAll('option[value^="synth:"]')) {
    const inst = o.value.slice(6);
    o.hidden = !canUse(inst);
  }
  for (const g of sel.querySelectorAll('optgroup')) {
    g.hidden = ![...g.querySelectorAll('option')].some(o => !o.hidden);
  }
}
// 잠긴 악기를 쓰는 곡을 불러올 때: 소리는 가장 가까운 열린 악기로 대신 (곡은 그대로 보존)
const TIER_FALLBACK = {violin:'strings', viola:'strings', cello:'strings', contrabass:'bass',
  flute:'synth', clarinet:'synth', oboe:'synth', bassoon:'bass',
  trumpet:'supersaw', horn:'supersaw', trombone:'supersaw', tuba:'bass',
  marimba:'celesta', glock:'bell', xylo:'bell', pianoPro:'piano', pianoMax:'piano'};
function playInst(inst) {                         // 소리 낼 때 쓸 실제 악기
  if (canUse(inst)) return inst;
  if (TIER_FALLBACK[inst]) return TIER_FALLBACK[inst];
  if (/^gm\d+$/.test(inst)) return 'piano';
  return 'piano';
}
// 곡을 불러온 뒤 잠긴 악기가 있으면 한 번 알려 줌
function tierNotice() {
  if (!S || !S.channels) return;
  const locked = [...new Set(S.channels.filter(c => c.kind === 'synth' && !canUse(c.inst)).map(c => c.inst))];
  if (!locked.length) return;
  const need = locked.map(instTier).sort((a, b) => TIER_RANK[b] - TIER_RANK[a])[0];
  status(`이 곡의 악기 ${locked.length}종은 ${TIER_NAME[need]}부터 쓸 수 있어요 · 지금은 비슷한 소리로 들려요`);
}

/* 첫 실행 때와 곡을 불러온 뒤 */
(() => {
  const go = async () => { applyTier(); await fetchTier(); applyTier(); tierNotice(); };   // 서버 등급을 받은 뒤 목록을 그림
  if (document.readyState === 'complete') setTimeout(go, 300);
  else window.addEventListener('load', () => setTimeout(go, 300), {once:true});
})();
