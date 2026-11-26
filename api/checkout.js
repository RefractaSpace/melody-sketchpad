// 6: 구입 — 기본은 계좌이체. 주문하면 입금 코드를 주고, 관리자가 통장에서 입금을 확인한 뒤 등급을 넣는다.
//   GET  /api/checkout?action=plans              살 수 있는 등급·가격 · 판매 중인지 (로그인 없이)
//   POST /api/checkout?action=start   {tier}     주문 만들기 → {orderId, amount, code, bank}  (SALES_OPEN=1 일 때만)
//   GET  /api/checkout?action=orders             내 주문 기록
//   POST /api/checkout?action=finish  {orderId, provider_id}   대행사 결제 확인 (계좌이체에서는 막힘)
//   ── 관리자만 ──
//   GET  /api/checkout?action=pending            입금 기다리는 주문 전체
//   POST /api/checkout?action=confirm {orderId, note}   입금 확인 → 등급 넣기
//   POST /api/checkout?action=reject  {orderId, note}   주문 취소 (입금 안 됨·금액 다름)
import { cors, readToken, isAdmin } from './_lib.js';
import { hasDB, q, ensureDB } from './_db.js';
import { TIERS, PROVIDER, payReady, salesOpen, bankInfo, verify } from './_pay.js';
import crypto from 'crypto';

const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const body = req => { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } return (b && typeof b === 'object') ? b : {}; };
const newOrderId = () => 'ord_' + crypto.randomBytes(12).toString('hex');
// 입금자 이름 칸에 적을 코드: MS + 헷갈리는 글자(0·O·1·I) 뺀 4글자 → 은행 앱 입금자명 칸에 들어가는 길이
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'MS' + [...crypto.randomBytes(4)].map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
const RANK = {se:0, six:1, pro:2, max:3};

