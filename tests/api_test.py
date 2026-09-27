"""서버 테스트 — 실제 서버(기본: 배포된 사이트)에 요청해서 로그인·곡 저장·커뮤니티·AI를 검사하고, 만든 계정과 글은 끝에 지웁니다.
   python3 tests/api_test.py [기본 주소]      예) python3 tests/api_test.py https://melody-sketchpad.vercel.app"""
import json, sys, time, urllib.request, urllib.error, pathlib
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://melody-sketchpad.vercel.app').rstrip('/') + '/api'
MSK = (pathlib.Path(__file__).parent.parent / 'songs' / 'Plum풍_1번_진행.msk').read_bytes()
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('  ✅ ' if ok else '  ❌ ') + name + (f'  — {detail}' if detail else ''))
def req(method, path, body=None, tok=None, raw=False, ctype='application/json'):
    data = body if raw else (json.dumps(body).encode() if body is not None else None)
    h = {'content-type': ctype if raw else 'application/json'}
    if tok: h['authorization'] = 'Bearer ' + tok
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: b = x.read(); return x.status, (json.loads(b) if b[:1] in (b'{', b'[') else b)
    except urllib.error.HTTPError as e:
        b = e.read(); return e.code, (json.loads(b) if b[:1] == b'{' else b)
stamp = str(int(time.time()))[-7:]; U1, U2, U3, PW = 'ta' + stamp, 'tb' + stamp, 'tc' + stamp, 'pass_word_123'
toks = {}
try:
    # 로그인
    c, j = req('POST', '/auth?action=signup', {'username': U1, 'password': PW}); toks[U1] = j.get('token'); check('회원가입', c == 200 and toks[U1])
    check('같은 아이디 가입 거절', req('POST', '/auth?action=signup', {'username': U1, 'password': PW})[0] == 409)
    check('짧은 비밀번호 거절', req('POST', '/auth?action=signup', {'username': 'zz' + stamp, 'password': '123'})[0] == 400)
    check('틀린 비밀번호 거절', req('POST', '/auth?action=login', {'username': U1, 'password': 'wrong_wrong'})[0] == 401)
    c, j = req('GET', '/auth?action=me', tok=toks[U1]); check('내 정보 (관리자 아님)', c == 200 and j['username'] == U1 and j['admin'] is False, json.dumps(j, ensure_ascii=False)[:90])
    check('위조 토큰 거절', req('GET', '/auth?action=me', tok=toks[U1][:-1] + ('x' if toks[U1][-1] != 'x' else 'y'))[0] == 401)
    c, j = req('POST', '/auth?action=password', {'old': PW, 'password': 'new_pass_456'}, tok=toks[U1]); check('비밀번호 바꾸기', c == 200); toks[U1] = j.get('token', toks[U1])
    check('옛 비밀번호 거절 · 새 비밀번호 로그인', req('POST', '/auth?action=login', {'username': U1, 'password': PW})[0] == 401 and req('POST', '/auth?action=login', {'username': U1, 'password': 'new_pass_456'})[0] == 200)
    for u in (U2, U3): toks[u] = req('POST', '/auth?action=signup', {'username': u, 'password': PW})[1]['token']
    # 곡 저장
    check('곡 id가 짧으면 거절 (4~40글자)', req('PUT', '/songs?id=t1&name=test', MSK, tok=toks[U1], raw=True, ctype='application/octet-stream')[0] == 400)
    c, j = req('PUT', '/songs?id=test01&name=test', MSK, tok=toks[U1], raw=True, ctype='application/octet-stream'); check('계정에 곡 올리기', c == 200)
    c, j = req('GET', '/songs', tok=toks[U1]); check('계정 곡 목록', c == 200 and len(j['songs']) == 1)
    c, j = req('GET', '/songs', tok=toks[U2]); check('다른 계정에는 안 보임', c == 200 and len(j['songs']) == 0)
    # 커뮤니티
    check('로그인 없이 게시 거절', req('POST', '/community?action=publish&title=x', MSK, raw=True, ctype='application/octet-stream')[0] == 401)
    check('MSK 아닌 파일 거절', req('POST', '/community?action=publish&title=x', b'hello', tok=toks[U1], raw=True, ctype='application/octet-stream')[0] == 400)
    c, j = req('POST', '/community?action=publish&title=%ED%85%8C%EC%8A%A4%ED%8A%B8&tags=test' + stamp, MSK, tok=toks[U1], raw=True, ctype='application/octet-stream'); pid = j['post']['id']; check('게시', c == 200)
    t = time.time(); c, j = req('GET', '/community?q=test' + stamp); dt = time.time() - t; check('목록·검색 (요약 파일)', c == 200 and [p['id'] for p in j['posts']] == [pid], f'{dt:.2f}초')
    c, j = req('POST', f'/community?action=like&id={pid}', tok=toks[U2]); check('좋아요', c == 200 and j['likes'] == 1 and j['liked'])
    c, j = req('POST', f'/community?action=comment&id={pid}', {'text': '좋아요'}, tok=toks[U2]); cid = j['comment']['id']; check('댓글', c == 200)
    check('남의 글 지우기 거절', req('DELETE', f'/community?id={pid}', tok=toks[U2])[0] == 403)
    check('내 글 신고 거절', req('POST', f'/community?action=report&id={pid}', {'reason': 'x'}, tok=toks[U1])[0] == 400)
    c1 = req('POST', f'/community?action=report&id={pid}', {'reason': '테스트'}, tok=toks[U2]); c2 = req('POST', f'/community?action=report&id={pid}', {'reason': '또'}, tok=toks[U2])
    check('신고 · 같은 사람 두 번 거절', c1[0] == 200 and c1[1]['reports'] == 1 and c2[0] == 409)
    check('관리자 아닌 사람의 숨기기·신고 목록 거절', req('POST', f'/community?action=hide&id={pid}', tok=toks[U2])[0] == 403 and req('GET', '/community?reported=1', tok=toks[U2])[0] == 403)
    c, j = req('POST', f'/community?action=report&id={pid}&comment={cid}', {'reason': 'x'}, tok=toks[U3]); check('댓글 신고', c == 200 and j['reports'] == 1)
    c, j = req('GET', f'/community?id={pid}'); check('글 상세 (좋아요·댓글 반영)', c == 200 and j['post']['likes'] == 1 and len(j['post']['comments']) == 1)
    check('곡 파일 받기', req('GET', f'/community?id={pid}&file=1')[1][:3] == b'MSK')
    # AI
    check('AI는 로그인 필요', req('POST', '/ai', {'task': 'feedback'})[0] == 401)
    c, j = req('POST', '/ai', {'task': 'feedback', 'song': {}}, tok=toks[U1]); check('AI 응답이 한국어 안내 (결제 전이면 안내, 아니면 결과)', c == 200 or ('결제 카드' in j.get('message', '')), str(j.get('message', 'OK'))[:60])
    # DB가 켜져 있으면: 동시 좋아요가 하나도 안 사라지는지 (파일 저장소 방식에서는 보장 안 됨)
    hc, hj = req('GET', '/auth?action=health')
    if hc == 200 and isinstance(hj, dict) and hj.get('db'):
        import concurrent.futures as cf
        lk = [req('POST', '/auth?action=signup', {'username': f'tl{i}{stamp}', 'password': PW})[1]['token'] for i in range(10)]
        for i, t in enumerate(lk): toks[f'tl{i}{stamp}'] = t
        with cf.ThreadPoolExecutor(10) as ex: list(ex.map(lambda t: req('POST', f'/community?action=like&id={pid}', tok=t), lk))
        n = req('GET', f'/community?id={pid}')[1]['post']['likes']
        check('DB: 10명 동시 좋아요 → 정확히 11개 (먼저 누른 1명 포함)', n == 11, f'{n}개, 계정 {hj.get("users")} · 글 {hj.get("posts")}')
    else: print('  ·  DB 꺼짐 — 동시 좋아요 검사는 건너뜀')
    check('앱 정보 (/api/release)', (lambda r: r[0] == 200 and r[1]['version'])(req('GET', '/release')))
finally:
    # 정리: 글과 계정 지우기 (계정 삭제는 그 사람의 글도 지움)
    for u, t in list(toks.items()):
        if t: req('POST', '/auth?action=delete', {'password': 'new_pass_456' if u == U1 else PW}, tok=t)
    c, j = req('GET', '/community?q=test' + stamp); check('정리 뒤 테스트 글 없음', c == 200 and not j['posts'])
print(f'\n서버 결과: {sum(results)}/{len(results)} 통과'); sys.exit(0 if all(results) else 1)
