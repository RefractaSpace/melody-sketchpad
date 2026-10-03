// 최신 앱 정보 — GitHub API(로그인 없이 IP당 시간 60번 한도) 대신, 한도 없는 릴리스 파일 latest.yml을 읽어요.
// 결과는 Vercel 캐시에 10분 저장 → 방문자가 많아도 GitHub에는 10분에 한 번쯤만 요청
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if ((req.query || {}).list) return list(req, res);     // 이전 버전 목록
  try {
    const r = await fetch('https://github.com/RefractaSpace/melody-sketchpad/releases/latest/download/latest.yml', {redirect:'follow'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const y = await r.text(), get = k => (y.match(new RegExp('^' + k + ':\\s*\'?([^\'\\n]+)', 'm')) || [])[1];
    const size = +((y.match(/size:\s*(\d+)/) || [])[1] || 0);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({version:get('version'), size, date:get('releaseDate'), url:'https://github.com/RefractaSpace/melody-sketchpad/releases/latest/download/MelodySketchpad-Setup.exe', notes:'https://github.com/RefractaSpace/melody-sketchpad/releases/tag/v' + get('version')});
  } catch (e) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(502).json({error:'release', message:String(e.message || e).slice(0, 120)}); }
}

/* 이전 버전 목록 — /api/release?list=1
   GitHub API는 로그인 없이 시간당 60번뿐이라(여러 사람이 같은 IP를 쓰면 금방 넘침)
   태그를 여기 적어 두고 주소는 규칙으로 만든다. 새 버전을 내면 맨 앞에 한 줄 추가. */
const TAGS = [
  {tag:'v5.2.0', at:'2026-09-27', win:'MelodySketchpad-Setup.exe',       mb:115},
  {tag:'v5.1.0', at:'2026-09-27', win:'MelodySketchpad-Setup-5.1.0.exe', mb:115},
  {tag:'v5.0.0', at:'2026-09-27', zip:'MelodySketchpad-win32-x64.zip',   mb:158},
];
const dl = (tag, file) => `https://github.com/RefractaSpace/melody-sketchpad/releases/download/${tag}/${file}`;

export async function list(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  const keep = Math.min(5, Math.max(1, +(req.query || {}).keep || 3));
  return res.status(200).json({releases: TAGS.slice(0, keep).map(v => ({
    tag:v.tag, at:v.at,
    win: v.win && {name:v.win, url:dl(v.tag, v.win), mb:v.mb},
    zip: v.zip && {name:v.zip, url:dl(v.tag, v.zip), mb:v.mb},
    mac: v.mac && {name:v.mac, url:dl(v.tag, v.mac), mb:v.mb},
  }))});
}
