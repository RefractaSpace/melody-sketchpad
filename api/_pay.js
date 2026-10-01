// 6: 결제 대행사 연결 자리.
// 대행사(포트원·토스페이먼츠 등)마다 다른 부분만 여기 모은다.
// 지금은 시험용 가짜(mock)이고, 보호자 명의로 대행사에 가입해 열쇠를 받으면 real 쪽만 채우면 된다.

export const TIERS = {
  six: {name:'스케치패드 6',  amount:49000},
  pro: {name:'스케치패드 6 Pro', amount:89000},
  max: {name:'스케치패드 6 Max', amount:119000},
};
export const PROVIDER = process.env.PAY_PROVIDER || 'mock';   // mock | portone | toss
export const payReady = () => PROVIDER !== 'mock' && !!(process.env.PAY_SECRET);

// 대행사에 "이 주문 진짜로 결제됐나?"를 직접 물어본다.
// 브라우저가 보낸 말은 절대 믿지 않는다. 금액까지 서버가 확인한다.
export async function verify({provider_id, orderId, expectAmount}) {
  if (PROVIDER === 'mock') {
    // 시험용: provider_id가 'ok_<금액>' 이면 성공으로 친다
    const m = /^ok_(\d+)$/.exec(String(provider_id || ''));
    if (!m) return {ok:false, reason:'not-paid'};
    const paid = Number(m[1]);
    if (paid !== expectAmount) return {ok:false, reason:'amount', paid};
    return {ok:true, paid, currency:'KRW', raw:{mock:true, orderId}};
  }
  if (PROVIDER === 'portone') {
    // 포트원: 결제 건을 조회해 status와 금액을 확인
    const r = await fetch(`https://api.portone.io/payments/${encodeURIComponent(provider_id)}`,
      {headers:{authorization:`PortOne ${process.env.PAY_SECRET}`}});
    if (!r.ok) return {ok:false, reason:'lookup-failed'};
    const j = await r.json();
    const paid = Number(j?.amount?.total ?? NaN);
    if (j?.status !== 'PAID') return {ok:false, reason:'not-paid', status:j?.status};
    if (paid !== expectAmount) return {ok:false, reason:'amount', paid};
    if (j?.id && orderId && j.id !== orderId && j?.merchantId !== orderId) { /* 주문번호 확인은 대행사 설정에 따라 */ }
    return {ok:true, paid, currency:j?.amount?.currency || 'KRW', raw:j};
  }
  if (PROVIDER === 'toss') {
    // 토스페이먼츠: 결제 승인 후 조회로 금액 확인
    const auth = Buffer.from(process.env.PAY_SECRET + ':').toString('base64');
    const r = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(provider_id)}`,
      {headers:{authorization:`Basic ${auth}`}});
    if (!r.ok) return {ok:false, reason:'lookup-failed'};
    const j = await r.json();
    const paid = Number(j?.totalAmount ?? NaN);
    if (j?.status !== 'DONE') return {ok:false, reason:'not-paid', status:j?.status};
    if (paid !== expectAmount) return {ok:false, reason:'amount', paid};
    if (orderId && j?.orderId !== orderId) return {ok:false, reason:'order-mismatch'};
    return {ok:true, paid, currency:j?.currency || 'KRW', raw:j};
  }
  return {ok:false, reason:'no-provider'};
}
