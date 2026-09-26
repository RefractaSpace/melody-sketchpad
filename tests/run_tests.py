"""멜로디 스케치패드 자동 테스트
사용법:  pip install playwright mido && python -m playwright install chromium
         python tests/run_tests.py                 # src/index.html (원본) 검사
         python tests/run_tests.py public/index.html
         python tests/run_tests.py https://melody-sketchpad.vercel.app/
"""
import asyncio, io, json, os, sys, tempfile, wave, statistics as st
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'index.html')
URL = TARGET if TARGET.startswith('http') else 'file://' + os.path.abspath(TARGET)
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail)); print(('  ✅ ' if ok else '  ❌ ') + name + (f'  — {detail}' if detail else ''))

async def main():
    tmp = tempfile.mkdtemp()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 1100}, color_scheme='dark', accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        J = pg.evaluate
        async def roll_click(tick, pitch, drag_ticks=0):
            v = await J("(()=>{const r=rollCanvas.getBoundingClientRect(),v=view();return {x:r.left,y:r.top,sl:v.sl,st:v.st,tp:TICKPX,rh:ROWH}})()")
            x = v['x'] + tick * v['tp'] - v['sl'] + 3; y = v['y'] + (96 - pitch) * v['rh'] - v['st'] + v['rh'] / 2
            await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + drag_ticks * v['tp'], y); await pg.mouse.up()
        async def lane_click(lane, step):
            v = await J("(()=>{const r=laneCanvas.getBoundingClientRect();return {x:r.left,y:r.top,sl:lanes.scrollLeft,tp:TICKPX}})()")
            await pg.mouse.click(v['x'] + step * 12 * v['tp'] - v['sl'] + 6, v['y'] + 34 + lane * 28 + 14)

        check('불러오기: 오류 없음 · 시작 화면 사라짐', not errs and await J("!document.getElementById('boot')"), '; '.join(errs[:2]))
        await pg.wait_for_function("Object.keys(PIANO).length>0", timeout=15000)
        check('녹음 피아노 준비 (뒤에서 불러오기)', await J("Object.keys(PIANO).length") == 21, await J("document.getElementById('pianoStat').textContent") or '완료')

        for k, pitch in enumerate([79, 77, 76, 77]): await roll_click(k * 48, pitch, 30)
        notes = await J("curNotes().map(n=>[n.s,n.p])")
        check('연필로 음 찍기', notes == [[0, 79], [48, 77], [96, 76], [144, 77]], str(notes))

        await J("wrap.scrollLeft=4*192*TICKPX"); await pg.wait_for_timeout(150)
        await roll_click(4 * 192 + 48, 72)
        check('스크롤한 뒤에도 정확한 위치에 찍힘 (보이는 부분만 그리기 좌표)', await J("curNotes().some(n=>n.s===4*192+48&&n.p===72)"))
        await J("wrap.scrollLeft=0"); await pg.wait_for_timeout(100)

        await pg.keyboard.press('e')
        v = await J("(()=>{const r=rollCanvas.getBoundingClientRect();return {x:r.left,y:r.top,st:view().st,rh:ROWH,tp:TICKPX}})()")
        await pg.mouse.move(v['x'] + 2, v['y'] + (96 - 80) * v['rh'] - v['st']); await pg.mouse.down()
        await pg.mouse.move(v['x'] + 190 * v['tp'], v['y'] + (96 - 75) * v['rh'] - v['st']); await pg.mouse.up()
        n_sel = await J("sel.size"); await pg.click('#selDup'); await pg.wait_for_timeout(100)
        check('선택 도구: 네모 선택 → 복제', n_sel == 4 and await J("curNotes().length") == 9, f'선택 {n_sel}개 → 음 {await J("curNotes().length")}개')
        await pg.keyboard.press('p')

        await pg.focus('#rollCanvas'); before = await J("curNotes().length"); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(120)
        check('키보드로 음 찍기 (Enter) · 낭독 문구', await J("curNotes().length") == before + 1 and '찍었어요' in await pg.inner_text('#sr'))

        vr = await J("(()=>{const r=laneCanvas.getBoundingClientRect();return {x:r.left,y:r.top,tp:TICKPX}})()")
        await pg.mouse.click(vr['x'] + 48 * vr['tp'] + 2.5, vr['y'] + 34 + 28 * 4 + 50)
        check('세기 줄: 멜로디 세기 조절', await J("curNotes().find(n=>n.s===48).v") < 0.3, str(await J("curNotes().find(n=>n.s===48).v")))

        for s in (0, 4, 8, 12): await lane_click(0, s)
        await pg.select_option('#velTarget', 'kick')
        await pg.mouse.click(vr['x'] + 4 * 12 * vr['tp'] + 12 * vr['tp'] / 2, vr['y'] + 34 + 28 * 4 + 45)
        kick = await J("S.drums.kick.slice(0,16)")
        check('드럼 켜기 + 드럼 칸마다 세기', kick[0] == 1 and 0 < kick[4] < 0.5 and kick[8] == 1, str([round(x, 2) for x in kick[:9]]))
        await pg.select_option('#velTarget', 'notes')

        await pg.locator('#chordRow .cell').nth(0).click(); await pg.click('#chordOk')
        await pg.locator('#chordRow .cell').nth(2).click(); await pg.locator('#rootGrid .tbtn').nth(8).click(); await pg.click('#chordOk')
        ch = await J("[S.chords[0]&&chordName(S.chords[0]), S.chords[1], S.chords[2]&&chordName(S.chords[2])]")
        check('코드를 박 단위로 (1마디 1박 · 3박)', ch[0] and ch[1] is None and ch[2], str(ch))

        await pg.click('#trackAdd'); await pg.wait_for_timeout(100)
        await roll_click(0, 60, 90)
        t = await J("S.tracks.map(t=>[t.name,t.inst,t.notes.length])")
        strips = await pg.locator('#mixerStrips .strip.trk').count()
        check('멜로디 트랙 추가 · 트랙마다 믹서 채널', len(t) == 2 and t[1][2] == 1 and strips == 2, str(t))
        await pg.select_option('#trackSel', '0'); await pg.wait_for_timeout(100)
        check('트랙 전환 (첫 트랙 음은 그대로)', await J("S.cur") == 0 and await J("curNotes().length") == 10)

        await pg.select_option('#bars', '128'); await pg.wait_for_timeout(200)
        await J("wrap.scrollLeft=wrap.scrollWidth"); await pg.wait_for_timeout(200)
        await roll_click(127 * 192 + 96, 70)
        cw = await J("rollCanvas.width/devicePixelRatio")
        check('128마디 · 맨 끝 마디에 음 찍기 · 캔버스는 화면 크기', await J("S.bars") == 128 and await J("curNotes().some(n=>n.s===127*192+96)") and cw < 1400, f'캔버스 {cw:.0f}px (곡 전체 {await J("W()")}px)')
        await J("wrap.scrollLeft=0")

        await J("""(()=>{const t=S.tracks[0];for(let i=0;i<400;i++)t.notes.push({p:60+(i*7)%24,s:i*24,l:24,v:.8});for(const d of DRUMS)for(let i=0;i<32*16;i++)S.drums[d][i]=d==='hat'?1:(i%4===0?1:0);
          for(let i=0;i<32*4;i+=4)S.chords[i]={r:5,q:'m'};S.chordInst='supersaw';S.bassMode='8th';drawAll()})()""")
        await pg.click('#play'); await pg.wait_for_timeout(600)
        fr = await J("new Promise(res=>{const t=[];let last=performance.now();function f(n){t.push(n-last);last=n;if(t.length<150)requestAnimationFrame(f);else res(t)}requestAnimationFrame(f)})")
        await pg.click('#play'); fr = fr[5:]; fps = 1000 / st.mean(fr); slow = sorted(fr)[int(len(fr) * 0.95)]
        check('재생 중 화면 속도 (긴 곡, 목표 45fps 이상)', fps >= 45, f'평균 {fps:.0f}fps · 느린 5% {slow:.0f}ms')

        await pg.select_option('#bars', '4'); await pg.wait_for_timeout(200)
        async with pg.expect_download(timeout=90000) as dl: await pg.click('#wav')
        d = await dl.value; wp = os.path.join(tmp, 'a.wav'); await d.save_as(wp)
        with wave.open(wp) as w: raw = w.readframes(w.getnframes()); import array; a = array.array('h', raw)
        peak = max(abs(x) for x in a) / 32767 if a else 0
        check('오디오 저장 (WAV, 모든 트랙)', peak > 0.05 and peak < 1.0, f'{len(a)/2/44100:.1f}초 · 최대 {peak:.2f}')

        async with pg.expect_download() as dl: await pg.click('#midi')
        d = await dl.value; mp = os.path.join(tmp, 'a.mid'); await d.save_as(mp)
        try:
            import mido; m = mido.MidiFile(mp); names = [tr.name for tr in m.tracks]
            check('MIDI 저장 (트랙마다 MIDI 트랙)', len(m.tracks) == 2 + 3, ', '.join(names))
        except ImportError: check('MIDI 저장', os.path.getsize(mp) > 100, 'mido 없음: 크기만 확인')
        await pg.locator('#midiIn').set_input_files(mp); await pg.wait_for_timeout(500)
        check('MIDI 불러오기 (채널마다 트랙 · 코드 트랙은 코드로 복원)', await J("S.tracks.length") == 2 and await J("S.chords.filter(Boolean).length") >= 1, await pg.inner_text('#status'))

        async with pg.expect_download() as dl: await pg.click('#saveProj')
        d = await dl.value; jp = os.path.join(tmp, 'p.json'); await d.save_as(jp); pj = json.load(open(jp))
        await pg.locator('#fileIn').set_input_files(jp); await pg.wait_for_timeout(500)
        check('프로젝트 파일 저장 → 새 프로젝트로 불러오기', pj.get('version') == 3 and await J("S.tracks.length") == len(pj['song']['tracks']), await pg.inner_text('#status'))

        old = {'bpm': 128, 'root': 0, 'mode': 'major', 'bars': 2, 'inst': 'pluck', 'notes': [{'p': 60, 's': 0, 'l': 24}], 'chords': [{'r': 0, 'q': ''}, {'r': 7, 'q': ''}], 'drums': {'kick': [1, 0, 0, 0]}}
        await J(f"(()=>{{const id=newId();lib.list[id]={{name:'옛 곡',updated:Date.now()}};lsSet(PK(id),JSON.stringify({json.dumps(old)}));openProject(id)}})()")
        conv = await J("[S.tracks.length,S.tracks[0].inst,S.tracks[0].notes.length,S.chords.length,chordName(S.chords[4]),S.chords[1],S.drums.kick[0]]")
        check('옛 버전 곡을 새 형식으로 변환', conv == [1, 'pluck', 1, 8, 'G', None, 1], str(conv))

        check('테스트 중 오류 없음', not errs, '; '.join(errs[:3]))
        await b.close()
    ok = sum(1 for r in results if r[1]); print(f'\n결과: {ok}/{len(results)} 통과'); return ok == len(results)

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
