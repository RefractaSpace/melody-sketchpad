// 6: 구입 — 주문을 만들고, 결제가 진짜인지 서버가 대행사에 직접 물어본 뒤 등급을 준다.
//   GET  /api/checkout?action=plans            살 수 있는 등급·가격
//   POST /api/checkout?action=start  {tier}    주문 만들기 → {orderId, amount}
//   POST /api/checkout?action=finish {orderId, provider_id}   확인 후 등급 부여
//   GET  /api/checkout?action=orders           내 결제 기록
import { cors, readToken } from './_lib.js';
import { hasDB, q, ensureDB } from './_db.js';
import { TIERS, PROVIDER, payReady, verify } from './_pay.js';
import crypto from 'crypto';

const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const body = req => { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } return (b && typeof b === 'object') ? b : {}; };
const newOrderId = () => 'ord_' + crypto.randomBytes(12).toString('hex');

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const action = String((req.query && req.query.action) || '');

  if (action === 'plans') {                                  // 로그인 없이도 볼 수 있음
    return send(res, 200, {plans:Object.entries(TIERS).map(([tier, t]) => ({tier, ...t})), ready:payReady(), provider:PROVIDER});
  }
  const user = who(req);
  if (!user) return send(res, 401, {error:'auth', message:'로그인이 필요해요'});
  if (!hasDB()) return send(res, 503, {error:'db-off', message:'서버 준비 중이에요'});
  await ensureDB();

  try {
    if (action === 'orders') {
      const rows = await q(`select id, tier, amount, currency, provider, status, created, paid, refunded
                            from payments where username = $1 order by created desc limit 50`, [user]);
      return send(res, 200, {orders:rows});
    }
    if (req.method !== 'POST') return send(res, 405, {error:'method'});

    if (action === 'start') {
      const tier = String(body(req).tier || '');
      const plan = TIERS[tier];
      if (!plan) return send(res, 400, {error:'bad-tier', message:'살 수 없는 등급이에요'});
      // 이미 같거나 더 높은 등급이면 막는다
      const RANK = {se:0, six:1, pro:2, max:3};
      const cur = (await q('select tier, expires from licenses where username = $1', [user]))[0];
      const curTier = cur && (!cur.expires || new Date(cur.expires) > new Date()) ? cur.tier : 'se';
      if (RANK[curTier] >= RANK[tier]) return send(res, 409, {error:'already', message:`이미 ${curTier} 등급이에요`, tier:curTier});
      const id = newOrderId();
      await q(`insert into payments (id, username, tier, amount, currency, provider, status)
               values ($1, $2, $3, $4, 'KRW', $5, 'pending')`, [id, user, tier, plan.amount, PROVIDER]);
      return send(res, 200, {orderId:id, tier, amount:plan.amount, currency:'KRW', provider:PROVIDER, ready:payReady()});
    }

    if (action === 'finish') {
      const b = body(req);
      const orderId = String(b.orderId || ''), providerId = String(b.provider_id || '');
      if (!orderId || !providerId) return send(res, 400, {error:'bad-request'});
      const row = (await q('select * from payments where id = $1 and username = $2', [orderId, user]))[0];
      if (!row) return send(res, 404, {error:'no-order', message:'주문을 찾을 수 없어요'});
      if (row.status === 'paid') return send(res, 200, {ok:true, already:true, tier:row.tier});
      if (row.status !== 'pending') return send(res, 409, {error:'bad-status', status:row.status});

      // 핵심: 브라우저 말이 아니라 대행사에 직접 물어본다. 금액도 확인한다.
      const v = await verify({provider_id:providerId, orderId, expectAmount:row.amount});
      if (!v.ok) {
        await q(`update payments set status = 'failed', provider_id = $2, raw = $3 where id = $1`,
                [orderId, providerId, JSON.stringify({reason:v.reason, paid:v.paid ?? null}).slice(0, 2000)]);
        return send(res, 402, {error:'not-verified', reason:v.reason, message:'결제를 확인하지 못했어요'});
      }
      // 확인됨 → 기록과 등급을 한 번에 (둘 중 하나만 되는 일이 없게)
      await q(`update payments set status = 'paid', paid = now(), provider_id = $2, raw = $3 where id = $1`,
              [orderId, providerId, JSON.stringify(v.raw || {}).slice(0, 4000)]);
      await q(`insert into licenses (username, tier, source, order_id)
               values ($1, $2, 'purchase', $3)
               on conflict (username) do update set tier = excluded.tier, source = 'purchase',
                 order_id = excluded.order_id, started = now(), expires = null`,
              [user, row.tier, orderId]);
      return send(res, 200, {ok:true, tier:row.tier, amount:row.amount, orderId});
    }
    return send(res, 400, {error:'bad-action'});
  } catch (e) {
    return send(res, 500, {error:'server', message:String(e && e.message || e).slice(0, 200)});
  }
}
