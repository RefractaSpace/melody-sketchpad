"""멜로디 스케치패드 자동 테스트 (FL Studio식 버전 4)
사용법:  pip install playwright mido && python -m playwright install chromium
         python tests/run_tests.py                 # src/index.html (원본) 검사
         python tests/run_tests.py public/index.html
         python tests/run_tests.py https://melody-sketchpad.vercel.app/
"""
import asyncio, json, os, sys, tempfile, wave, array, statistics as st
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
        ctx = await b.new_context(viewport={'width': 1440, 'height': 1000}, color_scheme='dark', accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        J = pg.evaluate
        async def roll_click(tick, pitch, drag_ticks=0, button='left'):
            await J(f"(()=>{{const v=view(),y=(96-{pitch})*ROWH;if(y<v.st||y>v.st+v.vh-ROWH)wrap.scrollTop=Math.max(0,y-v.vh/2)}})()"); await pg.wait_for_timeout(60)
            v = await J("(()=>{const r=rollCanvas.getBoundingClientRect(),v=view();return {x:r.left,y:r.top,sl:v.sl,st:v.st,tp:TICKPX,rh:ROWH}})()")
            x = v['x'] + tick * v['tp'] - v['sl'] + 3; y = v['y'] + (96 - pitch) * v['rh'] - v['st'] + v['rh'] / 2
            await pg.mouse.move(x, y); await pg.mouse.down(button=button); await pg.mouse.move(x + drag_ticks * v['tp'], y); await pg.mouse.up(button=button)
        async def pl_click(bar, track, button='left', dbl=False):
            r = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top}})()")
            x, y = r['x'] + bar * 30 + 10, r['y'] + track * 34 + 16
            if dbl: await pg.mouse.dblclick(x, y)
            else: await pg.mouse.click(x, y, button=button)
        chan = lambda name: J(f"S.channels.findIndex(c=>c.name==='{name}')")

        check('불러오기: 오류 없음 · 창 5개 열림', not errs and await J("!document.getElementById('boot') && WINS.every(winOpen)"), '; '.join(errs[:2]))
        await pg.wait_for_function("Object.keys(PIANO).length>0", timeout=15000)
        check('녹음 피아노 준비 (뒤에서 불러오기)', await J("Object.keys(PIANO).length") == 21)

        ki = await chan('킥')
        for k in (0, 4, 8, 12): await pg.click(f'#rackBody .rrow:nth-child({ki + 1}) .st[data-k="{k}"]')
        kick = await J(f"notesOf(curPat(),S.channels[{ki}]).map(n=>n.s/12)")
        check('채널 랙: 킥 스텝 4개 켜기', sorted(kick) == [0, 4, 8, 12], str(kick))

        await pg.click('#rackBody .rrow:nth-child(1) .cname')
        for k, pitch in enumerate([79, 77, 76, 77]): await roll_click(k * 48, pitch, 30)
        mel = await J("curNotes().map(n=>[n.s,n.p])")
        check('채널 이름 누르면 그 채널 피아노 롤 · 음 찍기', await J("S.ch") == 0 and mel == [[0, 79], [48, 77], [96, 76], [144, 77]], str(mel))
        check('멜로디 채널은 채널 랙에 미리보기 그림으로', await pg.locator('#rackBody .rrow:nth-child(1) canvas.rprev').count() == 1)

        await pg.select_option('#bars', '32'); await pg.wait_for_timeout(150)
        await J("wrap.scrollLeft=20*192*TICKPX"); await pg.wait_for_timeout(150)
        await roll_click(20 * 192 + 48, 72)
        check('32마디 패턴 · 스크롤한 뒤 정확한 위치에 찍힘', await J("curNotes().some(n=>n.s===20*192+48&&n.p===72)"))
        await J("wrap.scrollLeft=0"); await pg.select_option('#bars', '4'); await pg.wait_for_timeout(150)

        await pg.keyboard.press('e')
        v = await J("(()=>{const r=rollCanvas.getBoundingClientRect();return {x:r.left,y:r.top,st:view().st,rh:ROWH,tp:TICKPX}})()")
        await pg.mouse.move(v['x'] + 2, v['y'] + (96 - 80) * v['rh'] - v['st']); await pg.mouse.down()
        await pg.mouse.move(v['x'] + 190 * v['tp'], v['y'] + (96 - 75) * v['rh'] - v['st']); await pg.mouse.up()
        n_sel = await J("sel.size"); await pg.click('#selDup'); await pg.wait_for_timeout(100)
        check('선택 도구: 네모 선택 → 복제', n_sel == 4 and await J("curNotes().length") == 8, f'선택 {n_sel}개 → 음 {await J("curNotes().length")}개')
        await pg.keyboard.press('p')

        await pg.focus('#rollCanvas'); before = await J("curNotes().length"); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(120)
        check('키보드로 음 찍기 (Enter) · 낭독 문구', await J("curNotes().length") == before + 1 and '찍었어요' in await pg.inner_text('#sr'))

        vr = await J("(()=>{const r=laneCanvas.getBoundingClientRect();return {x:r.left,y:r.top,tp:TICKPX}})()")
        await pg.mouse.click(vr['x'] + 48 * vr['tp'] + 2.5, vr['y'] + 34 + 50)
        check('세기 줄: 멜로디 세기', await J("curNotes().find(n=>n.s===48).v") < 0.3, str(await J("curNotes().find(n=>n.s===48).v")))
        await pg.click(f'#rackBody .rrow:nth-child({ki + 1}) .cname'); await pg.wait_for_timeout(100)
        await pg.mouse.click(vr['x'] + 4 * 12 * vr['tp'] + 2.5, vr['y'] + 34 + 45)
        kv = await J("curNotes().map(n=>[n.s/12,+n.v.toFixed(2)]).sort((a,b)=>a[0]-b[0])")
        check('드럼 채널도 피아노 롤·세기 줄로 세기 조절', await J("curCh().kind") == 'drum' and 0 < dict(kv)[4] < 0.5, str(kv))

        await pg.locator('#chordRow .cell').nth(0).click(); await pg.click('#chordOk')
        await pg.locator('#chordRow .cell').nth(2).click(); await pg.locator('#rootGrid .tbtn').nth(8).click(); await pg.click('#chordOk')
        ch = await J("[chordName(curPat().chords[0]), curPat().chords[1], chordName(curPat().chords[2])]")
        check('코드를 박 단위로 (패턴마다)', ch[0] and ch[1] is None and ch[2], str(ch))

        await pg.click('#patNew'); await pg.wait_for_timeout(100)
        await pg.click('#rackBody .rrow:nth-child(1) .cname'); await roll_click(0, 60, 90)
        pats = await J("S.patterns.map(p=>[p.name,Object.values(p.notes).flat().length])")
        await pl_click(4, 1); await pg.wait_for_timeout(100)
        clips = await J("S.playlist.clips.map(c=>[patById(c.pat).name,c.t,c.bar])")
        check('새 패턴 만들기 · 음 찍기 · 플레이리스트에 놓기', len(pats) == 2 and pats[1][1] == 1 and ['Pattern 2', 1, 4] in clips, f'{pats} / {clips}')
        r = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top}})()")
        await pg.mouse.move(r['x'] + 4 * 30 + 10, r['y'] + 34 + 16); await pg.mouse.down(); await pg.mouse.move(r['x'] + 8 * 30 + 10, r['y'] + 2 * 34 + 16, steps=5); await pg.mouse.up()
        moved = await J("S.playlist.clips.find(c=>patById(c.pat).name==='Pattern 2')")
        await pl_click(0, 0); await pg.wait_for_timeout(100)
        check('플레이리스트: 조각 끌어 옮기기 · 누르면 그 패턴 선택', moved['bar'] == 8 and moved['t'] == 2 and await J("curPat().name") == 'Pattern 1', str(moved))
        await pl_click(12, 3); n1 = await J("S.playlist.clips.length"); await pl_click(12, 3, button='right'); await pg.wait_for_timeout(100)
        check('플레이리스트: 오른쪽 클릭으로 지우기', await J("S.playlist.clips.length") == n1 - 1)
        await pl_click(8, 2, dbl=True); await pg.wait_for_timeout(100)
        check('조각 두 번 누르면 그 패턴의 피아노 롤', await J("curPat().name") == 'Pattern 2' and await J("winOpen('roll')"))

        await J("window.__hits=[];const __o=playTrackNote;playTrackNote=function(EE,c,p,t,d,v){__hits.push(c.name+':'+p);return __o.apply(this,arguments)};0")
        await pg.click('#modeSong'); await J("songStart=0")
        await pg.click('#play'); await pg.wait_for_timeout(700)
        await J("stop();startAt=0"); 
        await J("__hits=[];scheduleRange(E,8*192,9*192,ctx.currentTime+5,false)")
        hits = await J("__hits")
        check('SONG 모드: 플레이리스트대로 재생 (9마디에 Pattern 2 소리)', await J("S.playMode") == 'song' and '피아노:60' in hits, str(hits[:6]))
        await pg.keyboard.press('l')
        check('L키로 PAT/SONG 전환', await J("S.playMode") == 'pat')

        await pg.keyboard.press('F7'); await pg.wait_for_timeout(100)
        await pg.keyboard.press('F9'); await pg.wait_for_timeout(100)
        mixer_front = await J("document.getElementById('win-mixer').classList.contains('front')")
        x0 = await J("layout.rack.x"); h = await pg.locator('#win-rack .wh b').bounding_box()
        await pg.mouse.move(h['x'] + 5, h['y'] + 5); await pg.mouse.down(); await pg.mouse.move(h['x'] + 85, h['y'] + 45, steps=4); await pg.mouse.up()
        check('창: F키로 열고 닫기 · 제목줄 끌어 옮기기', mixer_front and await J("layout.rack.x") == x0 + 80, f'rack x {x0} → {await J("layout.rack.x")}')
        await J("layout=defaultLayout();applyLayout()")

        await pg.select_option('#chAdd', 'synth:supersaw'); await pg.wait_for_timeout(150)
        check('채널 추가 → 채널 랙·믹서에 생김', await J("S.channels.length") == 6 and await pg.locator('#mixerStrips .strip.trk').count() == 6)
        await pg.click('#rackBody .rrow:nth-child(6) .cmore'); await pg.click('.cmenu button:has-text("삭제")'); await pg.wait_for_timeout(150)
        check('채널 메뉴 → 삭제', await J("S.channels.length") == 5)

        await J("""(()=>{const P=S.patterns[0];P.bars=32;P.chords=Array(128).fill(null);for(let i=0;i<128;i+=4)P.chords[i]={r:5,q:'m'};
          const mel=notesOf(P,S.channels[0]);for(let i=0;i<400;i++)mel.push({p:60+(i*7)%24,s:i*24,l:24,v:.8});
          for(const c of S.channels.slice(1))for(let i=0;i<32*16;i++)if(c.inst==='hat'||i%4===0)notesOf(P,c).push({p:72,s:i*12,l:12,v:1});
          S.pat=0;S.chordInst='supersaw';S.bassMode='8th';S.playlist.clips=[];for(let b=0;b<128;b+=32)S.playlist.clips.push({id:newId(),pat:P.id,t:0,bar:b});refreshAll()})()""")
        check('128마디 곡 (32마디 패턴 × 4)', await J("songBars()") == 128)
        async def fps(mode):
            await J(f"setPlayMode('{mode}')"); await pg.click('#play'); await pg.wait_for_timeout(600)
            fr = await J("new Promise(res=>{const t=[];let last=performance.now();function f(n){t.push(n-last);last=n;if(t.length<150)requestAnimationFrame(f);else res(t)}requestAnimationFrame(f)})")
            await pg.click('#play'); fr = fr[5:]; return 1000 / st.mean(fr), sorted(fr)[int(len(fr) * .95)]
        f1 = await fps('pat'); f2 = await fps('song')
        check('재생 중 화면 속도 (PAT·SONG 모두 45fps 이상)', f1[0] >= 45 and f2[0] >= 45, f'PAT {f1[0]:.0f}fps · SONG {f2[0]:.0f}fps (느린 5% {f2[1]:.0f}ms)')

        await J("(()=>{S.playlist.clips=[{id:newId(),pat:S.patterns[1].id,t:0,bar:0},{id:newId(),pat:S.patterns[0].id,t:0,bar:1}];S.patterns[0].bars=2;S.patterns[0]=normalize(S).patterns[0];setPlayMode('song');refreshAll()})()")
        async with pg.expect_download(timeout=90000) as dl: await pg.click('#wav')
        d = await dl.value; wp = os.path.join(tmp, 'a.wav'); await d.save_as(wp)
        with wave.open(wp) as w: a = array.array('h', w.readframes(w.getnframes()))
        peak = max(abs(x) for x in a) / 32767 if a else 0; secs = len(a) / 2 / 44100
        check('오디오 저장 (SONG = 곡 전체)', 0.05 < peak < 1.0 and 7 < secs < 12, f'{secs:.1f}초 · 최대 {peak:.2f}')

        # WAV 빠르게 만들기: 예전 방식(한꺼번에 예약)과 같은 소리인지 · 곡 길이의 40% 안에 · 만드는 동안 화면이 안 멈추는지
        await J("""(()=>{const P=S.patterns[0];P.bars=16;P.notes={};P.chords=Array(64).fill(null);for(let i=0;i<64;i+=4)P.chords[i]={r:5,q:'m'};
          const m=notesOf(P,S.channels[0]);for(let i=0;i<128;i++)m.push({p:60+(i*7)%24,s:i*24,l:24,v:.8});
          for(const c of S.channels.slice(1))for(let i=0;i<256;i++)if(c.inst==='hat'||i%4===0)notesOf(P,c).push({p:72,s:i*12,l:12,v:1});
          S.playlist.clips=[{id:newId(),pat:P.id,t:0,bar:0}];S.pat=0;setPlayMode('pat');refreshAll()})()""")
        wr = await J("""async()=>{const keep=Math.random;Math.random=()=>0.37;
          const sr=44100,secs=playSpan()*tickSec()+3,oc=new OfflineAudioContext(2,Math.ceil(sr*secs),sr),OE=makeEngine(oc,false);applyMix(OE,S.mix);scheduleRange(OE,0,playSpan(),0.05,false);const A=await oc.startRendering();
          Math.random=()=>0.37;let gaps=[],last=performance.now(),run=true;(function f(n){if(!run)return;gaps.push(n-last);last=n;requestAnimationFrame(f)})(last);
          const prog=[];const t0=performance.now();const w=await renderWav(p=>prog.push(p));const took=(performance.now()-t0)/1000;run=false;Math.random=keep;
          const dv=new DataView(w.buffer),L=A.getChannelData(0);let ab=0,aa=0,bb=0;for(let i=0;i<A.length;i+=3){const a=L[i],b=dv.getInt16(44+i*4,true)/32767;ab+=a*b;aa+=a*a;bb+=b*b}
          return {corr:ab/Math.sqrt(aa*bb),took,song:playSpan()*tickSec(),worst:Math.max(...gaps.slice(1)),steps:prog.length}}""")
        check('WAV 빠르게 만들기: 예전과 같은 소리 · 곡 길이의 40% 안 · 화면 안 멈춤', wr['corr'] > 0.999 and wr['took'] < wr['song'] * 0.4 and wr['worst'] < 500 and wr['steps'] > 10,
              f"상관 {wr['corr']:.4f} · {wr['song']:.0f}초 곡을 {wr['took']:.1f}초에 · 화면 최대 멈춤 {wr['worst']:.0f}ms · 진행률 {wr['steps']}번")
        async with pg.expect_download() as dl: await pg.click('#midi')
        d = await dl.value; mp = os.path.join(tmp, 'a.mid'); await d.save_as(mp)
        import mido; m = mido.MidiFile(mp)
        check('MIDI 저장 (악기 채널마다 트랙 + 코드 + 드럼)', len(m.tracks) == 1 + 1 + 2, f'트랙 {len(m.tracks)}개')
        await pg.locator('#midiIn').set_input_files(mp); await pg.wait_for_timeout(500)
        got = await J("[S.channels.map(c=>c.kind+':'+c.inst), S.patterns.length, S.patterns[0].chords.filter(Boolean).length]")
        check('MIDI 불러오기 (악기·드럼 채널로 · 코드 복원)', got[1] == 1 and 'drum:kick' in got[0] and got[2] >= 1, str(got))

        async with pg.expect_download() as dl: await pg.click('#saveProj')
        d = await dl.value; jp = os.path.join(tmp, 'p.json'); await d.save_as(jp); pj = json.load(open(jp))
        await pg.locator('#fileIn').set_input_files(jp); await pg.wait_for_timeout(500)
        check('프로젝트 파일 저장 → 불러오기 (버전 4)', pj.get('version') == 4 and await J("S.channels.length") == len(pj['song']['channels']))

        v3 = {'v': 3, 'bpm': 128, 'root': 0, 'mode': 'major', 'bars': 2, 'tracks': [{'id': 'a', 'name': '리드', 'inst': 'pluck', 'notes': [{'p': 60, 's': 0, 'l': 24}]}], 'chords': [{'r': 0, 'q': ''}, None, None, None, {'r': 7, 'q': ''}], 'drums': {'kick': [1, 0, 0, 0, 0.5]}}
        await J(f"(()=>{{const id=newId();lib.list[id]={{name:'옛 곡',updated:Date.now()}};lsSet(PK(id),JSON.stringify({json.dumps(v3)}));openProject(id)}})()")
        conv = await J("[S.channels.map(c=>c.name), S.patterns.length, S.playlist.clips.length, chordName(S.patterns[0].chords[4]), notesOf(S.patterns[0],S.channels[1]).map(n=>n.v)]")
        check('버전 3 곡 → 채널·패턴·플레이리스트로 변환', conv[0][:2] == ['리드', '킥'] and conv[1] == 1 and conv[2] == 1 and conv[3] == 'G' and conv[4] == [1, 0.5], str(conv))
        v2 = {'bpm': 120, 'root': 5, 'mode': 'minor', 'bars': 1, 'inst': 'bell', 'notes': [{'p': 65, 's': 0, 'l': 12}], 'chords': [{'r': 5, 'q': 'm'}]}
        await J(f"(()=>{{const id=newId();lib.list[id]={{name:'더 옛 곡',updated:Date.now()}};lsSet(PK(id),JSON.stringify({json.dumps(v2)}));openProject(id)}})()")
        check('버전 2 곡도 변환', await J("S.channels[0].inst==='bell' && chordName(S.patterns[0].chords[0])==='Fm'"))

        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
        stacked = await J("getComputedStyle(document.getElementById('win-roll')).position")
        check('휴대폰 폭에서는 창이 위아래로 쌓임', stacked == 'static', stacked)

        check('테스트 중 오류 없음', not errs, '; '.join(errs[:3]))
        await b.close()
    ok = sum(1 for r in results if r[1]); print(f'\n결과: {ok}/{len(results)} 통과'); return ok == len(results)

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
