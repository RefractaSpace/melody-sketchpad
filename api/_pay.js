// 6: 결제 방식.
// 기본은 계좌이체(bank): 주문하면 입금 코드를 주고, 관리자가 통장에서 입금을 확인한 뒤 직접 등급을 넣는다.
//   → 서버가 '자동으로' 결제 완료를 판단하는 길이 없으므로 가짜 결제로 등급을 받을 수 없다.
// 대행사(포트원·토스페이먼츠)를 나중에 붙이면 PAY_PROVIDER와 PAY_SECRET만 넣으면 된다.
// 예전 시험용 가짜 결제(mock: 'ok_금액'이면 성공)는 실제 서버에서 아무나 등급을 받을 수 있어서 지웠다.

export const TIERS = {
  six: {name:'스케치패드 6',  amount:49000},
  pro: {name:'스케치패드 6 Pro', amount:89000},
  max: {name:'스케치패드 6 Max', amount:119000},
};
export const PROVIDER = ['portone', 'toss'].includes(process.env.PAY_PROVIDER) ? process.env.PAY_PROVIDER : 'bank';   // bank | portone | toss
// 판매를 열었는지: SALES_OPEN=1 일 때만 주문을 받는다 (요청할 때마다 읽어서 바꾸면 바로 반영)
export const salesOpen = () => process.env.SALES_OPEN === '1';
// 계좌 정보는 코드에 적지 않고 Vercel 환경 변수 BANK_ACCOUNT에 둔다 (예: "OO은행 123-456-789 예금주")
export const bankInfo = () => String(process.env.BANK_ACCOUNT || '').slice(0, 120);
export const payReady = () => salesOpen() && (PROVIDER === 'bank' ? !!bankInfo() : !!process.env.PAY_SECRET);

// 대행사에 "이 주문 진짜로 결제됐나?"를 직접 물어본다.
// 브라우저가 보낸 말은 절대 믿지 않는다. 금액까지 서버가 확인한다.
export async function verify({provider_id, orderId, expectAmount}) {
  if (PROVIDER === 'bank') return {ok:false, reason:'manual'};   // 계좌이체는 관리자가 손으로 확인
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