// 등급 넣기 + 주문을 '입금 확인됨'으로 (둘 중 하나만 되는 일이 없게 한 번에)
async function grant(row, how, note) {
  await q(`update payments set status = 'paid', paid = now(), raw = $2 where id = $1 and status = 'pending'`,
          [row.id, JSON.stringify({how, note:String(note || '').slice(0, 200)})]);
  await q(`insert into licenses (username, tier, source, order_id)
           values ($1, $2, 'purchase', $3)
           on conflict (username) do update set tier = excluded.tier, source = 'purchase',
             order_id = excluded.order_id, started = now(), expires = null`,
          [row.username, row.tier, row.id]);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const action = String((req.query && req.query.action) || '');

  if (action === 'plans') {                                  // 로그인 없이도 볼 수 있음
    return send(res, 200, {plans:Object.entries(TIERS).map(([tier, t]) => ({tier, ...t})), open:salesOpen(), ready:payReady(), provider:PROVIDER});
  }
  const user = who(req);
  if (!user) return send(res, 401, {error:'auth', message:'로그인이 필요해요'});
  if (!hasDB()) return send(res, 503, {error:'db-off', message:'서버 준비 중이에요'});
  await ensureDB();
  const admin = isAdmin(user);

  try {
    if (action === 'orders') {
      const rows = await q(`select id, tier, amount, currency, provider, provider_id as code, status, created, paid, refunded
                            from payments where username = $1 order by created desc limit 50`, [user]);
      return send(res, 200, {orders:rows, bank:PROVIDER === 'bank' ? bankInfo() : ''});
    }
    if (action === 'pending') {
      if (!admin) return send(res, 403, {error:'forbidden', message:'관리자만 볼 수 있어요'});
      const rows = await q(`select id, username, tier, amount, provider_id as code, created
                            from payments where status = 'pending' order by created limit 200`);
      return send(res, 200, {pending:rows});
    }
    if (req.method !== 'POST') return send(res, 405, {error:'method'});

    if (action === 'start') {
      // 판매를 열기 전에는 주문 자체를 받지 않는다
      if (!payReady()) return send(res, 503, {error:'not-open', message:'아직 판매하지 않아요'});
      const tier = String(body(req).tier || '');
      const plan = TIERS[tier];
      if (!plan) return send(res, 400, {error:'bad-tier', message:'살 수 없는 등급이에요'});
      // 이미 같거나 더 높은 등급이면 막는다
      const cur = (await q('select tier, expires from licenses where username = $1', [user]))[0];
      const curTier = cur && (!cur.expires || new Date(cur.expires) > new Date()) ? cur.tier : 'se';
      if (RANK[curTier] >= RANK[tier]) return send(res, 409, {error:'already', message:`이미 ${curTier} 등급이에요`, tier:curTier});
      // 입금 기다리는 주문이 너무 많으면 막는다 (주문 도배 방지)
      const [{n}] = await q(`select count(*)::int as n from payments where username = $1 and status = 'pending'`, [user]);
      if (n >= 3) return send(res, 429, {error:'too-many', message:'입금을 기다리는 주문이 이미 3개 있어요'});
      // 입금 코드: 다른 '입금 대기' 주문과 겹치지 않게
      let code = newCode();
      for (let i = 0; i < 5 && (await q(`select 1 from payments where provider_id = $1 and status = 'pending'`, [code])).length; i++) code = newCode();
      const id = newOrderId();
      await q(`insert into payments (id, username, tier, amount, currency, provider, provider_id, status)
               values ($1, $2, $3, $4, 'KRW', $5, $6, 'pending')`, [id, user, tier, plan.amount, PROVIDER, PROVIDER === 'bank' ? code : null]);
      return send(res, 200, {orderId:id, tier, amount:plan.amount, currency:'KRW', provider:PROVIDER,
        ...(PROVIDER === 'bank' ? {code, bank:bankInfo(), message:`${plan.amount.toLocaleString('ko-KR')}원을 입금자 이름 '${code}'로 보내 주세요. 확인되면 등급이 들어가요.`} : {})});
    }

    if (action === 'finish') {
      // 계좌이체는 사용자가 '완료'를 알릴 수 없다 — 관리자 확인만 등급을 넣는다
      if (PROVIDER === 'bank') return send(res, 403, {error:'manual', message:'계좌이체는 입금이 확인되면 등급이 들어가요'});
      const b = body(req);
      const orderId = String(b.orderId || ''), providerId = String(b.provider_id || '');
      if (!orderId || !providerId) return send(res, 400, {error:'bad-request'});
      const row = (await q('select * from payments where id = $1 and username = $2', [orderId, user]))[0];
      if (!row) return send(res, 404, {error:'no-order', message:'주문을 찾을 수 없어요'});
      if (row.status === 'paid') return send(res, 200, {ok:true, already:true, tier:row.tier});
      if (row.status !== 'pending') return send(res, 409, {error:'bad-status', status:row.status});
      // 브라우저 말이 아니라 대행사에 직접 물어본다. 금액도 확인한다.
      const v = await verify({provider_id:providerId, orderId, expectAmount:row.amount});
      if (!v.ok) {
        await q(`update payments set status = 'failed', provider_id = $2, raw = $3 where id = $1`,
                [orderId, providerId, JSON.stringify({reason:v.reason, paid:v.paid ?? null}).slice(0, 2000)]);
        return send(res, 402, {error:'not-verified', reason:v.reason, message:'결제를 확인하지 못했어요'});
      }
      await q(`update payments set provider_id = $2 where id = $1`, [orderId, providerId]);
      await grant(row, PROVIDER, JSON.stringify(v.raw || {}).slice(0, 180));
      return send(res, 200, {ok:true, tier:row.tier, amount:row.amount, orderId});
    }

    if (action === 'confirm' || action === 'reject') {
      if (!admin) return send(res, 403, {error:'forbidden', message:'관리자만 할 수 있어요'});
      const b = body(req), orderId = String(b.orderId || '');
      const row = (await q('select * from payments where id = $1', [orderId]))[0];
      if (!row) return send(res, 404, {error:'no-order', message:'주문을 찾을 수 없어요'});
      if (row.status === 'paid') return send(res, 200, {ok:true, already:true, tier:row.tier, username:row.username});
      if (row.status !== 'pending') return send(res, 409, {error:'bad-status', status:row.status});
      if (action === 'reject') {
        await q(`update payments set status = 'cancelled', raw = $2 where id = $1`, [orderId, JSON.stringify({how:'admin-reject', by:user, note:String(b.note || '').slice(0, 200)})]);
        return send(res, 200, {ok:true, status:'cancelled'});
      }
      await grant(row, 'bank-manual', `by ${user}: ${b.note || ''}`);
      return send(res, 200, {ok:true, username:row.username, tier:row.tier, amount:row.amount});
    }
    return send(res, 400, {error:'bad-action'});
  } catch (e) {
    return send(res, 500, {error:'server', message:String(e && e.message || e).slice(0, 200)});
  }
}
