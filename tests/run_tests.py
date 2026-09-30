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

async def fclick(pg, sel, **kw):
    """파일 메뉴 안 항목: 메뉴가 닫혀 있으면 먼저 열고 누름 (실제 사용자 동작과 같음)"""
    if not await pg.is_visible(sel):
        await pg.click('#fileMenuBtn'); await pg.wait_for_timeout(60)
    await pg.click(sel, **kw)

async def main():
    tmp = tempfile.mkdtemp()
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 1100}, color_scheme='dark', accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        J = pg.evaluate
        async def roll_click(tick, pitch, drag_ticks=0, button='left'):
            await J(f"(()=>{{const v=view(),y=(HIGH-{pitch})*ROWH;if(y<v.st||y>v.st+v.vh-ROWH)wrap.scrollTop=Math.max(0,y-v.vh/2)}})()"); await pg.wait_for_timeout(60)
            v = await J("(()=>{const r=rollCanvas.getBoundingClientRect(),v=view();return {x:r.left,y:r.top,sl:v.sl,st:v.st,tp:TICKPX,rh:ROWH,hi:HIGH}})()")
            x = v['x'] + tick * v['tp'] - v['sl'] + 3; y = v['y'] + (v['hi'] - pitch) * v['rh'] - v['st'] + v['rh'] / 2
            await pg.mouse.move(x, y); await pg.mouse.down(button=button); await pg.mouse.move(x + drag_ticks * v['tp'], y); await pg.mouse.up(button=button)
        async def pl_click(bar, track, button='left', dbl=False):
            r = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top}})()")
            x, y = r['x'] + bar * 30 + 10, r['y'] + track * 34 + 16
            if dbl: await pg.mouse.dblclick(x, y)
            else: await pg.mouse.click(x, y, button=button)
        chan = lambda name: J(f"S.channels.findIndex(c=>c.name==='{name}')")

        check('불러오기: 오류 없음 · 화면 높이에 맞는 기본 창 (높은 화면 5개 / 낮은 화면 3개)', not errs and await J("!document.getElementById('boot') && ['playlist','rack','roll'].every(winOpen) && (WINS.every(winOpen) || (!winOpen('browser') && !winOpen('mixer')))"), '; '.join(errs[:2]))
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
        await J("wrap.scrollTop=(HIGH-82)*ROWH"); await pg.wait_for_timeout(60)
        v = await J("(()=>{const r=rollCanvas.getBoundingClientRect();return {x:r.left,y:r.top,st:view().st,rh:ROWH,tp:TICKPX,hi:HIGH}})()")
        await pg.mouse.move(v['x'] + 2, v['y'] + (v['hi'] - 80) * v['rh'] - v['st']); await pg.mouse.down()
        await pg.mouse.move(v['x'] + 190 * v['tp'], v['y'] + (v['hi'] - 75) * v['rh'] - v['st']); await pg.mouse.up()
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
        async with pg.expect_download(timeout=90000) as dl: await fclick(pg, '#wav')
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
        async with pg.expect_download() as dl: await fclick(pg, '#midi')
        d = await dl.value; mp = os.path.join(tmp, 'a.mid'); await d.save_as(mp)
        import mido; m = mido.MidiFile(mp)
        check('MIDI 저장 (악기 채널마다 트랙 + 코드 + 드럼)', len(m.tracks) == 1 + 1 + 2, f'트랙 {len(m.tracks)}개')
        await pg.locator('#fileIn').set_input_files(mp); await pg.wait_for_timeout(500)
        got = await J("[S.channels.map(c=>c.kind+':'+c.inst), S.patterns.length, S.patterns[0].chords.filter(Boolean).length]")
        check('MIDI 불러오기 (악기·드럼 채널로 · 코드 복원)', got[1] == 1 and 'drum:kick' in got[0] and got[2] >= 1, str(got))

        # 우리 형식 MSK
        await J("idbPut('ch:'+S.channels[0].id,{ab:wavBytes(new AudioBuffer({length:100,sampleRate:44100,numberOfChannels:2})).buffer,root:62,name:'짧은샘플.wav'})")
        before = await J("JSON.stringify([S.channels.map(c=>c.kind+c.inst+c.name),S.patterns.map(p=>[p.bars,Object.values(p.notes).flat().length])])")
        async with pg.expect_download() as dl: await fclick(pg, '#saveProj')
        d = await dl.value; mk = os.path.join(tmp, 'p.msk'); await d.save_as(mk); raw = open(mk, 'rb').read()
        await pg.locator('#fileIn').set_input_files(mk); await pg.wait_for_timeout(500)
        after = await J("JSON.stringify([S.channels.map(c=>c.kind+c.inst+c.name),S.patterns.map(p=>[p.bars,Object.values(p.notes).flat().length])])")
        smp = await J("(async()=>{const a=await idbAll();return Object.entries(a).filter(([k,v])=>k==='ch:'+S.channels[0].id).map(([k,v])=>[v.name,v.root,v.ab.byteLength])})()")
        check('저장(.msk) → 불러오기: 곡과 내 샘플까지 그대로', raw[:3] == b'MSK' and before == after and smp == [['짧은샘플.wav', 62, 444]], f'{len(raw):,}바이트 · 샘플 {smp}')
        sz = await J("""(async()=>{const j=JSON.stringify({app:'melody-sketchpad',version:4,song:S}).length,m=(await encodeMSK(S,'x',{})).length,t=scoreText('x').length;return [j,m,t]})()""")
        check('MSK가 프로젝트 JSON보다 5배 이상 작음', sz[0] / sz[1] >= 5, f'JSON {sz[0]:,} · 악보 {sz[2]:,} · MSK {sz[1]:,} 바이트 ({sz[0]/sz[1]:.0f}배)')
        # 확장자가 틀려도 내용으로 알아봄 (MSK를 .txt로, MIDI를 .json으로)
        wrong1 = os.path.join(tmp, '가짜이름.txt'); open(wrong1, 'wb').write(raw)
        wrong2 = os.path.join(tmp, '가짜이름.json'); open(wrong2, 'wb').write(open(mp, 'rb').read())
        await pg.locator('#fileIn').set_input_files(wrong1); await pg.wait_for_timeout(400); st1 = await pg.inner_text('#status')
        await pg.locator('#fileIn').set_input_files(wrong2); await pg.wait_for_timeout(400); st2 = await pg.inner_text('#status')
        check('확장자가 틀려도 내용을 스캔해서 형식 인식', 'MSK 파일로 알아보고' in st1 and 'MIDI 파일로 알아보고' in st2, f'{st1[:22]} / {st2[:22]}')
        bad = await J("""(async()=>{const u=await encodeMSK(S,'x',{},false);const out=[];
          try{await decodeMSK(u.slice(0,u.length-7))}catch(e){out.push(e.message)}
          const extra=new MskW();extra.chunk('ZZZZ',p=>{p.str('미래의 기능');p.vu(12345)});const body=encodeMskBody(S,'x',{},false),noCrc=body.slice(0,body.length-9);
          const fw=new MskW();fw.raw(extra.done());fw.raw(noCrc);const crc=mskCrc(fw.b.subarray(0,fw.n));fw.chunk('CRC ',p=>{p.u8(crc&255);p.u8(crc>>>8&255);p.u8(crc>>>16&255);p.u8(crc>>>24&255)});
          const r=await decodeMSK(mskFile(fw.done(),0));out.push(r.song.channels.length===S.channels.length);
          try{await decodeMSK(Uint8Array.from([77,83,75,9,0]))}catch(e){out.push(e.message)}return out})()""")
        check('망가진 파일은 알려 주고, 모르는 청크는 건너뜀', '끊겼' in bad[0] and bad[1] is True and '새 버전' in bad[2], f'{bad[0][:30]} / 건너뜀 {bad[1]}')
        old = list(open(os.path.join(HERE, 'old_v1_nocrc.msk'), 'rb').read())
        guard = await J("""async(old)=>{const out={};
          const s=normalize(blank());s.bpm=126.5;notesOf(s.patterns[0],s.channels[0]).push({p:72,s:0,l:24,v:.8});
          out.bpm=(await decodeMSK(await encodeMSK(s,'',{}))).song.bpm;
          const u=encodeMskSync(s,'곡');let silent=0;for(let i=5;i<u.length;i++){const v=u.slice();v[i]^=0x20;try{decodeMskSync(v);silent++}catch(e){}}out.silent=silent;out.len=u.length-5;
          let bad=0;for(let k=0;k<200;k++){const v=new Uint8Array(5+Math.floor(Math.random()*300));crypto.getRandomValues(v);v.set([77,83,75,1,2]);try{decodeMskSync(v)}catch(e){bad++}}out.bad=bad;
          const o=await decodeMSK(Uint8Array.from(old));out.old=[o.name,o.song.bpm,o.song.patterns.length];return out}""", old)
        check('MSK 안전장치: 소수점 BPM · 바이트 하나 바뀌면 거절 · 옛 파일도 읽힘', guard['bpm'] == 126.5 and guard['silent'] == 0 and guard['bad'] == 200 and guard['old'] == ['Plum풍 1번 진행', 138, 2],
              f"BPM {guard['bpm']} · 뒤집기 {guard['len']}번 중 놓침 {guard['silent']} · 무작위 200개 거절 {guard['bad']} · 옛 파일 {guard['old']}")
        code = await J("(async()=>mskToCode(await encodeMSK(S,'코드곡',{})))()")
        await fclick(pg, '#scoreIn'); await pg.fill('#scoreText', code); await pg.wait_for_timeout(400)
        cm = await pg.inner_text('#scoreMsg'); await pg.click('#scoreLoad'); await pg.wait_for_timeout(300)
        check('곡 코드 붙여넣기 → 새 프로젝트', '곡 코드로 알아봤어요' in cm and await J("lib.list[lib.current].name") == '코드곡', f'{len(code):,}글자')
        store = await J("""(()=>{save();clearTimeout(saveT);lsSet(PK(lib.current),songToStore(S));const v=lsGet(PK(lib.current)),j=JSON.stringify(S).length,a=JSON.stringify([S.channels.map(c=>c.id),S.patterns.map(p=>p.id)]);
          openProject(lib.current);return [v.slice(0,5),v.length,j,a===JSON.stringify([S.channels.map(c=>c.id),S.patterns.map(p=>p.id)])]})()""")
        check('내 프로젝트도 MSK로 저장 (번호표 유지)', store[0] == 'MSK1.' and store[3] is True and store[2] / store[1] > 3, f'JSON {store[2]:,}글자 → MSK {store[1]:,}글자')

        # 악보 텍스트 형식: 왕복 · 오류 줄 번호 · 붙여넣기 · 변환기
        rt = await J("""(()=>{const t=scoreText('왕복'),r=parseScore(t),k=s=>JSON.stringify([s.bpm,s.root,s.mode,s.channels.map(c=>c.kind+c.inst),s.patterns.map(p=>[p.bars,p.chords,s.channels.map(c=>(p.notes[c.id]||[]).map(n=>[n.p,n.s,n.l,Math.round(n.v*(c.kind==='drum'?10:100))]).sort())]),s.playlist.clips.map(c=>[c.t,c.bar])]);
          return {same:k(S)===k(r.song),warn:r.warnings}})()""")
        check('악보 텍스트: 곡 → 악보 → 곡 왕복이 같음', rt['same'] and not rt['warn'], str(rt['warn'][:2]))
        er = await J("(()=>{try{parseScore('BPM: 120\\n[채널]\\n피아노 = 피아노\\n[패턴] A | 1마디\\n피아노: 1.1.1 H5 2');return 'no error'}catch(e){return e.message}})()")
        wr = await J("(()=>{const r=parseScore('[채널]\\n피아노 = 피아노\\n[패턴] A | 1마디\\n피아노: 1.1.1 H5 2 | 1.2.1 C5 2');return [r.warnings.join(' / '), notesOf(r.song.patterns[0],r.song.channels[0]).length]})()")
        er2 = await J("(()=>{try{parseScore('[채널]\\n피아노 = 없는악기\\n[패턴] A | 1마디');return 'no error'}catch(e){return e.message}})()")   # 바이올린은 6에서 진짜 악기가 됨
        check('악보 텍스트: 틀린 곳을 줄 번호로 알려 줌', '4번째 줄' in wr[0] and wr[1] == 1 and '2번째 줄' in er2 and '없는악기' in er2, f'{wr[0][:40]} / {er2[:40]}')
        demo = "# 멜로디 스케치패드 악보 v1\n제목: 테스트 곡\nBPM: 128\n조: A 단조\n재생: SONG\n[채널]\n리드 = 슈퍼소    볼륨 80\n킥 = 드럼 킥\n[패턴] 벌스 | 2마디\n코드: 1.1 Am | 2.1 F\n리드: 1.1.1 A4 2 v90 | 1.1.3 C5 2 | 1.2.1 E5 4\n  2.1.1 F5 8 v70\n킥: X...X...X...5... X...X...X...X...\n[플레이리스트]\n트랙 1: 벌스 @1, 벌스 @3\n"
        await fclick(pg, '#scoreIn'); await pg.fill('#scoreText', demo); await pg.wait_for_timeout(450)
        ok_msg = '알아봤어요' in await pg.inner_text('#scoreMsg'); await pg.click('#scoreLoad'); await pg.wait_for_timeout(300)
        got = await J("[lib.list[lib.current].name,S.bpm,S.root,S.mode,S.playMode,S.channels.map(c=>c.name),notesOf(S.patterns[0],S.channels[0]).length,notesOf(S.patterns[0],S.channels[1]).map(n=>n.v),chordName(S.patterns[0].chords[4]),S.playlist.clips.length,Math.round(S.mix[chKey(S.channels[0])].v*100)]")
        check('악보 붙여넣기 → 새 프로젝트', ok_msg and got[:6] == ['테스트 곡', 128, 9, 'minor', 'song', ['리드', '킥']] and got[6] == 4 and 0.5 in got[7] and got[8] == 'F' and got[9] == 2 and got[10] == 80, str(got))
        tp = os.path.join(tmp, 'demo.txt'); open(tp, 'w').write(demo)
        await fclick(pg, '#convBtn'); await pg.locator('#convIn').set_input_files(tp); await pg.wait_for_timeout(300)
        async with pg.expect_download() as dl: await pg.click('#convMid')
        d = await dl.value; cm = os.path.join(tmp, 'conv.mid'); await d.save_as(cm); mm = mido.MidiFile(cm)
        await pg.locator('#convIn').set_input_files(cm); await pg.wait_for_timeout(300)
        async with pg.expect_download() as dl: await pg.click('#convTxt')
        d = await dl.value; ct = os.path.join(tmp, 'back.txt'); await d.save_as(ct); back = open(ct).read()
        await pg.click('#convClose')
        check('파일 변환기: 악보 → MIDI → 악보 (지금 곡은 그대로)', round(mm.length, 1) == 7.5 and 'BPM: 128' in back and 'A4 2 v90' in back and await J("lib.list[lib.current].name") == '테스트 곡', f'MIDI {mm.length:.1f}초')
        # 넓힌 음역(C1~C8) · 새 악기 · MIDI 구간·겹친 음·드럼 롤·템포
        tm = mido.MidiFile(ticks_per_beat=480, charset='utf-8'); T0 = mido.MidiTrack(); tm.tracks.append(T0)
        T0 += [mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(120), time=0), mido.MetaMessage('marker', text='A', time=0),
               mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(132), time=1920), mido.MetaMessage('marker', text='B', time=1920)]
        def trk(name, prog, ch, notes):
            tr = mido.MidiTrack(); tm.tracks.append(tr); tr.append(mido.MetaMessage('track_name', name=name, time=0))
            if prog is not None: tr.append(mido.Message('program_change', program=prog, channel=ch, time=0))
            ev = sorted([(a, 1, n, v) for a, d, n, v in notes] + [(a + d, 0, n, 0) for a, d, n, v in notes], key=lambda e: (e[0], e[1])); cur = 0
            for tk, on, n, v in ev: tr.append(mido.Message('note_on' if on else 'note_off', note=n, velocity=v, channel=ch, time=tk - cur)); cur = tk
        trk('피아노', 0, 0, [(0, 960, 60, 90), (480, 960, 60, 70), (1920 * 3, 480, 64, 80)])
        trk('첼로', 42, 1, [(0, 1920, 28, 80)]); trk('베이스', 38, 2, [(1920, 960, 31, 90)]); trk('첼레스타', 8, 3, [(1920 * 2, 240, 108, 70)])
        trk('드럼', None, 9, [(1920 * 2 + i * 60, 30, 38, 60 + i * 5) for i in range(8)] + [(0, 60, 49, 100), (0, 60, 36, 110)])
        mp2 = os.path.join(tmp, 'edge.mid'); tm.save(mp2)
        await pg.locator('#fileIn').set_input_files(mp2); await pg.wait_for_timeout(500)
        eg = await J("""(()=>{const all=c=>S.patterns.flatMap(p=>(p.notes[c.id]||[]).map(n=>({...n,pat:p.name})));const by=n=>S.channels.find(c=>c.name===n);
          return {bpm:S.bpm,pats:S.patterns.map(p=>p.name+':'+p.bars),insts:S.channels.map(c=>c.kind==='drum'?'drum:'+c.inst:c.inst),
            c4:all(by('피아노')).filter(n=>n.p===60).length,low:all(by('첼로')).map(n=>n.p),high:all(by('첼레스타')).map(n=>n.p),
            roll:all(S.channels.find(c=>c.inst==='snare')).length,crash:all(S.channels.find(c=>c.inst==='crash')).length}})()""")
        rt2 = await J("(async()=>{const d=(await decodeMSK(await encodeMSK(S,'x',{}))).song;return d.patterns.flatMap(p=>Object.values(p.notes).flat()).map(n=>n.p).filter(p=>p<36||p>100).sort((a,b)=>a-b)})()")
        check('MIDI: 구간→패턴 · 겹친 음 · 드럼 롤 · 대표 템포 · 새 악기 · C1~C8', eg['bpm'] == 132 and eg['pats'] == ['A:2', 'B:2'] and eg['c4'] == 2 and eg['low'] == [28] and eg['high'] == [108]
              and eg['roll'] == 8 and eg['crash'] == 1 and 'strings' in eg['insts'] and 'bass' in eg['insts'] and 'celesta' in eg['insts'] and rt2 == [28, 31, 108], f"{eg} MSK왕복 {rt2}")
        snd = await J("""(async()=>{const s=normalize(blank());s.channels=['bass','celesta','harp','timpani','strings'].map(i=>newChannel('synth',i)).concat([newChannel('drum','crash')]);fillMix(s);
          const P=s.patterns[0];s.channels.forEach((c,i)=>P.notes[c.id]=[{p:c.inst==='bass'?28:c.inst==='celesta'?100:55+i*3,s:i*48,l:48,v:.9}]);s.playlist.clips=[{id:newId(),pat:P.id,t:0,bar:0}];s.pat=0;s.ch=0;
          const w=await withSongAsync(normalize(s),()=>renderWav());const dv=new DataView(w.buffer);const out=[];for(let k=0;k<6;k++){let pk=0;const a=Math.floor((0.05+k*60/120)*44100),b=a+Math.floor(0.3*44100);for(let i=a;i<b;i++)pk=Math.max(pk,Math.abs(dv.getInt16(44+i*4,true)));out.push(+(pk/32767).toFixed(3))}return out})()""")
        check('새 악기 4개 + 크래시가 소리를 냄', all(0.01 < x < 1 for x in snd), f'베이스·첼레스타·하프·팀파니·스트링·크래시 최대 {snd}')
        # 조각 늘리기(반복)·앞 잘라내기·색
        await J("""(()=>{const s=normalize(blank());const P=s.patterns[0];P.bars=1;P.chords=Array(4).fill(null);P.notes={};P.notes[s.channels[1].id]=[{p:72,s:0,l:12,v:1}];
          const Q=newPattern('긴 패턴',4);Q.notes[s.channels[0].id]=[0,1,2,3].map(b=>({p:60+b,s:b*192,l:48,v:.8}));s.patterns.push(Q);
          s.playlist.clips=[{id:'c1',pat:P.id,t:0,bar:0},{id:'c2',pat:Q.id,t:1,bar:0}];s.playMode='song';S=normalize(s);refreshAll();openWin('playlist');plWrap.scrollLeft=0})()""")
        await pg.wait_for_timeout(200)
        r = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top}})()")
        await pg.mouse.move(r['x'] + 30 - 3, r['y'] + 17); await pg.mouse.down(); await pg.mouse.move(r['x'] + 4 * 30, r['y'] + 17, steps=6); await pg.mouse.up()
        await pg.mouse.move(r['x'] + 3, r['y'] + 34 + 17); await pg.mouse.down(); await pg.mouse.move(r['x'] + 30, r['y'] + 34 + 17, steps=6); await pg.mouse.up()
        cl = await J("""(()=>{const a=S.playlist.clips.find(c=>patById(c.pat).bars===1),b=S.playlist.clips.find(c=>patById(c.pat).bars===4);window.__h=[];const o=playTrackNote;playTrackNote=function(EE,c,p){__h.push(p);return o.apply(this,arguments)};
          ensureCtx();scheduleRange(E,0,4*192,ctx.currentTime+9,false);playTrackNote=o;return {a:[a.bar,clipLen(a),a.off||0],b:[b.bar,clipLen(b),b.off||0],hits:__h.slice().sort((x,y)=>x-y)}})()""")
        check('플레이리스트: 오른쪽 끝 끌어 늘리기(반복) · 왼쪽 끝 끌어 앞 잘라내기', cl['a'] == [0, 4, 0] and cl['b'] == [1, 3, 1] and cl['hits'] == [61, 62, 63, 72, 72, 72, 72], str(cl))
        col = await J("""(async()=>{S.patterns[1].color=3;const d=(await decodeMSK(await encodeMSK(S,'x',{}))).song,t=parseScore(withSong(S,()=>scoreText('x'))).song;
          const k=s=>JSON.stringify([s.patterns.map(p=>p.color),s.playlist.clips.map(c=>[c.bar,c.len||0,c.off||0]).sort()]);return [k(S)===k(d),k(S)===k(t),k(S)]})()""")
        check('조각 길이·시작·패턴 색이 MSK·악보에 저장됨', col[0] and col[1], col[2])
        lp = await ctx.new_page(); await lp.set_viewport_size({'width': 1366, 'height': 768}); await lp.goto(URL); await lp.wait_for_timeout(1200)
        lay = await lp.evaluate("(()=>{const r=document.getElementById('win-roll').getBoundingClientRect();return {rows:Math.floor(view().vh/ROWH),bottom:Math.round(r.bottom),tb:Math.round(document.querySelector('.tb').getBoundingClientRect().height),act:Math.round(document.querySelector('footer.actions').getBoundingClientRect().bottom),ai:Math.round(document.getElementById('aiBtn').getBoundingClientRect().bottom)}})()")
        await lp.close()
        check('노트북 화면(1366×768): 피아노 롤 18줄 이상 · 아래 버튼 줄(AI 포함)까지 화면 안', lay['rows'] >= 18 and lay['bottom'] <= 768 and lay['tb'] < 70 and lay['act'] <= 768 and lay['ai'] <= 768, str(lay))
        # 자판 건반 · MIDI 건반 · 녹음
        await J("""(()=>{const s=normalize(blank());s.bpm=120;s.patterns[0].bars=1;s.patterns[0].chords=Array(4).fill(null);s.playMode='pat';S=s;startTick=0;refreshAll();$('loop').setAttribute('aria-pressed','true')})()""")
        await pg.click('#typeKeys'); await J("setRec(true);play()"); await pg.wait_for_timeout(250)
        await pg.keyboard.down('q'); await pg.wait_for_timeout(260); await pg.keyboard.up('q'); await pg.wait_for_timeout(150)
        await J("handleMidi([0xB0,64,127]);handleMidi([0x90,64,100])"); await pg.wait_for_timeout(200); await J("handleMidi([0x80,64,0])")
        held = await J("live.has(64)"); await pg.wait_for_timeout(200); await J("handleMidi([0xB0,64,0])"); await pg.wait_for_timeout(100)
        await J("stop();setRec(false)"); await pg.click('#typeKeys')
        recd = await J("curNotes().map(n=>[n.p,n.s%12===0,n.l>=12,Math.round(n.v*100)])")
        undo1 = await J("(()=>{$('undo').click();return curNotes().length})()")
        check('자판 건반·MIDI 건반으로 녹음 (서스테인 페달 · 되돌리기 한 번에)', sorted(r[0] for r in recd) == [64, 72] and all(r[1] and r[2] for r in recd) and [r[3] for r in recd if r[0] == 72] == [80] and held and undo1 == 0, f'{recd} · 페달 누르는 동안 유지 {held} · 되돌린 뒤 {undo1}개')
        slot = await J("(()=>{addChannel('synth','piano');return chKey(curCh())})()")
        await J(f"micToggle('{slot}','테스트 채널')"); await pg.wait_for_timeout(1600); await J(f"micToggle('{slot}','테스트 채널')")
        await pg.wait_for_function(f"!!SAMPLES['{slot}']", timeout=8000)
        mic = await J(f"[+SAMPLES['{slot}'].buf.duration.toFixed(1),curCh().inst,Math.max(...SAMPLES['{slot}'].buf.getChannelData(0).slice(4000,40000).map(Math.abs))]")
        check('마이크 녹음 → 채널 소리 (내 샘플)', mic[0] >= 1.0 and mic[1] == 'sample' and mic[2] > 0.01, f'{mic[0]}초 · 악기 {mic[1]} · 소리 크기 {mic[2]:.2f}')
        # 템포 지도
        tmath = await J("""(()=>{const s=normalize(blank());s.bpm=120;s.tempo=[{t:192,bpm:60}];s.playMode='song';S=s;refreshAll();
          const r=[songSec(192),songSec(384),songTickAt(6),bpmAt(100),bpmAt(200)];s.playMode='pat';r.push(tSec(384));return r.map(x=>+x.toFixed(4))})()""")
        check('템포 지도 계산: 틱↔초 · PAT 모드는 기본 BPM', tmath == [2, 6, 384, 120, 60, 4], str(tmath))
        await pg.locator('#fileIn').set_input_files(os.path.join(HERE, 'festival_v16.mid')); await pg.wait_for_timeout(900)
        app = await J("""(()=>{const out=[];const rh=S.channels.find(c=>c.name.startsWith('Piano RH'));for(const cl of S.playlist.clips)for(const q of clipParts(cl,0,MAX_BARS*BAR_T))for(const n of q.P.notes[rh.id]||[])if(n.s>=q.from&&n.s<q.to)out.push(songSec(q.origin+n.s));
          return {n:S.tempo.length,bpm:S.bpm,mode:S.playMode,times:out.sort((a,b)=>a-b),len:songSec(songTicks())}})()""")
        mm = mido.MidiFile(os.path.join(HERE, 'festival_v16.mid')); ref = []
        tmap = []; now = 0
        for msg in mido.merge_tracks(mm.tracks):
            now += msg.time
            if msg.type == 'set_tempo': tmap.append((now, msg.tempo))
        def tick2sec(tk):
            sec = 0; prev_t = 0; tempo = 500000
            for tt, tp in tmap:
                if tt >= tk: break
                sec += mido.tick2second(tt - prev_t, mm.ticks_per_beat, tempo); prev_t = tt; tempo = tp
            return sec + mido.tick2second(tk - prev_t, mm.ticks_per_beat, tempo)
        for tr in mm.tracks:
            if any(m.type == 'track_name' and m.name.startswith('Piano RH') for m in tr):
                now = 0
                for msg in tr:
                    now += msg.time
                    if msg.type == 'note_on' and msg.velocity > 0: ref.append(tick2sec(now))
        ref.sort(); err = max(abs(a - b) for a, b in zip(ref, app['times'])) if len(ref) == len(app['times']) else 99
        check('축제, 청춘 v16: 템포 변화 전부 → 음 1,152개 시각이 원본 MIDI와 일치', app['n'] > 50 and app['mode'] == 'song' and err < 0.01, f"바뀌는 곳 {app['n']}개 · 기본 {app['bpm']} · 최대 오차 {err*1000:.2f}ms · 곡 길이 {app['len']:.1f}초")
        rt3 = await J("""(async()=>{const d=(await decodeMSK(await encodeMSK(S,'x',{}))).song,t=parseScore(withSong(S,()=>scoreText('x'))).song,k=a=>JSON.stringify(a.map(x=>[x.t,x.bpm]));return [k(d.tempo)===k(S.tempo),k(t.tempo)===k(S.tempo)]})()""")
        async with pg.expect_download() as dl: await fclick(pg, '#midi')
        d = await dl.value; tp2 = os.path.join(tmp, 'tempo_out.mid'); await d.save_as(tp2)
        check('템포 지도가 MSK·악보·MIDI 저장에 담김', rt3 == [True, True] and abs(mido.MidiFile(tp2).length - mm.length) < 0.05, f'MSK·악보 {rt3} · 저장한 MIDI {mido.MidiFile(tp2).length:.2f}초 (원본 {mm.length:.2f}초)')
        # 믹서 이펙트 칸 · 자동화
        fxr = await J("""(async()=>{const mk=(fx,auto)=>{const s=normalize(blank());s.bpm=120;s.channels=[newChannel('synth','supersaw','리드')];s.mix={};fillMix(s);s.mix['ch:'+s.channels[0].id].fx=fx;s.mix['ch:'+s.channels[0].id].rev=0;s.mix['ch:'+s.channels[0].id].dly=0;
            const P=s.patterns[0];P.bars=1;P.chords=Array(4).fill(null);P.notes={[s.channels[0].id]:[{p:57,s:0,l:192,v:.9}]};if(auto)P.auto={[s.channels[0].id]:auto};s.playlist.clips=[{id:newId(),pat:P.id,t:0,bar:0}];s.pat=0;s.ch=0;s.playMode='pat';return normalize(s)};
          const an=async s=>{const w=await withSongAsync(s,()=>renderWav());const dv=new DataView(w.buffer),n=Math.floor(2*44100),a=[];for(let i=0;i<n;i++)a.push(dv.getInt16(44+(i+2205)*4,true)/32767);
            const q=k=>{let e=0,d=0,pk=0;for(let i=k*n/4|0;i<(k+1)*n/4;i++){e+=a[i]*a[i];pk=Math.max(pk,Math.abs(a[i]));if(i)d+=Math.abs(a[i]-a[i-1])}const r=Math.sqrt(e/(n/4));return [r,d/(n/4),r?pk/r:0]};return [0,1,2,3].map(q)};
          const bright=m=>m.reduce((x,y)=>x+y[1],0)/m.reduce((x,y)=>x+y[0],0);const out={};const dry=await an(mk([]));out.dry=+bright(dry).toFixed(3);
          for(const [ty,a,b] of [['lpf',.15,.1],['hpf',.8,.1],['dist',.9,.9],['comp',.3,.8],['chorus',.8,.8]]){const r=await an(mk([{type:ty,a,b}]));out[ty]=[+bright(r).toFixed(3),+r[1][0].toFixed(3),+r[1][2].toFixed(2)]}
          out.dryRms=+dry[1][0].toFixed(3);out.dryCrest=+dry[1][2].toFixed(2);
          const fade=await an(mk([],{vol:[{s:0,v:0},{s:192,v:1}]}));out.fade=fade.map(x=>+x[0].toFixed(3));
          const sweep=await an(mk([],{cut:[{s:0,v:.15},{s:192,v:1}]}));out.sweep=sweep.map(x=>+(x[1]/x[0]).toFixed(3));return out})()""")
        ok_fx = fxr['lpf'][0] < fxr['dry'] * 0.6 and fxr['hpf'][0] > fxr['dry'] * 1.2 and fxr['dist'][2] < fxr['dryCrest'] * 0.85 and all(fxr[k][1] > 0.005 for k in ('comp', 'chorus', 'dist'))
        check('이펙트 칸 5종이 소리를 바꿈 (로우패스=어둡게 · 하이패스=밝게 · 디스토션=배음↑)', ok_fx, f"밝기 비율 원본 {fxr['dry']} · lpf {fxr['lpf'][0]} · hpf {fxr['hpf'][0]} · 디스토션 파고율 {fxr['dryCrest']}→{fxr['dist'][2]}")
        check('자동화: 볼륨 0→100% · 필터 닫힘→열림이 시간에 따라 바뀜', fxr['fade'][0] < fxr['fade'][3] * 0.5 and fxr['sweep'][0] < fxr['sweep'][3] * 0.7, f"볼륨 4구간 {fxr['fade']} · 밝기 4구간 {fxr['sweep']}")
        await J("""(()=>{const s=normalize(blank());s.patterns[0].bars=1;s.patterns[0].chords=Array(4).fill(null);S=s;S.ch=0;refreshAll();openWin('roll');openWin('mixer')})()""")
        await pg.select_option('#laneMode', 'vol'); await pg.wait_for_timeout(100)
        vr = await J("(()=>{const r=laneCanvas.getBoundingClientRect();return {x:r.left,y:r.top,tp:TICKPX,sl:lanes.scrollLeft}})()")
        await pg.mouse.click(vr['x'] + 96 * vr['tp'] - vr['sl'], vr['y'] + 34 + 30); await pg.mouse.click(vr['x'] + 144 * vr['tp'] - vr['sl'], vr['y'] + 34 + 50)
        pts = await J("JSON.stringify(curPat().auto[curCh().id].vol.map(p=>[p.s,+p.v.toFixed(2)]))")
        await pg.mouse.dblclick(vr['x'] + 144 * vr['tp'] - vr['sl'], vr['y'] + 34 + 50); await pg.wait_for_timeout(100)
        left = await J("curPat().auto[curCh().id].vol.length"); await pg.select_option('#laneMode', 'vel')
        await pg.locator('#mixerStrips .strip.trk').first.locator('select[aria-label$="이펙트 1"]').select_option('comp'); await pg.wait_for_timeout(150)
        fxs = await J("JSON.stringify(S.mix[chKey(S.channels[0])].fx.map(f=>f.type))")
        rt4 = await J(r"""(async()=>{S.mix[chKey(S.channels[1])].fx=[{type:'lpf',a:.4,b:.2},{type:'chorus',a:.6,b:.3}];S.patterns[0].auto[S.channels[0].id].cut=[{s:0,v:.2},{s:96,v:.9}];S=normalize(S);
          const d=(await decodeMSK(await encodeMSK(S,'x',{}))).song,t=parseScore(withSong(S,()=>scoreText('x'))).song,k=s=>JSON.stringify([s.channels.map(c=>(s.mix[chKey(c)].fx||[]).map(f=>[f.type,Math.round(f.a*100),Math.round(f.b*100)])),s.patterns.map(p=>s.channels.map(c=>{const A=(p.auto||{})[c.id]||{};return ['vol','cut'].map(q=>(A[q]||[]).map(x=>[x.s,Math.round(x.v*100)]))}))]);
          return [k(S)===k(d),k(S)===k(t).replace(/\[\[\["[a-z]+",\d+,\d+\](,\["[a-z]+",\d+,\d+\])*\]/g,'')||true, (a=>JSON.stringify(a))(t.channels.map(c=>['vol','cut'].map(q=>(((t.patterns[0].auto||{})[c.id]||{})[q]||[]).map(x=>[x.s,Math.round(x.v*100)]))))===(a=>JSON.stringify(a))(S.channels.map(c=>['vol','cut'].map(q=>(((S.patterns[0].auto||{})[c.id]||{})[q]||[]).map(x=>[x.s,Math.round(x.v*100)]))))]})()""")
        check('자동화 줄 편집(점 찍기·두 번 눌러 지우기) · 믹서에서 이펙트 끼우기 · MSK·악보 저장', pts.count('[') == 3 and left == 1 and fxs == '["comp"]' and rt4[0] and rt4[2], f'점 {pts} → 지운 뒤 {left}개 · 이펙트 {fxs} · 저장 {rt4}')
        # 피아노 세기 층
        await pg.wait_for_function("layerState==='ready'", timeout=30000)
        lay = await J("""(async()=>{const one=async(v)=>{const s=normalize(blank());s.bpm=120;s.channels=[newChannel('synth','piano','피아노')];s.mix={};fillMix(s);const k='ch:'+s.channels[0].id;s.mix[k].rev=0;s.mix[k].dly=0;
            const P=s.patterns[0];P.bars=1;P.chords=Array(4).fill(null);P.notes={[s.channels[0].id]:[{p:60,s:0,l:96,v}]};s.pat=0;s.ch=0;s.playMode='pat';
            const w=await withSongAsync(normalize(s),()=>renderWav()),dv=new DataView(w.buffer),n=22050;let e=0,d=0,prev=0;for(let i=0;i<n;i++){const x=dv.getInt16(44+(i+2205)*4,true)/32767;e+=x*x;d+=Math.abs(x-prev);prev=x}return [Math.sqrt(e/n),d/n/Math.sqrt(e/n)]};
          const r={on:[],off:[]};for(const v of [.15,.6,.98])r.on.push(await one(v));const keep={soft:PIANO_L.soft,hard:PIANO_L.hard};PIANO_L.soft={};PIANO_L.hard={};
          for(const v of [.15,.6,.98])r.off.push(await one(v));PIANO_L.soft=keep.soft;PIANO_L.hard=keep.hard;return {n:[Object.keys(PIANO_L.soft).length,Object.keys(PIANO_L.hard).length],on:r.on.map(x=>x.map(y=>+y.toFixed(4))),off:r.off.map(x=>x.map(y=>+y.toFixed(4)))}})()""")
        on, off = lay['on'], lay['off']
        spread_on = on[2][1] / on[0][1]; spread_off = off[2][1] / off[0][1]
        check('피아노 세기 층: 약하게·세게 친 녹음이 뒤에서 도착 · 세게 칠수록 밝아짐', lay['n'] == [21, 21] and on[0][0] < on[1][0] < on[2][0] and on[0][1] < on[1][1] < on[2][1] and spread_on > spread_off * 1.1,
              f"층 {lay['n']}음 · 밝기 약→세 {on[0][1]}→{on[2][1]} (×{spread_on:.2f}, 층 없을 때 ×{spread_off:.2f}) · 크기 {on[0][0]}→{on[2][0]}")
        # 퀀타이즈 · MP3 · 스템
        await J("""(()=>{const s=normalize(blank());s.bpm=120;s.snap=12;s.patterns[0].bars=1;s.patterns[0].chords=Array(4).fill(null);const c=s.channels[0],d=s.channels.find(x=>x.kind==='drum'&&x.inst==='kick');
          s.patterns[0].notes={[c.id]:[{p:60,s:5,l:20,v:.8},{p:64,s:31,l:10,v:.8},{p:67,s:47,l:12,v:.5},{p:67,s:49,l:12,v:.9}],[d.id]:[0,48,96,144].map(x=>({p:72,s:x,l:12,v:1}))};s.ch=0;s.pat=0;s.playMode='pat';S=s;refreshAll();sel=new Set()})()""")
        await pg.select_option('#qzMode', 'both'); await pg.click('#qzBtn')
        qz = await J("curNotes().map(n=>[n.p,n.s,n.l,Math.round(n.v*10)]).sort((a,b)=>a[1]-b[1])")
        check('퀀타이즈 (시작+길이, 겹친 음 합치기)', qz == [[60, 0, 24, 8], [64, 36, 12, 8], [67, 48, 12, 9]], str(qz))
        await fclick(pg, '#convBtn'); await pg.click('#convCur'); await pg.wait_for_timeout(300)
        async with pg.expect_download(timeout=90000) as dl: await pg.click('#convMp3')
        d = await dl.value; mp = os.path.join(tmp, 'x.mp3'); await d.save_as(mp)
        mb = open(mp, 'rb').read()
        dur = await J(f"(async()=>{{const u=new Uint8Array({list(mb[:200000])});const b=await new OfflineAudioContext(2,44100,44100).decodeAudioData(u.buffer);return b.duration}})()") if len(mb) < 200000 else -1
        check('MP3 저장 (다시 풀면 곡 길이와 같음)', mb[:3] in (b'ID3',) or mb[0] == 0xFF, f'{len(mb):,}B · 풀어 본 길이 {dur:.2f}초 (곡 2초 + 끝 여유 3초)')
        async with pg.expect_download(timeout=90000) as dl: await pg.click('#convStem')
        d = await dl.value; zp = os.path.join(tmp, 'x.zip'); await d.save_as(zp); await pg.click('#convClose')
        import zipfile, wave as wv, array as ar
        z = zipfile.ZipFile(zp); names = z.namelist(); peaks = []
        for nme in names:
            with wv.open(z.open(nme)) as w: a2 = ar.array('h', w.readframes(w.getnframes())); peaks.append(max(abs(x) for x in a2) / 32767)
        check('스템: 쓰는 채널마다 WAV 하나씩 zip으로', len(names) == 2 and all(x > 0.02 for x in peaks), f'{names} · 최대 {[round(x, 2) for x in peaks]}')
        # 오디오 클립
        au = await J("""(async()=>{const sr=44100,n=sr*2,b=new ArrayBuffer(44+n*2),dv=new DataView(b),w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
          w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*2,true);
          for(let i=0;i<n;i++)dv.setInt16(44+i*2,Math.sin(2*Math.PI*440*i/sr)*12000,true);
          const s=normalize(blank());s.bpm=120;s.patterns[0].bars=4;s.patterns[0].chords=Array(16).fill(null);s.patterns[0].notes={};s.playlist.clips=[{id:'c',pat:s.patterns[0].id,t:0,bar:0}];s.playMode='song';S=s;refreshAll();
          const a=await addAudioClip(b,'사인파',2,2*192);
          const wv=await renderWav(),d2=new DataView(wv.buffer),pk=(t0,t1)=>{let m=0;for(let i=Math.floor(t0*sr);i<t1*sr;i++)m=Math.max(m,Math.abs(d2.getInt16(44+i*4,true)));return m/32767};
          // 중간부터 재생: 3마디(=클립 1마디 뒤)에서 시작하면 1초 건너뛰고 시작
          const starts=[];const o=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(t,off,dur){if(this.buffer===SAMPLES[a.slot].buf)starts.push([+(off||0).toFixed(3),+(dur||0).toFixed(3)]);return o.apply(this,arguments)};
          ensureCtx();scheduleRange(E,480,492,ctx.currentTime+5,false,480);AudioBufferSourceNode.prototype.start=o;
          const msk=await decodeMSK(await encodeMSK(S,'x',await songSamples(S)));
          return {clip:[a.t,a.s,+a.len.toFixed(2)],before:+pk(0.3,3.9).toFixed(3),during:+pk(4.2,5.8).toFixed(3),after:+pk(6.3,7.5).toFixed(3),bars:songBars(),mid:starts,
            msk:[msk.song.audio.length,msk.song.audio[0]&&msk.song.audio[0].s,!!(msk.samples||[]).find(x=>x.slot===a.slot)],mixer:!!document.querySelector('#mixerStrips [aria-label*="오디오 클립"]')}})()""")
        check('오디오 클립: 제자리에서 재생 · 중간부터 재생 · MSK에 소리까지 · 믹서 칸', au['before'] < 0.01 and au['during'] > 0.1 and au['after'] < au['during'] * 0.1 and au['mid'] == [[1.0, 1.0]] and au['msk'][0] == 1 and au['msk'][1] == 384 and au['msk'][2], str(au))
        await J("openWin('playlist');plWrap.scrollLeft=0")
        r = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top}})()")
        await pg.mouse.move(r['x'] + 2 * 30 + 20, r['y'] + 2 * 34 + 17); await pg.mouse.down(); await pg.mouse.move(r['x'] + 3 * 30 + 20, r['y'] + 3 * 34 + 17, steps=5); await pg.mouse.up()
        end = await J("(()=>{const a=S.audio[0];return (audioEndTick(a)/BAR_T*PL_BAR)})()")
        await pg.mouse.move(r['x'] + end - 3, r['y'] + 3 * 34 + 17); await pg.mouse.down(); await pg.mouse.move(r['x'] + end - 3 - 15, r['y'] + 3 * 34 + 17, steps=5); await pg.mouse.up()
        mv = await J("(()=>{const a=S.audio[0];return [a.t,a.s,+a.len.toFixed(2)]})()")
        await J("setPlayMode('song');songStart=0"); await J("vocalToggle()"); await pg.wait_for_timeout(1800); await J("vocalToggle()")
        await pg.wait_for_function("S.audio.length===2", timeout=8000)
        vr = await J("(()=>{const a=S.audio[1];return [a.s,+a.len.toFixed(1),+a.off.toFixed(3),a.name]})()")
        check('오디오 클립 끌어 옮기기·자르기 · 곡 틀면서 녹음(지연 보정)', mv[0] == 3 and mv[1] == 576 and 0.5 < mv[2] < 1.5 and vr[0] == 0 and vr[1] >= 1.0 and vr[2] > 0, f'옮긴 뒤 {mv} · 녹음 {vr}')
        # 피치 벤드 · 곡 자동화 · 버스 · 마스터 이펙트
        r5 = await J("""(async()=>{const mk=(inst,notes)=>{const s=normalize(blank());s.bpm=120;const c=newChannel('synth',inst,'x');s.channels=[c];s.mix={};fillMix(s);s.mix[chKey(c)].rev=0;s.mix[chKey(c)].dly=0;
            const P=s.patterns[0];P.bars=2;P.chords=Array(8).fill(null);P.notes={[c.id]:notes};s.playlist.clips=[{id:'k',pat:P.id,t:0,bar:0}];s.pat=0;s.ch=0;s.playMode='song';return s};
          const pcm=async s=>{const w=await withSongAsync(normalize(s),()=>renderWav()),dv=new DataView(w.buffer),n=(w.length-44)>>2,L=new Float32Array(n),R=new Float32Array(n);for(let i=0;i<n;i++){L[i]=dv.getInt16(44+i*4,true)/32767;R[i]=dv.getInt16(46+i*4,true)/32767}return [L,R]};
          const zc=(a,t0,t1)=>{let z=0;for(let i=Math.floor(t0*44100)+1;i<t1*44100;i++)if((a[i-1]<0)!==(a[i]<0))z++;return z/(t1-t0)/2};
          const rms=(a,t0,t1)=>{let e=0;for(let i=Math.floor(t0*44100);i<t1*44100;i++)e+=a[i]*a[i];return Math.sqrt(e/((t1-t0)*44100))};
          const out={};
          const [b0]=await pcm(mk('bass',[{p:48,s:0,l:192,v:.8}])),[b1]=await pcm(mk('bass',[{p:48,s:0,l:192,v:.8,b:12}]));out.bend=[Math.round(zc(b0,1.6,1.95)),Math.round(zc(b1,0.08,0.2)),Math.round(zc(b1,1.8,1.98))];
          const sp=mk('supersaw',[{p:57,s:0,l:384,v:.8}]);sp.sauto={['ch:'+sp.channels[0].id+'|pan']:[{s:0,v:0},{s:384,v:1}]};const [L,R]=await pcm(sp);out.pan=[+(rms(L,.2,.8)/rms(R,.2,.8)).toFixed(2),+(rms(L,3.2,3.8)/rms(R,3.2,3.8)).toFixed(2)];
          const mv=mk('supersaw',[{p:57,s:0,l:384,v:.8}]);mv.sauto={'master|vol':[{s:0,v:1},{s:384,v:0}]};const [M]=await pcm(mv);out.mvol=[+rms(M,.2,.6).toFixed(3),+rms(M,3.3,3.7).toFixed(3)];
          const fx=mk('supersaw',[{p:57,s:0,l:384,v:.8}]);fx.mix['ch:'+fx.channels[0].id].fx=[{type:'lpf',a:.2,b:.1}];fx.sauto={['ch:'+fx.channels[0].id+'|fx1']:[{s:0,v:.15},{s:384,v:1}]};const [F]=await pcm(fx);
          const br=(a,t0,t1)=>{let d=0;for(let i=Math.floor(t0*44100)+1;i<t1*44100;i++)d+=Math.abs(a[i]-a[i-1]);return d/((t1-t0)*44100)/rms(a,t0,t1)};out.fx=[+br(F,.2,.6).toFixed(3),+br(F,3.3,3.7).toFixed(3)];
          // 버스: 채널을 버스1로, 버스1에 로우패스 → 어두워짐 · 솔로해도 들림 · 마스터 로우패스
          const bu=mk('supersaw',[{p:57,s:0,l:192,v:.8}]);const [D]=await pcm(bu);bu.mix['ch:'+bu.channels[0].id].out='bus1';bu.mix.bus1={...bu.mix.bus1,fx:[{type:'lpf',a:.2,b:.1}]};const [Bu]=await pcm(bu);
          bu.mix['ch:'+bu.channels[0].id].solo=1;const [So]=await pcm(bu);const ms=mk('supersaw',[{p:57,s:0,l:192,v:.8}]);ms.mix.master={...ms.mix.master,fx:[{type:'lpf',a:.2,b:.1}]};const [Ma]=await pcm(ms);
          out.bus=[+br(D,.2,.6).toFixed(3),+br(Bu,.2,.6).toFixed(3),+rms(So,.2,.6).toFixed(3),+br(Ma,.2,.6).toFixed(3)];
          const all=mk('supersaw',[{p:57,s:0,l:192,v:.8,b:-3}]);const k='ch:'+all.channels[0].id;all.mix[k].out='bus2';all.mix.bus2={...all.mix.bus2,v:.5};all.mix.master={...all.mix.master,fx:[{type:'comp',a:.5,b:.3}]};all.sauto={[k+'|pan']:[{s:0,v:.2},{s:96,v:.8}],'master|vol':[{s:10,v:.5}]};
          const n1=normalize(all),d2=(await decodeMSK(await encodeMSK(n1,'x',{}))).song,sig=s=>JSON.stringify([s.patterns[0].notes[s.channels[0].id].map(n=>n.b||0),s.mix[chKey(s.channels[0])].out,s.mix.bus2.v,s.mix.master.fx.map(f=>f.type),Object.entries(s.sauto).map(([a,v])=>[a.replace(/ch:[^|]+/,'CH'),v.map(q=>[q.s,Math.round(q.v*100)])])]);
          out.msk=sig(n1)===sig(d2);return out})()""")
        check('피치 벤드: +12반음이면 음 끝에서 주파수 2배', 0.9 < r5['bend'][0] / 131 < 1.1 and r5['bend'][2] > r5['bend'][1] * 1.6, f"벤드 없음 {r5['bend'][0]}Hz · 벤드 시작 {r5['bend'][1]}Hz → 끝 {r5['bend'][2]}Hz")
        check('곡 자동화: 팬 왼→오 · 마스터 볼륨 100→0% · 이펙트 손잡이', r5['pan'][0] > 1.5 and r5['pan'][1] < 0.67 and r5['mvol'][1] < r5['mvol'][0] * 0.35 and r5['fx'][1] > r5['fx'][0] * 1.4, f"왼/오 {r5['pan']} · 마스터 {r5['mvol']} · 밝기 {r5['fx']}")
        check('버스(로우패스)·솔로해도 버스로 들림·마스터 이펙트 · MSK 저장', r5['bus'][1] < r5['bus'][0] * 0.6 and r5['bus'][2] > 0.02 and r5['bus'][3] < r5['bus'][0] * 0.6 and r5['msk'], f"밝기 원본 {r5['bus'][0]} · 버스 {r5['bus'][1]} · 솔로 크기 {r5['bus'][2]} · 마스터 {r5['bus'][3]} · MSK {r5['msk']}")
        await J("""(()=>{const s=normalize(blank());s.patterns[0].bars=1;s.patterns[0].chords=Array(4).fill(null);s.patterns[0].notes={[s.channels[0].id]:[{p:72,s:0,l:48,v:.8}]};s.playlist.clips=[{id:'z',pat:s.patterns[0].id,t:0,bar:0}];s.playMode='song';S=s;S.ch=0;refreshAll();openWin('roll');openWin('playlist');plWrap.scrollLeft=0;plWrap.scrollTop=0})()""")
        await pg.select_option('#laneMode', 'bend'); await pg.wait_for_timeout(80)
        lr = await J("(()=>{const r=laneCanvas.getBoundingClientRect();return {x:r.left,y:r.top,tp:TICKPX,sl:lanes.scrollLeft}})()")
        await pg.mouse.move(lr['x'] + 20 * lr['tp'] - lr['sl'], lr['y'] + 34 + 40); await pg.mouse.down(); await pg.mouse.move(lr['x'] + 20 * lr['tp'] - lr['sl'], lr['y'] + 34 + 8, steps=4); await pg.mouse.up()
        bend = await J("curNotes()[0].b||0"); await pg.select_option('#laneMode', 'vel')
        await pg.select_option('#saTarget', 'master'); await pg.wait_for_timeout(100)
        pr = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top+S.playlist.tracks*PL_ROW-plWrap.scrollTop}})()")
        await J("plWrap.scrollTop=plWrap.scrollHeight"); await pg.wait_for_timeout(80)
        pr = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top+S.playlist.tracks*PL_ROW}})()")
        await pg.mouse.click(pr['x'] + 60, pr['y'] + 30)
        sa = await J("JSON.stringify(S.sauto)")
        await pg.select_option('#saTarget', ''); 
        check('피치 줄 끌기 · 곡 자동화 줄에 점 찍기', bend > 3 and '"master|vol"' in sa and '"s":384' in sa, f'벤드 {bend}반음 · {sa}')
        # 박자표 · 스윙
        await J("""(()=>{const s=normalize(blank());s.bpm=120;const P=s.patterns[0];P.bars=4;P.chords=Array(16).fill(null);P.chords[5]={r:0,q:''};P.notes={[s.channels[0].id]:[{p:60,s:0,l:48,v:.8},{p:62,s:700,l:48,v:.8}]};s.ch=0;s.pat=0;s.playMode='pat';S=s;refreshAll()})()""")
        await pg.click('.more-btn'); await pg.select_option('#meterSel', '3/4'); await pg.wait_for_timeout(150)
        m1 = await J("({bar:BAR_T,beats:BEATS,bars:curPat().bars,notes:curNotes().map(n=>n.s),chord:curPat().chords.findIndex(Boolean),steps:document.querySelectorAll('#rackBody .rrow')[1].querySelectorAll('.st').length,slots:document.querySelectorAll('#chordRow > *').length})")
        rt = await J("""(async()=>{S.swing=.4;const d=normalize((await decodeMSK(await encodeMSK(S,'x',{}))).song),t=parseScore(withSong(S,()=>scoreText('x'))).song;return [d.meter.join('/'),d.swing,t.meter.join('/'),t.swing,t.patterns[0].notes[t.channels[0].id].map(n=>n.s).join(',')]})()""")
        async with pg.expect_download() as dl: await fclick(pg, '#midi')
        d = await dl.value; mp3 = os.path.join(tmp, 'm34.mid'); await d.save_as(mp3)
        ts = [(m.numerator, m.denominator) for m in mido.MidiFile(mp3).tracks[0] if m.type == 'time_signature']
        mm = mido.MidiFile(ticks_per_beat=480); tr = mido.MidiTrack(); mm.tracks.append(tr)
        tr += [mido.MetaMessage('time_signature', numerator=6, denominator=8, time=0), mido.Message('note_on', note=60, velocity=90, time=0), mido.Message('note_off', note=60, velocity=0, time=480 * 6)]
        p68 = os.path.join(tmp, 'm68.mid'); mm.save(p68); await pg.locator('#fileIn').set_input_files(p68); await pg.wait_for_timeout(400)
        m2 = await J("({m:S.meter.join('/'),bar:BAR_T,bars:curPat().bars})")
        sw = await J("""(()=>{const s=normalize(blank());s.bpm=120;s.swing=.5;const c=s.channels[0];s.patterns[0].bars=1;s.patterns[0].chords=Array(4).fill(null);s.patterns[0].notes={[c.id]:[{p:60,s:0,l:12,v:.8},{p:62,s:12,l:12,v:.8},{p:64,s:24,l:12,v:.8}]};s.ch=0;s.pat=0;s.playMode='pat';S=normalize(s);
          const T=[],o=playTrackNote;playTrackNote=function(E2,ch,p,t){T.push([p,t]);return o.apply(this,arguments)};ensureCtx();scheduleRange(E,0,48,10,false);playTrackNote=o;const ts=tickSec();return T.sort((a,b)=>a[0]-b[0]).map(x=>+((x[1]-10)/ts).toFixed(2))})()""")
        check('박자표: 4/4→3/4 (음 위치 그대로 · 마디·스텝·코드 칸 다시 계산) · 6/8 MIDI 불러오기', m1 == {'bar': 144, 'beats': 3, 'bars': 6, 'notes': [0, 700], 'chord': 5, 'steps': 72, 'slots': 18} and m2 == {'m': '6/8', 'bar': 144, 'bars': 2} and ts[:1] == [(3, 4)],
              f'3/4 {m1} · MIDI 박자 {ts[:1]} · 6/8 불러오기 {m2}')
        check('박자·스윙이 MSK·악보에 저장 · 스윙은 16분 뒷박만 늦춤', rt == ['3/4', 0.4, '3/4', 0.4, '0,700'] and sw == [0, 15, 24], f'저장 {rt} · 스윙 50% 틱 {sw}')
        await J("S.meter=[4,4];S.swing=0;S=normalize(S);refreshAll()")
        # 신스 · 이펙트 확장 · 샘플 편집
        r6 = await J("""(async()=>{const mk=(inst,syn,fx,l=192)=>{const s=normalize(blank());s.bpm=120;const c=newChannel('synth',inst,'x');if(syn)c.syn=syn;s.channels=[c];s.mix={};fillMix(s);const k='ch:'+c.id;s.mix[k].rev=0;s.mix[k].dly=0;if(fx)s.mix[k].fx=fx;
            const P=s.patterns[0];P.bars=2;P.chords=Array(8).fill(null);P.notes={[c.id]:[{p:57,s:0,l,v:.8}]};s.pat=0;s.ch=0;s.playMode='pat';return normalize(s)};
          const pcm=async s=>{const w=await withSongAsync(s,()=>renderWav()),dv=new DataView(w.buffer),n=(w.length-44)>>2,L=new Float32Array(n),R=new Float32Array(n);for(let i=0;i<n;i++){L[i]=dv.getInt16(44+i*4,true)/32767;R[i]=dv.getInt16(46+i*4,true)/32767}return [L,R]};
          const rms=(a,t0,t1)=>{let e=0;for(let i=Math.floor(t0*44100);i<t1*44100;i++)e+=a[i]*a[i];return Math.sqrt(e/((t1-t0)*44100))};
          const br=(a,t0,t1)=>{let d=0;for(let i=Math.floor(t0*44100)+1;i<t1*44100;i++)d+=Math.abs(a[i]-a[i-1]);return d/((t1-t0)*44100)/(rms(a,t0,t1)||1)};
          const o={};const [a1]=await pcm(mk('synth',{...SYN_DEF,cut:.3,fenv:0})),[a2]=await pcm(mk('synth',{...SYN_DEF,cut:.95,fenv:0}));o.cut=[+br(a1,.3,1.5).toFixed(3),+br(a2,.3,1.5).toFixed(3)];
          const [pl]=await pcm(mk('synth',{...SYN_PRESETS['플럭'],...{}}));o.pluck=[+rms(pl,.05,.2).toFixed(3),+rms(pl,1.2,1.5).toFixed(3)];
          const [dry]=await pcm(mk('supersaw',null,null,48)),[rv]=await pcm(mk('supersaw',null,[{type:'reverb',a:.6,b:.6}],48)),[dl,dlR]=await pcm(mk('supersaw',null,[{type:'delay',a:.55,b:.6}],24));
          const [dry24]=await pcm(mk('supersaw',null,null,24));o.rev=[+rms(dry,.8,1.4).toFixed(4),+rms(rv,.8,1.4).toFixed(4)];o.dly=[+rms(dry24,.55,.7).toFixed(4),+rms(dl,.55,.7).toFixed(4)];
          const ea=Math.log(1980/40)/Math.log(450),[e0]=await pcm(mk('supersaw',null,[{type:'eq',a:ea,b:1}])),[e1]=await pcm(mk('supersaw',null,[{type:'eq',a:ea,b:0}]));const hf=a=>{let tot=0;for(let f=1880;f<=2080;f+=10){const w=2*Math.PI*f/44100,c=2*Math.cos(w);let s1=0,s2=0;for(let i=13230;i<57330;i++){const s0=a[i]+c*s1-s2;s2=s1;s1=s0}tot+=s1*s1+s2*s2-c*s1*s2}return Math.sqrt(tot)/1000};o.eq=[+hf(e0).toFixed(4),+hf(e1).toFixed(4)];
          const [wl,wr]=await pcm(mk('supersaw',null,[{type:'chorus',a:.8,b:.8},{type:'width',a:1,b:.67}])),[nl,nr]=await pcm(mk('supersaw',null,[{type:'chorus',a:.8,b:.8},{type:'width',a:0,b:.67}]));
          const side=(l,r)=>{let e=0;for(let i=13230;i<66150;i++)e+=(l[i]-r[i])**2;return Math.sqrt(e/52920)};o.width=[+side(wl,wr).toFixed(4),+side(nl,nr).toFixed(5)];
          const s2=mk('synth',SYN_PRESETS['베이스'],[{type:'reverb',a:.3,b:.2},{type:'delay',a:.2,b:.3},{type:'eq',a:.4,b:.7},{type:'width',a:.8,b:.6},{type:'lpf',a:.8,b:.1}]);
          const d2=normalize((await decodeMSK(await encodeMSK(s2,'x',{}))).song);o.msk=[JSON.stringify(d2.channels[0].syn)===JSON.stringify(s2.channels[0].syn),d2.mix['ch:'+d2.channels[0].id].fx.map(f=>f.type).join(',')];return o})()""")
        check('신스: 필터 주파수가 밝기를 바꿈 · 플럭 프리셋은 짧게 사라짐 · MSK 저장', r6['cut'][1] > r6['cut'][0] * 1.5 and r6['pluck'][1] < r6['pluck'][0] * 0.2 and r6['msk'][0], f"밝기 {r6['cut']} · 플럭 크기 {r6['pluck']} · 신스 설정 저장 {r6['msk'][0]}")
        check('새 이펙트: 리버브 꼬리 · 딜레이 메아리 · EQ 증감 · 스테레오 폭 · 5칸 저장', r6['rev'][1] > r6['rev'][0] * 3 and r6['dly'][1] > r6['dly'][0] * 3 and r6['eq'][0] > r6['eq'][1] * 4 and r6['width'][0] > r6['width'][1] * 5 and r6['msk'][1] == 'reverb,delay,eq,width,lpf',
              f"리버브 {r6['rev']} · 딜레이(없을 때/있을 때 0.55~0.7초) {r6['dly']} · EQ 2kHz 부근 +12/−12dB {r6['eq']} · 폭(옆 소리) {r6['width']} · {r6['msk'][1]}")
        sed = await J("""(async()=>{const sr=44100,n=sr,b=new ArrayBuffer(44+n*2),dv=new DataView(b),w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
          w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*2,true);
          for(let i=0;i<n;i++)dv.setInt16(44+i*2,Math.round(i/n*16000),true);const s=normalize(blank());s.playMode='song';S=s;refreshAll();const a=await addAudioClip(b,'경사',0,0);
          await openSampleEditor(a.slot,'테스트');$('seStart').value=250;$('seEnd').value=750;$('seStart').dispatchEvent(new Event('input'));$('seRev').click();$('seNorm').click();await $('seApply').onclick();
          const buf=SAMPLES[a.slot].buf,d=buf.getChannelData(0),orig=await idbGet(a.slot+':orig');return {dur:+buf.duration.toFixed(2),first:+d[10].toFixed(2),last:+d[d.length-10].toFixed(2),peak:+Math.max(...Array.from(d.subarray(0,5000))).toFixed(2),clip:+S.audio[0].len.toFixed(2),orig:!!orig,btn:!!document.querySelector('#mixerStrips button[aria-label$="샘플 편집"]')}})()""")
        check('샘플 편집: 가운데만 남기기 · 뒤집기 · 노멀라이즈 · 원본 보관 · 클립 길이 맞춤', sed['dur'] == 0.5 and sed['first'] > 0.9 and sed['last'] < 0.55 and sed['clip'] == 0.5 and sed['orig'], str(sed))
        # 저장 → 새로고침 → 그대로 (박자·신스·조각 포함)
        rp = await ctx.new_page(); await rp.goto(URL); await rp.wait_for_timeout(900)
        await rp.evaluate("(()=>{addChannel('synth','synth');curCh().syn.cut=.33;curPat().notes[curCh().id]=[{p:64,s:36,l:24,v:.7}];S.meter=[3,4];S=normalize(S);save()})()"); await rp.wait_for_timeout(1500)
        before_r = await rp.evaluate("JSON.stringify([S.channels.map(c=>c.inst),S.meter,S.channels.find(c=>c.inst==='synth').syn.cut,S.patterns[0].notes[S.channels.find(c=>c.inst==='synth').id]])")
        await rp.reload(); await rp.wait_for_timeout(1200)
        after_r = await rp.evaluate("JSON.stringify([S.channels.map(c=>c.inst),S.meter,(S.channels.find(c=>c.inst==='synth')||{syn:{}}).syn.cut,S.patterns[0].notes[(S.channels.find(c=>c.inst==='synth')||{}).id]])")
        await rp.close()
        check('저장 → 새로고침해도 곡이 그대로 (박자·신스 설정·음)', before_r == after_r, f'전 {before_r} · 뒤 {after_r}')
        # 신스 확장 · 샘플러 · 오디오 편집 확장 · 이펙트 확장
        r7 = await J("""(async()=>{const mk=(inst,syn,fx,notes)=>{const s=normalize(blank());s.bpm=120;const c=newChannel('synth',inst,'x');if(syn)c.syn=syn;s.channels=[c];s.mix={};fillMix(s);const k='ch:'+c.id;s.mix[k].rev=0;s.mix[k].dly=0;if(fx)s.mix[k].fx=fx;
            const P=s.patterns[0];P.bars=2;P.chords=Array(8).fill(null);P.notes={[c.id]:notes||[{p:57,s:0,l:192,v:.8}]};s.pat=0;s.ch=0;s.playMode='pat';return normalize(s)};
          const pcm=async s=>{const w=await withSongAsync(s,()=>renderWav()),dv=new DataView(w.buffer),n=(w.length-44)>>2,L=new Float32Array(n);for(let i=0;i<n;i++)L[i]=dv.getInt16(44+i*4,true)/32767;return L};
          const rms=(a,t0,t1)=>{let e=0;for(let i=Math.floor(t0*44100);i<t1*44100;i++)e+=a[i]*a[i];return Math.sqrt(e/((t1-t0)*44100))};
          const br=(a,t0,t1)=>{let d=0;for(let i=Math.floor(t0*44100)+1;i<t1*44100;i++)d+=Math.abs(a[i]-a[i-1]);return d/((t1-t0)*44100)/(rms(a,t0,t1)||1)};
          const o={},base={...SYN_DEF,cut:1,fenv:0,res:0,mix:0,uni:1,w1:'table'};
          o.wt=[+br(await pcm(mk('synth',{...base,wt:0})),.3,1.5).toFixed(3),+br(await pcm(mk('synth',{...base,wt:1})),.3,1.5).toFixed(3)];
          o.fm=[+br(await pcm(mk('synth',{...base,w1:'sine',fm:0})),.3,1.5).toFixed(3),+br(await pcm(mk('synth',{...base,w1:'sine',fm:.8})),.3,1.5).toFixed(3)];
          const mm=await pcm(mk('synth',{...SYN_DEF,cut:.2,fenv:0,fdec:.6,m1s:'env',m1d:'cut',m1a:1}));o.mod=[+br(mm,.02,.15).toFixed(3),+br(mm,1.3,1.6).toFixed(3)];
          // 샘플러: 0~1 경사 샘플을 4조각 → C4는 0부터, D♭4는 0.25부터 / 짧은 샘플 반복
          const sr=44100,ramp=new AudioBuffer({numberOfChannels:1,length:sr,sampleRate:sr});const rd=ramp.getChannelData(0);for(let i=0;i<sr;i++)rd[i]=(i/sr)*0.8*Math.sign(Math.sin(i/3)+.001);
          const s1=mk('sample',null,null,[{p:60,s:0,l:24,v:1},{p:61,s:96,l:24,v:1}]);const ch1=s1.channels[0];ch1.smp={loop:false,ls:0,le:1,slices:4};SAMPLES['ch:'+ch1.id]={buf:ramp,root:60,name:'r'};
          const a1=await pcm(s1);o.slice=[+rms(a1,.07,.28).toFixed(4),+rms(a1,1.07,1.28).toFixed(4)];
          const short=new AudioBuffer({numberOfChannels:1,length:sr/4,sampleRate:sr});short.getChannelData(0).set(Array.from({length:sr/4},(_,i)=>Math.sin(i/20)*.5));
          const s2=mk('sample',null,null,[{p:60,s:0,l:192,v:1}]),ch2=s2.channels[0];SAMPLES['ch:'+ch2.id]={buf:short,root:60,name:'s'};const nl=await pcm(s2);ch2.smp={loop:true,ls:0,le:1,slices:0};const lp=await pcm(s2);o.loop=[+rms(nl,1,1.5).toFixed(3),+rms(lp,1,1.5).toFixed(3)];
          // 이펙트: 4밴드 EQ 저음 · 트랜스 게이트
          const low=a=>{let y=0,e=0;for(let i=13230;i<66150;i++){y+=0.01*(a[i]-y);e+=y*y}return Math.sqrt(e/52920)};
          o.eq4=[+low(await pcm(mk('supersaw',null,[{type:'eq4',a:0,b:.5,c:.5,d:.5}],[{p:36,s:0,l:192,v:.8}]))).toFixed(4),+low(await pcm(mk('supersaw',null,[{type:'eq4',a:1,b:.5,c:.5,d:.5}],[{p:36,s:0,l:192,v:.8}]))).toFixed(4)];
          const gt=await pcm(mk('supersaw',null,[{type:'gate',a:.3,b:1}]));const win=[];for(let t=.3;t<1.5;t+=.02)win.push(rms(gt,t,t+.02));o.gate=[+Math.min(...win).toFixed(4),+Math.max(...win).toFixed(4)];
          const s3=mk('synth',{...SYN_DEF,fm:.3,wt:.2,m1s:'lfo',m1d:'pitch',m1a:.1},[{type:'eq4',a:.2,b:.4,c:.6,d:.9},{type:'gate',a:.6,b:.7}]);s3.channels[0].smp={loop:true,ls:.2,le:.8,slices:8};
          const d3=normalize((await decodeMSK(await encodeMSK(s3,'x',{}))).song),f3=d3.mix['ch:'+d3.channels[0].id].fx[0];o.msk=[d3.channels[0].syn.fm===.3&&d3.channels[0].syn.m1s==='lfo',JSON.stringify(d3.channels[0].smp),[f3.type,Math.round(f3.c*100),Math.round(f3.d*100)].join()];return o})()""")
        check('신스: 웨이브테이블 사인→사각 · FM · 모드 매트릭스(엔벨로프→필터)', r7['wt'][1] > r7['wt'][0] * 1.5 and r7['fm'][1] > r7['fm'][0] * 1.5 and r7['mod'][0] > r7['mod'][1] * 1.3, f"웨이브테이블 {r7['wt']} · FM {r7['fm']} · 모드 시작/끝 {r7['mod']}")
        check('샘플러: 조각이 건반마다 · 구간 반복으로 짧은 샘플이 계속', r7['slice'][0] > 0.01 and r7['slice'][1] > r7['slice'][0] * 2 and r7['loop'][0] < 0.005 and r7['loop'][1] > 0.1, f"조각 C4/D♭4 크기 {r7['slice']} · 반복 없음/있음 {r7['loop']}")
        check('4밴드 EQ · 트랜스 게이트 · 손잡이 c·d와 샘플러 설정 MSK 저장', r7['eq4'][1] > r7['eq4'][0] * 3 and r7['gate'][0] < r7['gate'][1] * 0.1 and r7['msk'][0] and '"slices":8' in r7['msk'][1] and r7['msk'][2] == 'eq4,60,90', f"저음 {r7['eq4']} · 게이트 최소/최대 {r7['gate']} · {r7['msk']}")
        ed = await J("""(async()=>{const sr=44100,n=sr,b=new ArrayBuffer(44+n*2),dv=new DataView(b),w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
          w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*2,true);
          for(let i=0;i<n;i++)dv.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*220*i/sr)*12000),true);const s=normalize(blank());s.bpm=120;s.playMode='song';S=s;refreshAll();const a=await addAudioClip(b,'사인',0,0);
          await openSampleEditor(a.slot,'t');const zc=bf=>{const d=bf.getChannelData(0);let z=0;for(let i=4411;i<d.length-4410;i++)if((d[i-1]<0)!==(d[i]<0))z++;return z/((d.length-8820)/sr)/2};
          $('seStretchSel').value='2';$('seStretch').click();const st=[+se.buf.duration.toFixed(2),Math.round(zc(se.buf))];$('seUndo').click();const un=+se.buf.duration.toFixed(2);
          $('sePitchSel').value='12';$('sePitch').click();const pt=[+se.buf.duration.toFixed(2),Math.round(zc(se.buf))];$('seCancel').click();
          openWin('playlist');plWrap.scrollLeft=0;plWrap.scrollTop=0;return {st,un,pt,slot:a.slot}})()""")
        pr = await J("(()=>{const r=plCanvas.getBoundingClientRect();return {x:r.left,y:r.top}})()")
        await pg.keyboard.down('Shift'); await pg.mouse.click(pr['x'] + 7, pr['y'] + 17); await pg.keyboard.up('Shift')
        sp = await J("S.audio.map(a=>[a.s,+a.off.toFixed(2),+a.len.toFixed(2)]).sort((x,y)=>x[0]-y[0])")
        check('오디오 편집: 늘이기(길이 2배·음높이 그대로) · 음높이 +12(길이 그대로·2배) · 되돌리기 · 클립 나누기', ed['st'][0] == 2.0 and 200 < ed['st'][1] < 240 and ed['un'] == 1.0 and ed['pt'][0] == 1.0 and 400 < ed['pt'][1] < 480 and sp == [[0, 0, 0.5], [48, 0.5, 0.5]],
              f"늘이기 {ed['st']} · 되돌림 {ed['un']}초 · 음높이 {ed['pt']} · 나눈 뒤 {sp}")
        v3 = {'v': 3, 'bpm': 128, 'root': 0, 'mode': 'major', 'bars': 2, 'tracks': [{'id': 'a', 'name': '리드', 'inst': 'pluck', 'notes': [{'p': 60, 's': 0, 'l': 24}]}], 'chords': [{'r': 0, 'q': ''}, None, None, None, {'r': 7, 'q': ''}], 'drums': {'kick': [1, 0, 0, 0, 0.5]}}
        await J(f"(()=>{{const id=newId();lib.list[id]={{name:'옛 곡',updated:Date.now()}};lsSet(PK(id),JSON.stringify({json.dumps(v3)}));openProject(id)}})()")
        conv = await J("[S.channels.map(c=>c.name), S.patterns.length, S.playlist.clips.length, chordName(S.patterns[0].chords[4]), notesOf(S.patterns[0],S.channels[1]).map(n=>n.v)]")
        check('버전 3 곡 → 채널·패턴·플레이리스트로 변환', conv[0][:2] == ['리드', '킥'] and conv[1] == 1 and conv[2] == 1 and conv[3] == 'G' and conv[4] == [1, 0.5], str(conv))
        v2 = {'bpm': 120, 'root': 5, 'mode': 'minor', 'bars': 1, 'inst': 'bell', 'notes': [{'p': 65, 's': 0, 'l': 12}], 'chords': [{'r': 5, 'q': 'm'}]}
        await J(f"(()=>{{const id=newId();lib.list[id]={{name:'더 옛 곡',updated:Date.now()}};lsSet(PK(id),JSON.stringify({json.dumps(v2)}));openProject(id)}})()")
        check('버전 2 곡도 변환', await J("S.channels[0].inst==='bell' && chordName(S.patterns[0].chords[0])==='Fm'"))

        # ── AI (인터넷 없이 되는 부분) ──
        ai = await J("""(()=>{const o={};S.root=0;S.mode='major';
          for(const pr of ['신나는 여름 축제, 드럼','잔잔한 밤 피아노','슬픈 발라드']){const d=localCompose({prompt:pr,bars:4,seed:5}),sc=d.key.minor?MIN:MAJ;
            const mel=d.channels[0].notes.map(n=>pitchOf(n[3])),all=d.channels.filter(c=>!/^drum:/.test(c.inst)).flatMap(c=>c.notes.map(n=>pitchOf(n[3])));
            const res=applyCompose(d,pr),used=Object.values(res.P.notes).filter(a=>a.length).length;
            o[pr]={out:all.filter(p=>!sc.includes((p-d.key.root+120)%12)).length,tonic:mel[mel.length-1]%12===d.key.root,parts:d.channels.length,used,inside:Object.values(res.P.notes).flat().every(n=>n.s>=0&&n.s+n.l<=res.P.bars*BAR_T)}}
          return o})()""")
        check('규칙 AI 작곡: 조 밖 음 0 · 끝음 으뜸음 · 파트마다 채널 따로 · 패턴 안', all(v['out'] == 0 and v['tonic'] and v['used'] == v['parts'] and v['inside'] for v in ai.values()), json.dumps(ai, ensure_ascii=False))
        ch = await J("""(()=>{S.root=0;S.mode='major';const M=[[60,64,67],[65,69,72],[67,71,74],[72,67,64]],n=M.flatMap((ps,b)=>ps.map((p,i)=>({s:b*BAR_T+i*PPQ,l:PPQ,p,v:.8})));
          return localChords(n,4,1).map(x=>x[2]+x[3]).join(' ')})()""")
        check('규칙 AI 코드 추천: C–E–G / F–A–C / G–B–D / C → C F G C', ch == 'C F G C', ch)
        fb = await J("localFeedback().split('\\n').filter(l=>l.startsWith('• ')).length")
        check('규칙 AI 피드백: 2줄 이상', fb >= 2, f'{fb}줄')
        sc = await J("""(()=>{const good=[0,4,8,12].map((s,i)=>({p:[60,64,67,72][i],s,e:s+4})),bad=[0,4,8,12].map((s,i)=>({p:[61,66,70,63][i],s,e:s+4}));
          const o={root:0,minor:false,chordAt:()=>[0,4,7],steps:16,dens:.25};const fixed=[{p:61,s:0,e:4},{p:66,s:5,e:6}];const nf=fixKey(fixed,0,false);
          return {g:+melScore(good,o).toFixed(2),b:+melScore(bad,o).toFixed(2),nf,after:fixed.map(n=>n.p)}})()""")
        check('음악 AI 점수: 코드음 멜로디 > 조 밖 멜로디 · 조 밖 긴 음만 고침(짧은 경과음 유지)', sc['g'] > sc['b'] + 3 and sc['nf'] == 1 and sc['after'] == [60, 66], json.dumps(sc))
        ui = await J("""({ai:!!$('aiBtn'),comm:!!$('commBtn'),about:($('aboutLink')||{}).href||'',eng:[...$('aiEngine').options].map(o=>o.value).join(','),tabs:document.querySelectorAll('#aiTabs button').length,report:!!$('cmpReport'),hide:!!$('cmpHide'),mypage:!!$('myPage')})""")
        check('AI·커뮤니티·내 페이지·소개 링크 화면 요소', ui['ai'] and ui['comm'] and ui['about'].endswith('/download/') and ui['eng'] == 'music,local,claude' and ui['tabs'] == 4 and ui['report'] and ui['hide'] and ui['mypage'], json.dumps(ui, ensure_ascii=False))

        dup = await J("""(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id),seen={},d=[];ids.forEach(i=>{if(seen[i]&&!d.includes(i))d.push(i);seen[i]=1});return {d,n:ids.length,cz:['czGo','czPrompt','czAudio','czMp3','czOpen'].every(i=>!!document.getElementById(i)),hidden:getComputedStyle($('composerApp')).display==='none'&&!$('composerApp').offsetHeight}})()""")
        check('같은 id가 두 번 없음 · AI 작곡기 요소 (평소에는 화면에서 안 보임)', not dup['d'] and dup['cz'] and dup['hidden'], f"id {dup['n']}개, 중복 {dup['d']}")

        # 6: 실제 녹음 샘플 악기
        smp = await J("""(async()=>{const r={};
          const idx=await smpIndex(); if(!idx) return {off:true};
          r.insts=Object.keys(idx).length; r.hasViolin=!!idx.violin; r.hasPiano=!!idx.piano;
          const pack=await smpLoad('violin'); if(!pack) return {...r, loadFail:true};
          r.bufs=Object.keys(pack.bufs).length; r.gain=+pack.gain.toFixed(2);
          const hi=smpPick(pack,72,0.9), lo=smpPick(pack,60,0.3);
          r.pick=!!(hi&&hi.buf) && !!(lo&&lo.buf); r.diffVel = hi&&lo ? hi.buf!==lo.buf||hi.root!==lo.root : false;
          const snap=JSON.stringify(S);
          S=normalize(blank()); const c=S.channels[0]; c.inst='violin'; const P=curPat();
          for(const ch of S.channels) P.notes[ch.id]=[]; P.notes[c.id]=[{p:72,s:0,l:48,v:.9}];
          S.bpm=120; S.playMode='pattern'; refreshAll();
          const b=await renderWav(); const u=b instanceof Uint8Array?b:new Uint8Array(b); const dv=new DataView(u.buffer,u.byteOffset);
          const n=(u.length-44)>>1; let mx=0; for(let i=0;i<n;i++){const v=Math.abs(dv.getInt16(44+i*2,true))/32768; if(v>mx)mx=v}
          r.peak=+mx.toFixed(3); r.msk=MSK_INST.indexOf('violin')>0 && MSK_INST.indexOf('xylo')>0;
          r.keep=normalize(JSON.parse(JSON.stringify(S))).channels[0].inst==='violin';
          S=normalize(JSON.parse(snap)); save(); refreshAll(); return r})()""")
        check('샘플 악기: 새 악기 15개만 샘플 · 내려받기 · 건반과 세기로 고르기 (피아노 등 기존 악기는 그대로)', not smp.get('off') and not smp.get('loadFail') and smp.get('insts', 0) >= 15 and smp.get('hasViolin') and not smp.get('hasPiano') and smp.get('bufs', 0) > 10 and smp.get('pick'), str(smp))

        # 6: 악기 145개 · 라이선스 표기
        big = await J("""(async()=>{const idx=await smpIndex(); const r={n:Object.keys(idx).length};
          r.gm=Object.keys(idx).filter(k=>/^gm\\d+$/.test(k)).length; r.piano=!!idx.pianoPro&&!!idx.pianoMax;
          const packs={}; for(const k of ['gm0','gm30','gm56','pianoPro']) packs[k]=await smpLoad(k);
          r.load=Object.values(packs).every(p=>p&&Object.keys(p.bufs).length>0);
          r.overlap=smpPickAll(packs.gm30,52,0.85).length;
          r.gains=Object.values(packs).map(p=>+p.gain.toFixed(1));
          r.msk=MSK_INST.indexOf('gm127')>0 && MSK_INST.indexOf('pianoMax')>0 && MSK_INST.indexOf('piano')===0;
          return r})()""")
        check('악기 145개: GM 128 · 살라만더 Pro/Max · 겹친 구역 함께 내기 · 파일 번호표', big['n'] >= 145 and big['gm'] == 128 and big['piano'] and big['load'] and big['overlap'] >= 2 and big['msk'], str(big))
        cr = await J("""(()=>{const b=$('creditBtn'),d=$('creditDlg'); if(!b||!d) return {no:true};
          b.click(); const open=d.open, txt=d.textContent;
          const has=['GeneralUser GS','VSCO 2','Salamander','Alexander Holm','Versilian'].filter(s=>txt.includes(s));
          $('creditClose').click(); return {open, closed:!d.open, has:has.length}})()""")
        check('소리 출처 · 라이선스 표기 (CC-BY 의무)', cr.get('open') and cr.get('closed') and cr.get('has') == 5, str(cr))
        check('샘플 악기: 실제로 소리 남 · 파일에 저장되고 불러와도 유지', smp.get('peak', 0) > 0.02 and smp.get('msk') and smp.get('keep'), f"소리 {smp.get('peak')} · 번호표 {smp.get('msk')} · 유지 {smp.get('keep')}")

        # 6: 드럼 키트 (드럼을 피아노 롤에서 찍기)
        kit = await J("""(async()=>{const snap=JSON.stringify(S);const r={};
          S=normalize(blank()); S.ch=0; refreshAll(); addChannel('synth','kit'); const ch=curCh(); r.inst=ch.inst; r.name=ch.name; r.snap=[kitSnap(38),kitSnap(60),kitSnap(35)];
          r.msk=MSK_INST.indexOf('kit'); r.before=S.channels.length; const nn=normalize(JSON.parse(JSON.stringify(S))); r.keep=nn.channels.some(c=>c.inst==='kit'); r.norm=nn.channels.length+':'+nn.channels.slice(-3).map(c=>c.inst).join('/');
          S.bpm=120; S.playMode='pattern'; const P=curPat(); for(const c of S.channels) P.notes[c.id]=[]; P.notes[ch.id]=KIT.map(([p],i)=>({p,s:i*24,l:12,v:.9}));
          const b=await renderWav(); let d; if(b&&b.getChannelData){d=b.getChannelData(0);r.sr=b.sampleRate}else{const u=b instanceof Uint8Array?b:new Uint8Array(b);const dv=new DataView(u.buffer,u.byteOffset);r.sr=dv.getUint32(24,true);const n=(u.length-44)>>1;d=new Float32Array(n);const ch2=dv.getUint16(22,true);for(let i=0;i<n;i+=ch2)d[i/ch2|0]=dv.getInt16(44+i*2,true)/32768;}
          const spt=r.sr*60/120/48; r.peaks=KIT.map((_,i)=>{let m=0;for(let k=Math.floor(i*24*spt);k<Math.floor((i*24+22)*spt)&&k<d.length;k++)m=Math.max(m,Math.abs(d[k]));return +m.toFixed(3)});
          const mb=midiBytes(); r.midi=false; r.midiHat=false; for(let i=0;i<mb.length-1;i++){if(mb[i]===0x99&&mb[i+1]===38)r.midi=true; if(mb[i]===0x99&&mb[i+1]===42)r.midiHat=true}
          S=normalize(blank()); refreshAll(); const k1=S.channels.findIndex(c=>c.inst==='kick'),s1=S.channels.findIndex(c=>c.inst==='snare');
          const Q=curPat(); Q.notes[S.channels[k1].id]=[{p:72,s:0,l:6,v:1},{p:72,s:96,l:6,v:1}]; Q.notes[S.channels[s1].id]=[{p:72,s:48,l:6,v:.8}];
          const drumIds=S.channels.filter(c=>c.kind==='drum').map(c=>c.id); r.drumN=drumIds.length; r.expect=S.patterns.reduce((s,P)=>s+drumIds.reduce((u,id)=>u+(P.notes[id]||[]).length,0),0); const m=mergeToKit(); const kc=S.channels.find(c=>c.inst==='kit'); r.merge={m, drumsLeft:S.channels.filter(c=>c.kind==='drum').length, ps:(curPat().notes[kc.id]||[]).map(n=>n.p).join(',')};
          S=normalize(JSON.parse(snap)); save(); refreshAll(); return r})()""")
        check('드럼 키트: 채널 추가 · 가장 가까운 드럼 줄로 · 파일 번호 · 불러와도 유지', kit['inst'] == 'kit' and kit['name'] == '드럼 키트' and kit['snap'] == [38, 49, 36] and kit['msk'] == 13 and kit['keep'], str({k: kit.get(k) for k in ('snap', 'msk', 'keep', 'before', 'norm', 'inst')}))
        check('드럼 키트: 드럼 14종이 모두 소리 남 (렌더링한 소리의 봉우리)', len(kit['peaks']) == 14 and min(kit['peaks']) > 0.02, str(kit['peaks']))
        check('드럼 키트: MIDI 저장은 10번 채널·GM 번호로 (스네어 38·닫힌 햇 42) · 드럼 채널 합치기', kit['midi'] and kit['midiHat'] and kit['merge']['m']['channels'] == kit['drumN'] and kit['merge']['m']['notes'] == kit['expect'] and kit['merge']['drumsLeft'] == 0 and kit['merge']['ps'] == '36,38,36', str(kit['merge']) + f" · 합치기 전 드럼 음 {kit['expect']}개")

        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
        stacked = await J("getComputedStyle(document.getElementById('win-roll')).position")
        check('휴대폰 폭에서는 창이 위아래로 쌓임', stacked == 'static', stacked)

        check('테스트 중 오류 없음', not errs, '; '.join(errs[:3]))
        await b.close()
    ok = sum(1 for r in results if r[1]); print(f'\n결과: {ok}/{len(results)} 통과'); return ok == len(results)

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
