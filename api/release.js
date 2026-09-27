// 최신 앱 정보 — GitHub API(로그인 없이 IP당 시간 60번 한도) 대신, 한도 없는 릴리스 파일 latest.yml을 읽어요.
// 결과는 Vercel 캐시에 10분 저장 → 방문자가 많아도 GitHub에는 10분에 한 번쯤만 요청
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://github.com/RefractaSpace/melody-sketchpad/releases/latest/download/latest.yml', {redirect:'follow'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const y = await r.text(), get = k => (y.match(new RegExp('^' + k + ':\\s*\'?([^\'\\n]+)', 'm')) || [])[1];
    const size = +((y.match(/size:\s*(\d+)/) || [])[1] || 0);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({version:get('version'), size, date:get('releaseDate'), url:'https://github.com/RefractaSpace/melody-sketchpad/releases/latest/download/MelodySketchpad-Setup.exe', notes:'https://github.com/RefractaSpace/melody-sketchpad/releases/tag/v' + get('version')});
  } catch (e) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(502).json({error:'release', message:String(e.message || e).slice(0, 120)}); }
}
