/* 멜로디 스케치패드 — 브라우저에서 멜로디·코드·드럼을 찍고 재생하는 피아노 롤 */
(()=>{
const $=id=>document.getElementById(id);
const PPQ=48, LOW=48, HIGH=96;             // C3 ~ C7
const KEYW=64, RULER=24;
const ZX_LEVELS=[0.75,1,1.5,2,3,4], RH_LEVELS=[14,17,20,24,28];
let zxi=3, rhi=2, TICKPX=ZX_LEVELS[zxi], ROWH=RH_LEVELS[rhi];   // 기본: 16분 = 24px, 줄 높이 20px
const LANE_H=28, CHORD_H=34, VEL_H=60;
const NAMES_S=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NAMES_F=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const MAJ=[0,2,4,5,7,9,11], MIN=[0,2,3,5,7,8,10];
const QUAL={'':[0,4,7],'m':[0,3,7],'7':[0,4,7,10],'maj7':[0,4,7,11],'m7':[0,3,7,10],'sus4':[0,5,7],'dim':[0,3,6],'aug':[0,4,8]};
const QNAME={'':'장','m':'단','7':'7','maj7':'maj7','m7':'m7','sus4':'sus4','dim':'dim','aug':'aug'};
const DRUMS=['kick','snare','hat','clap'];
const STORE='melody-sketchpad-v1';

const CHS=['melody','chords','bass','kick','snare','hat','clap'];
const CH_NAME={melody:'멜로디',chords:'코드',bass:'베이스',kick:'킥',snare:'스네어',hat:'하이햇',clap:'박수'};
const MIX_DEF={melody:{v:1,pan:0,rev:.22,dly:.18},chords:{v:.85,pan:0,rev:.3,dly:0},bass:{v:.45,pan:0,rev:0,dly:0},
  kick:{v:.6,pan:0,rev:0,dly:0},snare:{v:.7,pan:0,rev:.18,dly:0},hat:{v:.45,pan:.15,rev:.05,dly:0},clap:{v:.6,pan:-.1,rev:.25,dly:0}};
const MASTER_DEF={v:.85,sc:.5,size:2};
function mixDefaults(){const m={};for(const c of CHS)m[c]={...MIX_DEF[c],lo:0,mid:0,hi:0,sc:['melody','chords','bass'].includes(c),mute:0,solo:0};m.master={...MASTER_DEF};return m}
function toneDefaults(){return{melody:{br:1,atk:0,rel:0.25},chords:{br:1,atk:0.15,rel:0.5}}}
const KITS_OK=['edm','808','hard','acoustic'];
let S=null, undoStack=[];
function blank(){const bars=8;return{bpm:150,root:5,mode:'minor',bars,inst:'piano',chordInst:'pad',bassMode:'off',bassInst:'reese',kit:'edm',tone:toneDefaults(),mix:mixDefaults(),snap:12,len:24,notes:[],chords:Array(bars).fill(null),drums:Object.fromEntries(DRUMS.map(d=>[d,Array(bars*16).fill(0)]))}}
const LIB='melody-sketchpad-library',PK=id=>'melody-sketchpad-proj-'+id;
let lib={current:null,list:{}};
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){return false}},lsDel=k=>{try{localStorage.removeItem(k)}catch(e){}};
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function saveLib(){lsSet(LIB,JSON.stringify(lib))}
function load(){try{lib=JSON.parse(lsGet(LIB)||'null')||{current:null,list:{}}}catch(e){lib={current:null,list:{}}}
  if(!lib.current||!lib.list[lib.current]){let first=null;try{const old=JSON.parse(lsGet(STORE)||'null');if(old&&old.notes)first=normalize(old)}catch(e){}
    const id=newId();lib.list[id]={name:first?'내 첫 곡':'새 곡',updated:Date.now()};lib.current=id;lsSet(PK(id),JSON.stringify(first||blank()));saveLib()}
  try{const d=JSON.parse(lsGet(PK(lib.current))||'null');if(d)return normalize(d)}catch(e){}return blank()}
function normalize(s){const b=blank();s={...b,...s};s.bars=Math.max(1,Math.min(32,s.bars|0||8));
  s.chords=Array.from({length:s.bars},(_,i)=>(s.chords||[])[i]||null);
  const dr={};for(const d of DRUMS){const a=(s.drums&&s.drums[d])||[];dr[d]=Array.from({length:s.bars*16},(_,i)=>a[i]?1:0)}s.drums=dr;
  s.notes=(s.notes||[]).filter(n=>n&&n.p>=LOW&&n.p<=HIGH&&n.s>=0&&n.l>0).map(n=>({p:n.p|0,s:n.s|0,l:n.l|0,v:Math.max(0.05,Math.min(1,n.v==null?0.8:+n.v))}));
  if(![12,16,24,48].includes(+s.snap))s.snap=12;
  const md=mixDefaults(),mx=s.mix||{};for(const k of Object.keys(md))md[k]={...md[k],...(mx[k]||{})};s.mix=md;
  const td=toneDefaults(),tn=s.tone||{};for(const k of Object.keys(td))td[k]={...td[k],...(tn[k]||{})};s.tone=td;if(!KITS_OK.includes(s.kit))s.kit='edm';
  if(s.inst==='lead')s.inst='supersaw';return s}
let saveT=0;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{if(!lsSet(PK(lib.current),JSON.stringify(S)))status('저장 공간이 가득 찼어요. 안 쓰는 프로젝트를 지워 주세요.');lib.list[lib.current].updated=Date.now();saveLib()},200)}
function pushUndo(){undoStack.push(JSON.stringify(S));if(undoStack.length>60)undoStack.shift()}
S=load();

function names(){const f=S.mode==='major'?[5,10,3,8,1,6].includes(S.root):[2,7,0,5,10,3].includes(S.root);return f?NAMES_F:NAMES_S}
function nn(p){return names()[p%12]+(Math.floor(p/12)-1)}
function inKey(pc){return (S.mode==='major'?MAJ:MIN).includes((pc-S.root+12)%12)}
function chordName(c){if(!c)return '';return names()[c.r]+(c.q==='m'?'m':c.q===''?'':c.q)}

// ---------- 설정 ----------
const rootSel=$('root');for(let i=0;i<12;i++){const o=document.createElement('option');o.value=i;o.textContent=NAMES_F[i]===NAMES_S[i]?NAMES_S[i]:NAMES_F[i]+' / '+NAMES_S[i];rootSel.appendChild(o)}
const barsSel=$('bars');for(const b of [1,2,4,6,8,10,12,16,20,24,32]){const o=document.createElement('option');o.value=b;o.textContent=b;barsSel.appendChild(o)}
function fillBarSelects(){for(const id of ['cpFrom','cpTo','cpDest']){const el=$(id);const v=el.value;el.innerHTML='';
  for(let b=1;b<=S.bars;b++){const o=document.createElement('option');o.value=b;o.textContent=b;el.appendChild(o)}
  el.value=Math.min(+v||(id==='cpTo'?Math.min(4,S.bars):id==='cpDest'?Math.min(5,S.bars):1),S.bars)}}
function syncControls(){fillBarSelects();$('bpm').value=S.bpm;rootSel.value=S.root;$('mode').value=S.mode;barsSel.value=S.bars;$('inst').value=S.inst;$('snap').value=S.snap;$('len').value=S.len}
$('bpm').onchange=()=>{S.bpm=Math.max(60,Math.min(300,+$('bpm').value||150));$('bpm').value=S.bpm;save()};
rootSel.onchange=()=>{S.root=+rootSel.value;save();drawAll()};
$('mode').onchange=()=>{S.mode=$('mode').value;save();drawAll()};
barsSel.onchange=()=>{pushUndo();const nb=+barsSel.value;S.bars=nb;S.chords=Array.from({length:nb},(_,i)=>S.chords[i]||null);
  for(const d of DRUMS)S.drums[d]=Array.from({length:nb*16},(_,i)=>S.drums[d][i]||0);
  S.notes=S.notes.filter(n=>n.s<nb*4*PPQ).map(n=>({...n,l:Math.min(n.l,nb*4*PPQ-n.s)}));startTick=Math.min(startTick,(nb-1)*4*PPQ);save();layout()};
$('inst').onchange=()=>{S.inst=$('inst').value;save()};
$('snap').onchange=()=>{S.snap=+$('snap').value;save();drawRoll();drawRuler()};
$('len').onchange=()=>{S.len=+$('len').value;save()};

// ---------- 그리기 ----------
const wrap=$('rollWrap'),rc=$('rollCanvas'),kc=$('keys'),ru=$('ruler'),lc=$('laneCanvas'),lanes=$('lanes');
let DPR=Math.max(1,Math.min(3,window.devicePixelRatio||1));
const rows=()=>HIGH-LOW+1,totalTicks=()=>S.bars*4*PPQ,W=()=>Math.ceil(totalTicks()*TICKPX),H=()=>rows()*ROWH;
let CS={};function readCss(){const g=getComputedStyle(document.documentElement);for(const k of ['bg','panel','panel2','line','line2','ink','mute','row-in','row-out','row-root','note','note-ink','key-w','key-b','key-line','key-text','key-dot','step-a','step-b'])CS[k]=g.getPropertyValue('--'+k).trim()}
function sizeCanvas(c,w,h){c.width=Math.round(w*DPR);c.height=Math.round(h*DPR);c.style.width=w+'px';c.style.height=h+'px';const x=c.getContext('2d');x.setTransform(DPR,0,0,DPR,0,0);return x}
function rr(x,a,b,w,h,r){r=Math.min(r,w/2,h/2);x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()}
let playTick=-1,startTick=0,keyDown=-1;
let sel=new Set(),clip=null,drag=null,lastVel=0.8,kb={t:0,p:72},kbLane=0,kbStep=0;
const isBlack=pc=>[1,3,6,8,10].includes(pc);
function drawKeys(){const x=sizeCanvas(kc,KEYW,H());
  x.fillStyle=CS['key-w'];x.fillRect(0,0,KEYW,H());
  for(let p=HIGH;p>=LOW;p--){const y=(HIGH-p)*ROWH,pc=p%12;
    if(p===keyDown&&!isBlack(pc)){x.fillStyle=CS['key-line'];x.fillRect(0,y,KEYW,ROWH)}
    // 흰 건반 경계: 흰-흰이 붙는 곳(E/F, B/C)과 검은 건반 가운데
    if(!isBlack(pc)){x.fillStyle=CS['key-line'];x.fillRect(0,y+ROWH-0.5,KEYW,1)}}
  for(let p=HIGH;p>=LOW;p--){const y=(HIGH-p)*ROWH,pc=p%12;
    if(isBlack(pc)){x.fillStyle=p===keyDown?CS['key-line']:CS['key-b'];rr(x,0,y+1,KEYW*0.62,ROWH-2,3);x.fill()}}
  x.font='600 10px "IBM Plex Sans KR",sans-serif';x.textBaseline='middle';x.textAlign='right';
  for(let p=HIGH;p>=LOW;p--){const y=(HIGH-p)*ROWH,pc=p%12;
    if(pc===0&&ROWH>=14){x.fillStyle=CS['key-text'];x.fillText('C'+(Math.floor(p/12)-1),KEYW-14,y+ROWH/2)}
    if(inKey(pc)){const r=pc===S.root?3.2:1.8;x.fillStyle=isBlack(pc)?CS['key-line']:CS['key-dot'];x.beginPath();x.arc(KEYW-6,y+ROWH/2,r,0,7);x.fill()}}
  x.fillStyle=CS.line;x.fillRect(KEYW-1,0,1,H())}
function drawRuler(){const w=W(),x=sizeCanvas(ru,w,RULER);x.fillStyle=CS.panel2;x.fillRect(0,0,w,RULER);
  x.fillStyle=CS.line;x.fillRect(0,RULER-1,w,1);
  x.font='600 11px "IBM Plex Mono",monospace';x.textBaseline='middle';
  for(let t=0;t<=totalTicks();t+=PPQ){const X=Math.round(t*TICKPX)+.5,bar=t%(4*PPQ)===0;x.fillStyle=bar?CS.ink:CS.line2;x.fillRect(X,bar?4:14,1,bar?RULER-5:RULER-15);
    if(bar&&t<totalTicks()){x.fillStyle=CS.ink;x.fillText(String(t/(4*PPQ)+1),X+5,9)}}
  // 시작 위치 표시 (삼각형)
  const sx=startTick*TICKPX;x.fillStyle=CS.ink;x.beginPath();x.moveTo(sx,RULER-1);x.lineTo(sx+7,RULER-8);x.lineTo(sx,RULER-8);x.closePath();x.fill();
  if(playTick>=0){const X=playTick*TICKPX;x.fillStyle=CS.ink;x.fillRect(X-1,0,2,RULER)}}
function drawRoll(){const w=W(),h=H(),x=sizeCanvas(rc,w,h);
  for(let p=HIGH;p>=LOW;p--){const y=(HIGH-p)*ROWH,pc=p%12;x.fillStyle=pc===S.root?CS['row-root']:inKey(pc)?CS['row-in']:CS['row-out'];x.fillRect(0,y,w,ROWH);
    x.fillStyle=pc===0?CS.line2:CS.line;x.fillRect(0,y+ROWH-1,w,1)}
  for(let t=0;t<=totalTicks();t+=S.snap){const X=Math.round(t*TICKPX)+.5,bar=t%(4*PPQ)===0,beat=t%PPQ===0;
    x.fillStyle=bar?CS.mute:(beat?CS.line2:CS.line);x.globalAlpha=bar?.8:1;x.fillRect(X-.5,0,bar?1.5:1,h)}
  x.globalAlpha=1;x.font='600 10px "IBM Plex Sans KR",sans-serif';x.textBaseline='middle';
  for(const n of S.notes){const X=n.s*TICKPX,Y=(HIGH-n.p)*ROWH,Wn=Math.max(4,n.l*TICKPX-1);const hot=playTick>=n.s&&playTick<n.s+n.l;
    rr(x,X+1,Y+1.5,Wn-1,ROWH-3,3);
    if(hot){x.fillStyle=CS.bg;x.fill();x.lineWidth=2;x.strokeStyle=CS.note;x.stroke()}else{x.globalAlpha=0.4+0.6*n.v;x.fillStyle=CS.note;x.fill();x.globalAlpha=1}
    if(sel.has(n)){rr(x,X+3,Y+3.5,Wn-5,ROWH-7,2);x.lineWidth=1.5;x.strokeStyle=hot?CS.note:CS['note-ink'];x.setLineDash([3,2]);x.stroke();x.setLineDash([])}
    if(Wn>30&&ROWH>=16){x.fillStyle=hot?CS.note:CS['note-ink'];x.fillText(nn(n.p),X+6,Y+ROWH/2)}
    x.fillStyle=hot?CS.note:CS['note-ink'];x.globalAlpha=.5;x.fillRect(X+Wn-4,Y+5,1.5,ROWH-10);x.globalAlpha=1}
  if(drag&&drag.mode==='band'){const a=Math.min(drag.x0,drag.x1),b=Math.min(drag.y0,drag.y1);x.strokeStyle=CS.ink;x.lineWidth=1;x.setLineDash([4,3]);x.strokeRect(a+.5,b+.5,Math.abs(drag.x1-drag.x0),Math.abs(drag.y1-drag.y0));x.setLineDash([]);x.fillStyle=CS.ink;x.globalAlpha=.08;x.fillRect(a,b,Math.abs(drag.x1-drag.x0),Math.abs(drag.y1-drag.y0));x.globalAlpha=1}
  if(document.activeElement===rc){const X=kb.t*TICKPX,Y=(HIGH-kb.p)*ROWH;x.strokeStyle=CS.ink;x.lineWidth=2;x.setLineDash([4,3]);x.strokeRect(X+1,Y+1,Math.max(8,S.snap*TICKPX)-2,ROWH-2);x.setLineDash([])}
  if(startTick>0){x.fillStyle=CS.ink;x.globalAlpha=.35;x.fillRect(startTick*TICKPX-.5,0,1,h);x.globalAlpha=1}
  if(playTick>=0){x.fillStyle=CS.ink;x.fillRect(playTick*TICKPX-1,0,2,h)}
  $('empty').style.display=S.notes.length?'none':'block'}
function drawLanes(){const w=W(),h=CHORD_H+LANE_H*4+VEL_H,x=sizeCanvas(lc,w,h);const step=12*TICKPX;
  x.fillStyle=CS.panel;x.fillRect(0,0,w,h);
  for(let d=0;d<4;d++){const y=CHORD_H+d*LANE_H;
    for(let i=0;i<S.bars*16;i++){const X=i*step,on=S.drums[DRUMS[d]][i],grp=Math.floor(i/4)%2;
      const hot=on&&playTick>=i*12&&playTick<(i+1)*12;
      rr(x,X+2,y+4,step-4,LANE_H-8,3);
      if(on){if(hot){x.fillStyle=CS.bg;x.fill();x.lineWidth=2;x.strokeStyle=CS.note;x.stroke()}else{x.fillStyle=CS.note;x.fill()}}
      else{x.fillStyle=grp?CS['step-b']:CS['step-a'];x.fill()}}
    x.fillStyle=CS.line;x.fillRect(0,y+LANE_H-1,w,1)}
  for(let b=0;b<=S.bars;b++){x.fillStyle=CS.mute;x.globalAlpha=.6;x.fillRect(b*4*PPQ*TICKPX,CHORD_H,1,LANE_H*4);x.globalAlpha=1}
  // 세기 줄
  const vy=CHORD_H+LANE_H*4;x.fillStyle=CS.panel2;x.fillRect(0,vy,w,VEL_H);x.fillStyle=CS.line;x.fillRect(0,vy,w,1);
  for(let b=0;b<=S.bars;b++){x.fillStyle=CS.mute;x.globalAlpha=.5;x.fillRect(b*4*PPQ*TICKPX,vy,1,VEL_H);x.globalAlpha=1}
  for(const n of [...S.notes].sort((a,b)=>a.v-b.v)){const X=n.s*TICKPX,hh=(VEL_H-10)*n.v;const on=sel.has(n);
    x.fillStyle=CS.note;x.globalAlpha=on||!sel.size?1:0.35;x.fillRect(X+1,vy+VEL_H-4-hh,3,hh);x.beginPath();x.arc(X+2.5,vy+VEL_H-4-hh,3.2,0,7);x.fill();x.globalAlpha=1}
  if(playTick>=0){x.fillStyle=CS.ink;x.fillRect(playTick*TICKPX-1,CHORD_H,2,LANE_H*4+VEL_H)}
  drawLaneCursor(x);drawChordRow()}
let chordSig='';
function drawChordRow(){const row=$('chordRow');const bw=4*PPQ*TICKPX;const sig=JSON.stringify([S.chords,bw,names()[0],S.root,S.mode]);if(sig===chordSig&&row.childElementCount===S.bars)return;chordSig=sig;row.innerHTML='';
  for(let b=0;b<S.bars;b++){const c=S.chords[b];const el=document.createElement('button');el.className='cell'+(c?'':' none');el.style.width=bw+'px';
    el.textContent=c?chordName(c):'+ '+(b+1);el.setAttribute('aria-label',(b+1)+'마디 코드 '+(c?chordName(c):'없음')+', 눌러서 고르기');el.onclick=()=>openChord(b);row.appendChild(el)}}
function drawAll(){readCss();$('corner').textContent=names()[S.root]+(S.mode==='minor'?' 단조':' 장조');drawKeys();drawRuler();drawRoll();drawLanes()}
function layout(){fillBarSelects();drawAll()}
let syncing=false;
wrap.addEventListener('scroll',()=>{if(syncing)return;syncing=true;lanes.scrollLeft=wrap.scrollLeft;syncing=false});
lanes.addEventListener('scroll',()=>{if(syncing)return;syncing=true;wrap.scrollLeft=lanes.scrollLeft;syncing=false});

// ---------- 도구 ----------
let tool='draw';
function setTool(t){tool=t;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===t));rc.style.cursor=t==='hand'?'grab':t==='erase'?'not-allowed':t==='select'?'default':'crosshair';if(t!=='select'&&sel.size){sel.clear();selChanged()}}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));setTool('draw');
rc.style.touchAction='none';

// ---------- 롤 조작 ----------
const ptrs=new Map();let pan=null;
function selChanged(){for(const n of [...sel])if(!S.notes.includes(n))sel.delete(n);const bar=$('selBar');bar.hidden=sel.size===0;$('selCount').textContent=sel.size+'개 선택';drawRoll()}
function bandSelect(){const t0=Math.min(drag.x0,drag.x1)/TICKPX,t1=Math.max(drag.x0,drag.x1)/TICKPX,p0=HIGH-Math.floor(Math.max(drag.y0,drag.y1)/ROWH),p1=HIGH-Math.floor(Math.min(drag.y0,drag.y1)/ROWH);
  sel=new Set(S.notes.filter(n=>n.p>=p0&&n.p<=p1&&n.s<t1&&n.s+n.l>t0))}
function pos(e){const r=rc.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;return{x,y,tick:x/TICKPX,p:HIGH-Math.floor(y/ROWH)}}
function hit(tick,p){for(let i=S.notes.length-1;i>=0;i--){const n=S.notes[i];if(n.p===p&&tick>=n.s&&tick<n.s+n.l)return i}return -1}
function avgPtr(){let x=0,y=0;for(const v of ptrs.values()){x+=v.x;y+=v.y}return{x:x/ptrs.size,y:y/ptrs.size}}
function startPan(){const a=avgPtr();pan={x:a.x,y:a.y,sl:wrap.scrollLeft,st:wrap.scrollTop}}
let erased=false;
function eraseAt(q){const i=hit(q.tick,q.p);if(i>=0){if(!erased){pushUndo();erased=true}S.notes.splice(i,1);selChanged()}}
rc.addEventListener('contextmenu',e=>{e.preventDefault();const q=pos(e);const i=hit(q.tick,q.p);if(i>=0){pushUndo();S.notes.splice(i,1);save();drawRoll()}});
rc.addEventListener('pointerdown',e=>{if(e.button===2)return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});try{rc.setPointerCapture(e.pointerId)}catch(_){}
  if(ptrs.size>=2||tool==='hand'){if(drag){const s=undoStack.pop();if(s)S=normalize(JSON.parse(s));drag=null;drawRoll()}startPan();rc.style.cursor=tool==='hand'?'grabbing':rc.style.cursor;return}
  const q=pos(e);if(q.p<LOW||q.p>HIGH)return;e.preventDefault();
  if(tool==='erase'){erased=false;eraseAt(q);drag={mode:'erase'};return}
  if(tool==='select'){const i=hit(q.tick,q.p);
    if(i>=0){const n=S.notes[i];if(!sel.has(n)){sel=new Set([n])}pushUndo();drag={mode:'moveSel',x0:q.x,y0:q.y,orig:[...sel].map(m=>({m,s:m.s,p:m.p})),moved:false};selChanged()}
    else{sel.clear();drag={mode:'band',x0:q.x,y0:q.y,x1:q.x,y1:q.y};selChanged()}
    return}
  const i=hit(q.tick,q.p);pushUndo();
  if(i>=0){const n=S.notes[i];const edge=(n.s+n.l)*TICKPX-q.x<9;drag={mode:edge?'resize':'move',i,x0:q.x,y0:q.y,orig:{...n},moved:false}}
  else{const s=Math.floor(q.tick/S.snap)*S.snap;const l=Math.min(S.len,totalTicks()-s);S.notes.push({p:q.p,s,l,v:lastVel});drag={mode:'new',i:S.notes.length-1,x0:q.x,y0:q.y,orig:{p:q.p,s,l},moved:false};preview(q.p,lastVel);drawRoll()}});
rc.addEventListener('pointermove',e=>{if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pan){const a=avgPtr();wrap.scrollLeft=pan.sl-(a.x-pan.x);wrap.scrollTop=pan.st-(a.y-pan.y);return}
  if(!drag)return;const q=pos(e);
  if(drag.mode==='erase'){eraseAt(q);return}
  if(drag.mode==='band'){drag.x1=Math.max(0,Math.min(W(),q.x));drag.y1=Math.max(0,Math.min(H(),q.y));bandSelect();$('selBar').hidden=sel.size===0;$('selCount').textContent=sel.size+'개 선택';drawRoll();return}
  if(drag.mode==='moveSel'){if(Math.abs(q.x-drag.x0)>4||Math.abs(q.y-drag.y0)>4)drag.moved=true;if(!drag.moved)return;
    let dt=Math.round((q.x-drag.x0)/TICKPX/S.snap)*S.snap,dp=-Math.round((q.y-drag.y0)/ROWH);
    const minS=Math.min(...drag.orig.map(o=>o.s)),maxE=Math.max(...drag.orig.map(o=>o.s+o.m.l)),minP=Math.min(...drag.orig.map(o=>o.p)),maxP=Math.max(...drag.orig.map(o=>o.p));
    dt=Math.max(-minS,Math.min(totalTicks()-maxE,dt));dp=Math.max(LOW-minP,Math.min(HIGH-maxP,dp));
    const firstP=drag.orig[0].m.p;for(const o of drag.orig){o.m.s=o.s+dt;o.m.p=o.p+dp}if(drag.orig[0].m.p!==firstP)preview(drag.orig[0].m.p);drawRoll();return}
  const n=S.notes[drag.i];if(!n)return;
  if(Math.abs(q.x-drag.x0)>4||Math.abs(q.y-drag.y0)>4)drag.moved=true;if(!drag.moved)return;
  if(drag.mode==='move'){const dt=Math.round((q.x-drag.x0)/TICKPX/S.snap)*S.snap,dp=-Math.round((q.y-drag.y0)/ROWH);
    const ns=Math.max(0,Math.min(totalTicks()-n.l,drag.orig.s+dt)),np=Math.max(LOW,Math.min(HIGH,drag.orig.p+dp));if(np!==n.p)preview(np);n.s=ns;n.p=np}
  else{const end=Math.ceil(q.tick/S.snap)*S.snap;n.l=Math.max(S.snap,Math.min(totalTicks()-n.s,end-n.s))}
  drawRoll()});
function upPtr(e){ptrs.delete(e.pointerId);if(pan){if(ptrs.size===0){pan=null;if(tool==='hand')rc.style.cursor='grab'}return}
  if(!drag)return;
  if(drag.mode==='band'){drag=null;selChanged();return}
  if(drag.mode==='moveSel'){if(!drag.moved)undoStack.pop();drag=null;save();drawRoll();return}
  if(drag.mode==='move'&&!drag.moved){sel.delete(S.notes[drag.i]);S.notes.splice(drag.i,1)}drag=null;save();selChanged()}
rc.addEventListener('pointerup',upPtr);rc.addEventListener('pointercancel',upPtr);
// 건반 누르면 소리
kc.addEventListener('pointerdown',e=>{const r=kc.getBoundingClientRect();const p=HIGH-Math.floor((e.clientY-r.top)/ROWH);if(p<LOW||p>HIGH)return;keyDown=p;preview(p);drawKeys()});
kc.addEventListener('pointerup',()=>{keyDown=-1;drawKeys()});kc.addEventListener('pointerleave',()=>{if(keyDown>=0){keyDown=-1;drawKeys()}});
// 눈금자: 시작 위치
ru.addEventListener('click',e=>{const r=ru.getBoundingClientRect();startTick=Math.max(0,Math.min(totalTicks()-PPQ,Math.floor((e.clientX-r.left)/TICKPX/PPQ)*PPQ));updatePos(startTick);drawRuler();drawRoll();if(playing){stop();play()}});
ru.addEventListener('dblclick',()=>{startTick=0;updatePos(0);drawRuler();drawRoll()});
// 드럼 칸
// 채널 랙: 드럼 칸 켜고 끄기 · 세기 줄 끌어서 조절
let velDrag=null;
function laneHit(e){const r=lc.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function velAt(x,y){const vy=CHORD_H+LANE_H*4;const v=Math.max(0.05,Math.min(1,(vy+VEL_H-4-y)/(VEL_H-10)));
  let best=null,bd=9;for(const n of S.notes){const d=Math.abs(n.s*TICKPX+2.5-x);if(d<bd){bd=d;best=n.s}}
  if(best==null)return 0;let targets=S.notes.filter(n=>n.s===best);if(targets.some(n=>sel.has(n)))targets=targets.filter(n=>sel.has(n));
  targets.forEach(n=>n.v=v);lastVel=v;return targets.length}
lc.addEventListener('pointerdown',e=>{const q=laneHit(e);const y=q.y-CHORD_H;if(y<0)return;
  if(y>=LANE_H*4){if(!S.notes.length)return;pushUndo();try{lc.setPointerCapture(e.pointerId)}catch(_){}velDrag=true;const n=velAt(q.x,q.y);if(!n)undoStack.pop();drawLanes();drawRoll();return}
  const d=Math.floor(y/LANE_H),i=Math.floor(q.x/(12*TICKPX));toggleDrum(d,i)});
lc.addEventListener('pointermove',e=>{if(!velDrag)return;const q=laneHit(e);velAt(q.x,q.y);drawLanes();drawRoll()});
lc.addEventListener('pointerup',()=>{if(velDrag){velDrag=null;save();announce('세기를 바꿨어요.')}});lc.addEventListener('pointercancel',()=>{velDrag=null});
function toggleDrum(d,i){if(d<0||d>3||i<0||i>=S.bars*16)return;pushUndo();const a=S.drums[DRUMS[d]];a[i]=a[i]?0:1;if(a[i]){ensureCtx();applyMix(E,S.mix);drumHit(DRUMS[d],ctx.currentTime+0.01)}save();drawLanes()}
$('undo').onclick=()=>{const s=undoStack.pop();if(!s)return;S=normalize(JSON.parse(s));sel.clear();syncControls();save();layout();selChanged();buildMixer();if(E)applyMix(E,S.mix)};

// ---------- 키보드로 작곡 (접근성) ----------
function announce(m){const el=$('sr');if(el){el.textContent='';setTimeout(()=>el.textContent=m,30)}}
function posName(t){const bar=Math.floor(t/(4*PPQ))+1,beat=Math.floor((t%(4*PPQ))/PPQ)+1,sub=Math.floor((t%PPQ)/S.snap)+1;return `${bar}마디 ${beat}박`+(sub>1?` ${sub}번째 칸`:'')}
function noteAtCursor(){return S.notes.find(n=>n.p===kb.p&&kb.t>=n.s&&kb.t<n.s+n.l)}
function showCursor(){const X=kb.t*TICKPX,Y=(HIGH-kb.p)*ROWH,vw=wrap.clientWidth-KEYW,vh=wrap.clientHeight-RULER;
  if(X<wrap.scrollLeft||X>wrap.scrollLeft+vw-60)wrap.scrollLeft=Math.max(0,X-vw/3);if(Y<wrap.scrollTop||Y>wrap.scrollTop+vh-ROWH)wrap.scrollTop=Math.max(0,Y-vh/2);drawRoll()}
function describe(){const n=noteAtCursor();return `${nn(kb.p)}, ${posName(kb.t)}`+(n?`, 음 있음 (길이 ${lenText(n.l)}, 세기 ${Math.round(n.v*100)})`:'')}
rc.tabIndex=0;rc.setAttribute('aria-describedby','kbHelp');
rc.addEventListener('focus',()=>{kb.t=Math.min(kb.t,totalTicks()-S.snap);showCursor();announce('피아노 롤. '+describe())});rc.addEventListener('blur',()=>drawRoll());
rc.addEventListener('keydown',e=>{const k=e.key;let used=true,msg=null;
  if(k==='ArrowLeft'||k==='ArrowRight'){const st=e.shiftKey?4*PPQ:S.snap;kb.t=Math.max(0,Math.min(totalTicks()-S.snap,kb.t+(k==='ArrowLeft'?-st:st)));kb.t=Math.floor(kb.t/S.snap)*S.snap;msg=describe()}
  else if(k==='ArrowUp'||k==='ArrowDown'){kb.p=Math.max(LOW,Math.min(HIGH,kb.p+(k==='ArrowUp'?1:-1)*(e.shiftKey?12:1)));preview(kb.p,lastVel);msg=describe()}
  else if(k==='Enter'){const n=noteAtCursor();pushUndo();if(n){S.notes.splice(S.notes.indexOf(n),1);msg=`${nn(kb.p)} 음을 지웠어요`}else{const l=Math.min(S.len,totalTicks()-kb.t);S.notes.push({p:kb.p,s:kb.t,l,v:lastVel});preview(kb.p,lastVel);msg=`${nn(kb.p)} 음을 찍었어요, 길이 ${lenText(l)}`}save();selChanged()}
  else if(k==='Delete'||k==='Backspace'){const n=noteAtCursor();if(n){pushUndo();S.notes.splice(S.notes.indexOf(n),1);save();selChanged();msg='지웠어요'}else used=false}
  else if(k==='+'||k==='='||k==='-'){const n=noteAtCursor();if(n){pushUndo();n.l=Math.max(S.snap,Math.min(totalTicks()-n.s,n.l+(k==='-'?-S.snap:S.snap)));save();msg=`길이 ${lenText(n.l)}`}else msg='여기에는 음이 없어요'}
  else if(k==='['||k===']'){const n=noteAtCursor();if(n){pushUndo();n.v=Math.max(0.05,Math.min(1,Math.round((n.v+(k===']'?0.1:-0.1))*20)/20));lastVel=n.v;save();preview(n.p,n.v);msg=`세기 ${Math.round(n.v*100)}`}else msg='여기에는 음이 없어요'}
  else used=false;
  if(used){e.preventDefault();e.stopPropagation();showCursor();drawLanes();if(msg)announce(msg)}});
// 채널 랙 키보드: ↑↓ 줄, ←→ 칸, Enter 켜고 끄기, 세기 줄에서는 [ ]
lc.tabIndex=0;lc.setAttribute('aria-describedby','kbHelp');
const LANE_NAMES=['킥','스네어','하이햇','박수','세기'];
function drawLaneCursor(x){if(document.activeElement!==lc)return;const step=12*TICKPX,y=CHORD_H+(kbLane<4?kbLane*LANE_H:LANE_H*4),h=kbLane<4?LANE_H:VEL_H;
  x.strokeStyle=CS.ink;x.lineWidth=2;x.setLineDash([4,3]);x.strokeRect(kbStep*step+1,y+1,step-2,h-2);x.setLineDash([])}
function laneDesc(){const bar=Math.floor(kbStep/16)+1,beat=Math.floor((kbStep%16)/4)+1,sub=kbStep%4+1;const pos=`${bar}마디 ${beat}박 ${sub}번째 칸`;
  if(kbLane<4)return `${LANE_NAMES[kbLane]}, ${pos}, ${S.drums[DRUMS[kbLane]][kbStep]?'켜짐':'꺼짐'}`;
  const ns=S.notes.filter(n=>Math.floor(n.s/12)===kbStep);return `세기 줄, ${pos}, `+(ns.length?`음 ${ns.length}개, 세기 ${Math.round(ns[0].v*100)}`:'음 없음')}
lc.addEventListener('focus',()=>{drawLanes();announce('채널 랙. '+laneDesc())});lc.addEventListener('blur',()=>drawLanes());
lc.addEventListener('keydown',e=>{const k=e.key;let used=true;
  if(k==='ArrowLeft'||k==='ArrowRight')kbStep=Math.max(0,Math.min(S.bars*16-1,kbStep+(k==='ArrowLeft'?-1:1)*(e.shiftKey?16:1)));
  else if(k==='ArrowUp'||k==='ArrowDown')kbLane=Math.max(0,Math.min(4,kbLane+(k==='ArrowUp'?-1:1)));
  else if(k==='Enter'&&kbLane<4)toggleDrum(kbLane,kbStep);
  else if((k==='['||k===']')&&kbLane===4){const ns=S.notes.filter(n=>Math.floor(n.s/12)===kbStep);if(ns.length){pushUndo();ns.forEach(n=>n.v=Math.max(0.05,Math.min(1,Math.round((n.v+(k===']'?0.1:-0.1))*20)/20)));lastVel=ns[0].v;save();drawRoll()}}
  else used=false;
  if(used){e.preventDefault();e.stopPropagation();const X=kbStep*12*TICKPX;if(X<lanes.scrollLeft||X>lanes.scrollLeft+lanes.clientWidth-120)lanes.scrollLeft=Math.max(0,X-lanes.clientWidth/3);drawLanes();announce(laneDesc())}});

// ---------- 선택한 음 작업 ----------
function selNotes(){return [...sel].filter(n=>S.notes.includes(n))}
function transpose(d){const ns=selNotes();if(!ns.length)return;if(ns.some(n=>n.p+d<LOW||n.p+d>HIGH)){status('더 이상 올리거나 내릴 수 없어요.');return}pushUndo();ns.forEach(n=>n.p+=d);preview(ns[0].p);save();drawRoll()}
function shiftSel(dt){const ns=selNotes();if(!ns.length)return;const minS=Math.min(...ns.map(n=>n.s)),maxE=Math.max(...ns.map(n=>n.s+n.l));dt=Math.max(-minS,Math.min(totalTicks()-maxE,dt));if(!dt)return;pushUndo();ns.forEach(n=>n.s+=dt);save();drawRoll()}
function delSel(){const ns=selNotes();if(!ns.length)return;pushUndo();S.notes=S.notes.filter(n=>!sel.has(n));sel.clear();save();selChanged()}
function pasteNotes(rel,at){const out=[];for(const r of rel){const s=at+r.s;if(s>=totalTicks())continue;out.push({p:r.p,s,l:Math.min(r.l,totalTicks()-s),v:r.v==null?0.8:r.v})}
  if(!out.length){status('붙일 자리가 곡 밖이에요. 마디 수를 늘리거나 눈금자에서 시작 위치를 앞으로 옮겨 보세요.');return}
  pushUndo();S.notes.push(...out);sel=new Set(out);save();selChanged();return out.length}
function dupSel(){const ns=selNotes();if(!ns.length)return;const minS=Math.min(...ns.map(n=>n.s)),maxE=Math.max(...ns.map(n=>n.s+n.l));const span=Math.ceil((maxE-minS)/PPQ)*PPQ;
  const c=pasteNotes(ns.map(n=>({p:n.p,s:n.s-minS,l:n.l,v:n.v})),minS+span);if(c)status(c+'개를 바로 뒤에 복제했어요.')}
$('selDup').onclick=dupSel;$('selUp').onclick=()=>transpose(1);$('selDown').onclick=()=>transpose(-1);$('selDel').onclick=delSel;$('selNone').onclick=()=>{sel.clear();selChanged()};

// ---------- 코드 고르기 ----------
const dlg=$('chordDlg');let chordBar=0,pick={r:0,q:'m'};
function openChord(b){chordBar=b;pick=S.chords[b]?{...S.chords[b]}:{r:S.root,q:S.mode==='minor'?'m':''};renderChordDlg();if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','')}
function renderChordDlg(){const g=$('rootGrid');g.innerHTML='';const N=names();
  for(let i=0;i<12;i++){const r=(S.root+i)%12;const b=document.createElement('button');b.className='tbtn'+(inKey(r)?' inkey':'');b.textContent=N[r];b.setAttribute('aria-pressed',pick.r===r);b.onclick=()=>{pick.r=r;renderChordDlg()};g.appendChild(b)}
  const q=$('qGrid');q.innerHTML='';for(const k of Object.keys(QUAL)){const b=document.createElement('button');b.className='tbtn';b.textContent=QNAME[k];b.setAttribute('aria-pressed',pick.q===k);b.onclick=()=>{pick.q=k;renderChordDlg()};q.appendChild(b)}
  $('chordTitle').textContent=(chordBar+1)+'마디 코드 · '+chordName(pick)}
$('chordOk').onclick=()=>{pushUndo();S.chords[chordBar]={...pick};save();dlg.close();drawChordRow()};
$('chordNone').onclick=()=>{pushUndo();S.chords[chordBar]=null;save();dlg.close();drawChordRow()};
$('chordHear').onclick=()=>{ensureCtx();applyMix(E,S.mix);chordPlay(E,S.chordInst,chordVoices(pick),ctx.currentTime+0.02,1.4)};

// ---------- 소리 엔진 (음색 · 믹서 · 사이드체인 · 샘플) ----------
const hz=m=>440*Math.pow(2,(m-69)/12);
const SAMPLES={};           // slot -> {buf, root, name}
const PIANO={};             // midi -> AudioBuffer (Salamander Grand Piano, CC-BY 3.0)
const PIANO_CDN='https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/';
async function loadPianoCDN(){const pc={C:0,Ds:3,Fs:6,A:9},list=[[96,'C7']];for(let o=2;o<=6;o++)for(const n of ['C','Ds','Fs','A'])list.push([12*(o+1)+pc[n],n+o]);
  await Promise.all(list.map(async([m,nm])=>{try{const r=await fetch(PIANO_CDN+nm+'.mp3');if(r.ok)PIANO[m]=await decode(await r.arrayBuffer())}catch(e){}}))}
async function loadPiano(){const src=window.PIANO_SAMPLES;if(!src)return loadPianoCDN();for(const[k,b64]of Object.entries(src)){try{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);PIANO[+k]=await decode(u.buffer)}catch(e){}}}
function pianoSample(E,m,t,d,vel,dest,T){T=T||S.tone.melody;const keys=Object.keys(PIANO).map(Number);if(!keys.length)return false;let r=keys[0];for(const k of keys)if(Math.abs(k-m)<Math.abs(r-m))r=k;
  const ac=E.ac,src=ac.createBufferSource();src.buffer=PIANO[r];src.playbackRate.value=Math.pow(2,(m-r)/12);
  const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,(2200+11000*vel)*T.br);lp.Q.value=0.5;const g=ac.createGain();const lv=(0.45+0.55*vel)*0.9;
  if(T.atk>0){g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(lv,t+T.atk)}else g.gain.setValueAtTime(lv,t);const off=Math.max(t+d,t+0.08+T.atk);g.gain.setValueAtTime(lv,off);g.gain.setTargetAtTime(0.0001,off,Math.max(0.03,T.rel)/3);
  src.connect(lp);lp.connect(g);g.connect(dest);src.start(t);src.stop(Math.min(off+Math.max(0.6,T.rel*2),t+src.buffer.duration/src.playbackRate.value+0.05));return true}
let ctx=null,E=null;
function ensureCtx(){if(!ctx){ctx=new (window.AudioContext||window.webkitAudioContext)();E=makeEngine(ctx,true)}if(ctx.state==='suspended')ctx.resume()}
function makeIR(ac,sec){const len=Math.floor(ac.sampleRate*sec),b=ac.createBuffer(2,len,ac.sampleRate);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++){const t=i/len;d[i]=(Math.random()*2-1)*Math.pow(1-t,2.6)*(i<ac.sampleRate*0.012?i/(ac.sampleRate*0.012):1)}}return b}
function makeEngine(ac,live){
  const E={ac};const mk=()=>ac.createGain();
  // 마스터: 글루 압축 → 부드러운 클리핑 → 리미터
  E.in=mk();const glue=ac.createDynamicsCompressor();glue.threshold.value=-16;glue.ratio.value=2.5;glue.attack.value=0.01;glue.release.value=0.2;
  const shp=ac.createWaveShaper();const cv=new Float32Array(2048);for(let i=0;i<2048;i++){const x=i/1023.5-1;cv[i]=Math.tanh(1.3*x)/Math.tanh(1.3)}shp.curve=cv;shp.oversample='2x';
  const lim=ac.createDynamicsCompressor();lim.threshold.value=-3;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=0.002;lim.release.value=0.08;
  E.out=mk();E.in.connect(glue);glue.connect(shp);shp.connect(lim);lim.connect(E.out);E.out.connect(ac.destination);
  if(live){E.meter=ac.createAnalyser();E.meter.fftSize=1024;E.out.connect(E.meter)}
  // 공간: 리버브 · 핑퐁 딜레이
  E.rev=ac.createConvolver();E.revRet=mk();E.revRet.gain.value=0.9;E.rev.connect(E.revRet);E.revRet.connect(E.in);
  const dl=ac.createDelay(2),dr=ac.createDelay(2),fbl=mk(),fbr=mk(),dlp=ac.createBiquadFilter();dlp.type='lowpass';dlp.frequency.value=4500;
  const mg=ac.createChannelMerger(2);E.dlyIn=mk();E.dlyIn.connect(dlp);dlp.connect(dl);dl.connect(dr);dl.connect(fbl);dr.connect(fbr);fbr.connect(dl);
  dl.connect(mg,0,0);dr.connect(mg,0,1);E.dlyRet=mk();E.dlyRet.gain.value=0.7;mg.connect(E.dlyRet);E.dlyRet.connect(E.in);E._dl=[dl,dr,fbl,fbr];
  // 채널: 입력 → 사이드체인 → 볼륨 → 팬 → 마스터 (+ 센드)
  E.ch={};for(const c of CHS){const inp=mk(),duck=mk(),vol=mk(),pan=ac.createStereoPanner(),rs=mk(),ds=mk();
    const lo=ac.createBiquadFilter(),md=ac.createBiquadFilter(),hi=ac.createBiquadFilter();lo.type='lowshelf';lo.frequency.value=180;md.type='peaking';md.frequency.value=1200;md.Q.value=0.8;hi.type='highshelf';hi.frequency.value=5000;
    inp.connect(duck);duck.connect(lo);lo.connect(md);md.connect(hi);hi.connect(vol);vol.connect(pan);pan.connect(E.in);pan.connect(rs);pan.connect(ds);rs.connect(E.rev);ds.connect(E.dlyIn);E.ch[c]={inp,duck,vol,pan,rs,ds,lo,md,hi}}
  const nb=ac.createBuffer(1,ac.sampleRate,ac.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;E.noise=nb;
  E.waves=makeWaves(ac);E.size=-1;
  return E}
function makeWaves(ac){const N=40,re=new Float32Array(N),im=new Float32Array(N);
  for(let k=1;k<N;k++)im[k]=Math.pow(k,-1.25)*(k%7===0?0.2:1)*(1+0.3*Math.sin(k*1.7));   // 피아노 배음
  const piano=ac.createPeriodicWave(re,im);
  const re2=new Float32Array(N),im2=new Float32Array(N);for(let k=1;k<N;k++)im2[k]=(2/(k*Math.PI))*Math.sin(k*Math.PI*0.25);   // 25% 펄스
  const pulse=ac.createPeriodicWave(re2,im2);return{piano,pulse}}
function applyMix(E,mix){const t=E.ac.currentTime,anySolo=CHS.some(c=>mix[c].solo);
  for(const c of CHS){const m=mix[c],ch=E.ch[c];const on=!m.mute&&(!anySolo||m.solo);
    ch.vol.gain.setTargetAtTime(on?m.v:0,t,0.015);ch.pan.pan.setTargetAtTime(m.pan,t,0.015);ch.rs.gain.setTargetAtTime(m.rev,t,0.015);ch.ds.gain.setTargetAtTime(m.dly,t,0.015);ch.lo.gain.setTargetAtTime(m.lo||0,t,0.015);ch.md.gain.setTargetAtTime(m.mid||0,t,0.015);ch.hi.gain.setTargetAtTime(m.hi||0,t,0.015)}
  E.out.gain.setTargetAtTime(mix.master.v,t,0.015);
  const secs=[0.9,1.6,2.6,3.8][mix.master.size]||1.6;if(E.size!==mix.master.size){E.rev.buffer=makeIR(E.ac,secs);E.size=mix.master.size}
  const beat=60/S.bpm;const[dl,dr,fbl,fbr]=E._dl;dl.delayTime.setValueAtTime(beat*0.75,t);dr.delayTime.setValueAtTime(beat*0.75,t);fbl.gain.value=0.35;fbr.gain.value=0.35}
// --- 음색 ---
function adsr(g,t,a,peak,d,sus,end,rel){g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(peak*sus,t+a,d/3);g.gain.setTargetAtTime(0.0001,Math.max(end,t+a),rel/4)}
function osc(ac,type,f,det,t,stop,dest){const o=ac.createOscillator();if(typeof type==='string')o.type=type;else o.setPeriodicWave(type);o.frequency.value=f;o.detune.value=det||0;o.connect(dest);o.start(t);o.stop(stop);return o}
function noiseBurst(E,t,d,type,f,q,v,dest){const s=E.ac.createBufferSource();s.buffer=E.noise;s.loop=true;const fl=E.ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=E.ac.createGain();
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);s.connect(fl);fl.connect(g);g.connect(dest);s.start(t,Math.random()*0.5);s.stop(t+d+0.05)}
function playSample(E,slot,m,t,d,vel,dest){const s=SAMPLES[slot];if(!s)return false;const src=E.ac.createBufferSource();src.buffer=s.buf;
  src.playbackRate.value=m==null?1:Math.pow(2,(m-s.root)/12);const g=E.ac.createGain();g.gain.setValueAtTime(vel,t);
  if(d!=null){g.gain.setValueAtTime(vel,t+d);g.gain.linearRampToValueAtTime(0.0001,t+d+0.08)}src.connect(g);g.connect(dest);src.start(t);src.stop(t+(d!=null?d+0.1:s.buf.duration/src.playbackRate.value+0.05));return true}
function voice(E,inst,m,t,d,vel=1,dest,tone){const ac=E.ac,f=hz(m),end=t+d;dest=dest||E.ch.melody.inp;const T=tone||S.tone.melody,br=T.br,rel=Math.max(0.03,T.rel),atk=T.atk;
  if(inst==='sample'){if(playSample(E,'melody',m,t,d,vel*0.9,dest))return;inst='piano'}
  if(inst==='piano'&&pianoSample(E,m,t,d,vel,dest,T))return;
  if(inst==='piano'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';const b=(1400+2600*vel+f*1.5)*br;
    lp.frequency.setValueAtTime(Math.min(18000,b*2.2),t);lp.frequency.setTargetAtTime(Math.max(400,b*0.5),t+0.02,0.35);lp.connect(g);g.connect(dest);
    const st=Math.max(end,t+0.3)+rel+1.2;[-3,3].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=i?0.3:-0.3;p.connect(lp);osc(ac,E.waves.piano,f,c,t+i*0.0015,st,p)});
    const sub=ac.createGain();sub.gain.value=0.25;sub.connect(lp);osc(ac,'sine',f,0,t,st,sub);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.4*vel,t+0.004+atk);g.gain.setTargetAtTime(0.17*vel,t+0.004+atk,0.18);g.gain.setTargetAtTime(0.05*vel,t+0.3+atk,1.2);g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.12),rel/3);
    noiseBurst(E,t,0.03,'bandpass',Math.min(8000,f*4),1.2,0.05*vel,dest);return}
  if(inst==='epiano'){const g=ac.createGain(),trem=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,5000*br);lp.connect(trem);trem.connect(g);g.connect(dest);
    const st=Math.max(end,t+0.2)+rel+0.3;const car=ac.createOscillator(),mod=ac.createOscillator(),mi=ac.createGain();car.frequency.value=f;mod.frequency.value=f;
    mi.gain.setValueAtTime(f*(0.6+1.4*vel)*br,t);mi.gain.setTargetAtTime(f*0.15,t,0.45);mod.connect(mi);mi.connect(car.frequency);
    const p=ac.createStereoPanner();p.pan.value=((m%12)/11-0.5)*0.6;car.connect(p);p.connect(lp);
    const tine=ac.createOscillator(),tg=ac.createGain();tine.frequency.value=f*14;tg.gain.setValueAtTime(0.12*vel,t);tg.gain.exponentialRampToValueAtTime(0.0001,t+0.06);tine.connect(tg);tg.connect(lp);
    const lfo=ac.createOscillator(),lg=ac.createGain();lfo.frequency.value=4.5;lg.gain.value=0.15;lfo.connect(lg);lg.connect(trem.gain);trem.gain.value=0.85;
    [car,mod,tine,lfo].forEach(o=>{o.start(t);o.stop(st)});
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.3*vel,t+0.003+atk);g.gain.setTargetAtTime(0.12*vel,t+0.003+atk,0.6);g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.05),rel/3);return}
  if(inst==='supersaw'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=1.2;lp.frequency.setValueAtTime(Math.min(18000,2500*br),t);lp.frequency.linearRampToValueAtTime(Math.min(18000,6500*br),t+0.05+atk);lp.frequency.setTargetAtTime(Math.min(18000,4200*br),t+0.05+atk,0.2);
    lp.connect(g);g.connect(dest);const st=end+rel+0.4;[-24,-14,-6,0,6,14,24].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,(i-3)/3));p.connect(lp);osc(ac,'sawtooth',f,c,t+(i===3?0:Math.random()*0.004),st,p)});
    const sq=ac.createGain();sq.gain.value=0.5;sq.connect(lp);osc(ac,'square',f/2,0,t,st,sq);adsr(g,t,0.006+atk,0.13*vel,0.15,0.75,end,rel);return}
  if(inst==='pluck'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=3;lp.frequency.setValueAtTime(Math.min(18000,7000*br),t);lp.frequency.setTargetAtTime(500*br,t,0.08);lp.connect(g);g.connect(dest);
    const st=t+Math.max(d,0.2)+rel+0.6;[-8,8].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=i?0.6:-0.6;p.connect(lp);osc(ac,'sawtooth',f,c,t+i*0.002,st,p)});osc(ac,'square',f,0,t,st,lp);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.24*vel,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.003+atk,0.08+rel*0.35);return}
  if(inst==='chip'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,9000*br);lp.connect(g);g.connect(dest);const o=osc(ac,E.waves.pulse,f,0,t,end+rel+0.1,lp);const lfo=ac.createOscillator(),lg=ac.createGain();lfo.frequency.value=6;lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(18,t+0.25);lfo.connect(lg);lg.connect(o.detune);lfo.start(t);lfo.stop(end+rel+0.1);
    adsr(g,t,0.002+atk,0.14*vel,0.05,0.8,end,Math.min(rel,0.3));return}
  // bell (FM)
  const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,9000*br);lp.connect(g);g.connect(dest);const car=ac.createOscillator(),mod=ac.createOscillator(),mi=ac.createGain();car.frequency.value=f;mod.frequency.value=f*3.5;
  mi.gain.setValueAtTime(f*2.5*br,t);mi.gain.setTargetAtTime(f*0.3,t,0.4);mod.connect(mi);mi.connect(car.frequency);car.connect(lp);const st=t+Math.max(d,0.4)+rel+1.6;car.start(t);mod.start(t);car.stop(st);mod.stop(st);
  const c2=ac.createGain();c2.gain.value=0.3;c2.connect(lp);osc(ac,'sine',f*2,3,t,st,c2);
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.22*vel,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.003+atk,0.3+rel*0.5)}
function chordVoices(c){const base=48+c.r;return QUAL[c.q].map(i=>base+i+(base+i<52?12:0))}
function chordPlay(E,inst,notes,t,d){const ac=E.ac,dest=E.ch.chords.inp,end=t+d,T=S.tone.chords,br=T.br,rel=Math.max(0.03,T.rel);
  if(inst==='piano'||inst==='epiano'){notes.forEach(m=>voice(E,inst,m,t,d,0.65,dest,T));return}
  if(inst==='pluck'){for(let k=0;k<Math.max(1,Math.round(d/(60/S.bpm)));k++)notes.forEach(m=>voice(E,'pluck',m+12,t+k*60/S.bpm,0.2,0.6,dest,T));return}
  const saw=inst==='supersaw';const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,(saw?5200:1600)*br);lp.Q.value=0.7;lp.connect(g);g.connect(dest);
  const dets=saw?[-18,-7,0,7,18]:[-10,0,10];notes.forEach(m=>dets.forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=(i/(dets.length-1)-.5)*2;p.connect(lp);osc(ac,'sawtooth',hz(saw?m+12:m),c,t+Math.random()*0.005,end+rel+0.8,p)}));
  if(!saw){notes.forEach(m=>osc(ac,'triangle',hz(m),0,t,end+rel+0.8,lp))}
  const pk=(saw?0.12:0.09)/Math.sqrt(notes.length);adsr(g,t,(saw?0.01:0.03)+T.atk,pk,0.3,0.85,end,rel)}
function bassPlay(E,inst,m,t,d){const ac=E.ac,f=hz(m),end=t+d,dest=E.ch.bass.inp;const g=ac.createGain();g.connect(dest);
  if(inst==='sub'){const sh=ac.createWaveShaper();const cv=new Float32Array(256);for(let i=0;i<256;i++){const x=i/127.5-1;cv[i]=Math.tanh(2*x)}sh.curve=cv;sh.connect(g);osc(ac,'sine',f,0,t,end+0.2,sh);adsr(g,t,0.004,0.35,0.1,0.9,end,0.05);return}
  const lp=ac.createBiquadFilter();lp.type='lowpass';lp.connect(g);
  if(inst==='reese'){lp.frequency.value=700;lp.Q.value=1.5;[-16,16].forEach(c=>osc(ac,'sawtooth',f,c,t,end+0.2,lp));const s=ac.createGain();s.gain.value=0.9;s.connect(g);osc(ac,'sine',f,0,t,end+0.2,s);adsr(g,t,0.006,0.2,0.1,0.9,end,0.05);return}
  lp.Q.value=4;lp.frequency.setValueAtTime(2200,t);lp.frequency.setTargetAtTime(350,t,0.07);osc(ac,'sawtooth',f,0,t,end+0.2,lp);osc(ac,'square',f/2,0,t,end+0.2,lp);adsr(g,t,0.003,0.22,0.08,0.7,end,0.04)}
const KITS={edm:{k:[190,48,.09,.09,2.5,.5],s:[[185,330],2600,.2,.55,.14],h:[1,.06,.35],c:[.18,.4]},
  '808':{k:[125,44,.25,.34,1.3,.12],s:[[180,330],1800,.15,.45,.1],h:[1.3,.045,.3],c:[.3,.45]},
  hard:{k:[320,55,.06,.13,7,.9],s:[[200,380],3000,.3,.7,.12],h:[1,.05,.45],c:[.22,.55]},
  acoustic:{k:[110,58,.05,.07,1,.3],s:[[190,290],3600,.26,.6,.08],h:[0,.09,.3],c:[.14,.35]}};
function drumHit(d,t,EE,vel){EE=EE||E;vel=vel==null?1:vel;const ac=EE.ac,dest=EE.ch[d].inp,K=KITS[S.kit]||KITS.edm;
  if(playSample(EE,d,null,t,null,vel,dest)){if(d==='kick')sidechain(EE,t);return}
  if(d==='kick'){const[f0,f1,sw,tau,drive,click]=K.k;const o=ac.createOscillator(),g=ac.createGain(),sh=ac.createWaveShaper();const cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/255.5-1;cv[i]=Math.tanh(drive*x)/Math.tanh(drive)}sh.curve=cv;
    o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+sw);g.gain.setValueAtTime(vel,t);g.gain.setTargetAtTime(0.0001,t+0.04,tau);o.connect(sh);sh.connect(g);g.connect(dest);o.start(t);o.stop(t+tau*6+0.1);
    if(S.kit==='acoustic')noiseBurst(EE,t,0.03,'bandpass',900,0.8,click*vel,dest);else noiseBurst(EE,t,0.012,'highpass',3000,0.7,click*vel,dest);sidechain(EE,t)}
  else if(d==='snare'){const[tones,nf,nd,nv,td]=K.s;tones.forEach((fr,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(fr*1.4,t);o.frequency.exponentialRampToValueAtTime(fr,t+0.03);g.gain.setValueAtTime((i?0.25:0.45)*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+td);o.connect(g);g.connect(dest);o.start(t);o.stop(t+td+0.05)});
    noiseBurst(EE,t,nd,'bandpass',nf,0.6,nv*vel,dest);noiseBurst(EE,t,nd*0.6,'highpass',6500,0.7,0.25*vel,dest)}
  else if(d==='hat'){const[mul,dec,lv]=K.h;const g=ac.createGain();g.connect(dest);
    if(!mul){noiseBurst(EE,t,dec,'highpass',8000,0.7,lv*vel,dest);return}
    const bp=ac.createBiquadFilter(),hp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=10000;bp.Q.value=0.8;hp.type='highpass';hp.frequency.value=7000;
    bp.connect(hp);hp.connect(g);[2,3,4.16,5.43,6.79,8.21].forEach(r=>osc(ac,'square',40*r*4*mul,0,t,t+dec+0.08,bp));g.gain.setValueAtTime(lv*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dec)}
  else{const[tail,lv]=K.c;for(let k=0;k<3;k++)noiseBurst(EE,t+k*0.009,0.02,'bandpass',1500,1.5,0.5*vel,dest);noiseBurst(EE,t+0.027,tail,'bandpass',1400,1.2,lv*vel,dest)}}
function sidechain(EE,t){const amt=S.mix.master.sc;if(amt<=0)return;const beat=60/S.bpm;
  for(const c of CHS){if(c==='kick'||!S.mix[c].sc)continue;const g=EE.ch[c].duck.gain;g.setValueAtTime(1-amt*(c==='bass'?1:0.85),t);g.setTargetAtTime(1,t+0.02,beat*0.18)}}

function preview(p,v){ensureCtx();voice(E,S.inst,p,ctx.currentTime+0.01,0.3,v==null?0.9:v)}

// ---------- 재생 ----------
let playing=false,startAt=0,nextTick=0,timer=0,raf=0,st0=0,metroOn=false;
const tickSec=()=>60/S.bpm/PPQ;
function click(EE,t,acc){const o=EE.ac.createOscillator(),g=EE.ac.createGain();o.type='sine';o.frequency.value=acc?1760:1180;g.gain.setValueAtTime(acc?0.3:0.18,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.05);o.connect(g);g.connect(EE.out);o.start(t);o.stop(t+0.06)}
function chordAt(bar){for(let b=bar;b>=0;b--)if(S.chords[b])return S.chords[b];return null}
function scheduleRange(EE,t0,t1,base,metro){const ts=tickSec();
  for(const n of S.notes)if(n.s>=t0&&n.s<t1)voice(EE,S.inst,n.p,base+n.s*ts,n.l*ts*0.98,n.v);
  for(let b=0;b<S.bars;b++){const bt=b*4*PPQ,c=S.chords[b];if(c&&bt>=t0&&bt<t1)chordPlay(EE,S.chordInst,chordVoices(c),base+bt*ts,4*PPQ*ts*0.98)}
  if(S.bassMode!=='off')for(let b=0;b<S.bars;b++){const c=chordAt(b);if(!c)continue;const root=36+c.r,bt=b*4*PPQ;
    const hits=S.bassMode==='sustain'?[[0,4*PPQ]]:S.bassMode==='8th'?[...Array(8)].map((_,i)=>[i*24,22]):[...Array(4)].map((_,i)=>[i*PPQ+24,20]);
    for(const[o,l]of hits){const tt=bt+o;if(tt>=t0&&tt<t1)bassPlay(EE,S.bassInst,root,base+tt*ts,l*ts*0.95)}}
  for(let i=0;i<S.bars*16;i++){const tt=i*12;if(tt>=t0&&tt<t1)for(const d of DRUMS)if(S.drums[d][i])drumHit(d,base+tt*ts,EE)}
  if(metro)for(let tt=Math.ceil(t0/PPQ)*PPQ;tt<t1;tt+=PPQ)click(EE,base+tt*ts,tt%(4*PPQ)===0)}
const loopOn=()=>$('loop').getAttribute('aria-pressed')==='true';
function pump(){const ahead=0.15,now=ctx.currentTime,tot=totalTicks(),span=tot-st0;
  while(true){const k=Math.floor(nextTick/span),local=st0+(nextTick-k*span),base=startAt+(k*span-st0)*tickSec();
    if(startAt+nextTick*tickSec()>now+ahead)break;if(!loopOn()&&nextTick>=span)break;
    scheduleRange(E,local,Math.min(tot,local+12),base,metroOn);nextTick+=12}}
function updatePos(t){const bar=Math.floor(t/(4*PPQ))+1,beat=Math.floor((t%(4*PPQ))/PPQ)+1;$('posOut').textContent=bar+' : '+beat}
let meterBuf=null;
function drawMeter(){const el=$('meterFill');if(!el||!E||!E.meter)return;if(!meterBuf)meterBuf=new Float32Array(E.meter.fftSize);E.meter.getFloatTimeDomainData(meterBuf);let pk=0;for(const v of meterBuf)pk=Math.max(pk,Math.abs(v));
  const db=20*Math.log10(pk+1e-6);const pct=Math.max(0,Math.min(100,(db+48)/48*100));el.style.width=pct+'%';$('meterDb').textContent=pk>0.0005?db.toFixed(1)+' dB':'-∞'}
function frame(){if(!playing)return;const tot=totalTicks(),span=tot-st0,el=(ctx.currentTime-startAt)/tickSec();
  drawMeter();if(el<0){raf=requestAnimationFrame(frame);return}
  if(!loopOn()&&el>=span){stop();return}
  playTick=st0+(el%span);updatePos(playTick);
  const X=playTick*TICKPX,vw=wrap.clientWidth-KEYW;if(X<wrap.scrollLeft||X>wrap.scrollLeft+vw-40)wrap.scrollLeft=Math.max(0,X-40);
  drawRoll();drawRuler();drawLanes();raf=requestAnimationFrame(frame)}
function play(){ensureCtx();applyMix(E,S.mix);playing=true;st0=startTick;startAt=ctx.currentTime+0.08;nextTick=0;pump();timer=setInterval(pump,40);
  $('play').classList.add('on');$('play').setAttribute('aria-label','정지');$('play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>';raf=requestAnimationFrame(frame)}
function stop(){playing=false;clearInterval(timer);cancelAnimationFrame(raf);playTick=-1;updatePos(startTick);
  $('play').classList.remove('on');$('play').setAttribute('aria-label','재생');$('play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>';
  if(E){const old=E,t=ctx.currentTime;old.out.gain.cancelScheduledValues(t);old.out.gain.setValueAtTime(old.out.gain.value,t);old.out.gain.linearRampToValueAtTime(0,t+0.05);
    setTimeout(()=>{try{old.out.disconnect()}catch(e){}},150);E=makeEngine(ctx,true);applyMix(E,S.mix)}
  const mf=$('meterFill');if(mf){mf.style.width='0%';$('meterDb').textContent='-∞'}
  drawRoll();drawRuler();drawLanes()}
$('play').onclick=()=>playing?stop():play();
$('loop').onclick=()=>$('loop').setAttribute('aria-pressed',!loopOn());
$('metro').onclick=()=>{metroOn=!metroOn;$('metro').setAttribute('aria-pressed',metroOn)};

// ---------- 믹서 UI ----------
function mixSlider(label,val,min,max,step,on,fmt){const w=document.createElement('label');w.className='knob';const s=document.createElement('input');s.type='range';s.min=min;s.max=max;s.step=step;s.value=val;s.setAttribute('aria-label',label);
  const v=document.createElement('span');v.className='kv';v.textContent=fmt(val);const l=document.createElement('span');l.className='kl';l.textContent=label;
  s.oninput=()=>{on(+s.value);v.textContent=fmt(+s.value)};s.onchange=()=>save();w.append(l,s,v);return w}
function buildMixer(){const box=$('mixerStrips');box.innerHTML='';
  for(const c of CHS){const m=S.mix[c];const st=document.createElement('div');st.className='strip';st.setAttribute('role','group');st.setAttribute('aria-label',CH_NAME[c]+' 채널');
    const hd=document.createElement('div');hd.className='sh';hd.innerHTML=`<b>${CH_NAME[c]}</b>`;
    const ms=document.createElement('div');ms.className='ms';
    for(const k of ['mute','solo']){const b=document.createElement('button');b.className='tbtn xs';b.textContent=k==='mute'?'M':'S';b.title=k==='mute'?'뮤트':'솔로';b.setAttribute('aria-label',CH_NAME[c]+' '+(k==='mute'?'뮤트':'솔로'));b.setAttribute('aria-pressed',!!m[k]);
      b.onclick=()=>{m[k]=m[k]?0:1;b.setAttribute('aria-pressed',!!m[k]);if(E)applyMix(E,S.mix);save()};ms.appendChild(b)}
    if(c!=='kick'){const b=document.createElement('button');b.className='tbtn xs';b.textContent='SC';b.title='사이드체인 받기: 킥이 칠 때 이 채널 소리가 잠깐 작아져요';b.setAttribute('aria-label',CH_NAME[c]+' 사이드체인 받기');b.setAttribute('aria-pressed',!!m.sc);
      b.onclick=()=>{m.sc=!m.sc;b.setAttribute('aria-pressed',m.sc);save()};ms.appendChild(b)}
    hd.appendChild(ms);st.appendChild(hd);
    st.appendChild(mixSlider('볼륨',m.v,0,1.2,0.01,v=>{m.v=v;if(E)applyMix(E,S.mix)},v=>Math.round(v*100)));
    st.appendChild(mixSlider('팬',m.pan,-1,1,0.05,v=>{m.pan=v;if(E)applyMix(E,S.mix)},v=>v===0?'C':(v<0?'L':'R')+Math.round(Math.abs(v)*100)));
    st.appendChild(mixSlider('리버브',m.rev,0,1,0.01,v=>{m.rev=v;if(E)applyMix(E,S.mix)},v=>Math.round(v*100)));
    st.appendChild(mixSlider('딜레이',m.dly,0,1,0.01,v=>{m.dly=v;if(E)applyMix(E,S.mix)},v=>Math.round(v*100)));
    const eqf=v=>(v>0?'+':'')+v.toFixed(0)+'dB';const eqh=document.createElement('div');eqh.className='sub';eqh.textContent='EQ';st.appendChild(eqh);
    st.appendChild(mixSlider('저음',m.lo,-12,12,1,v=>{m.lo=v;if(E)applyMix(E,S.mix)},eqf));
    st.appendChild(mixSlider('중음',m.mid,-12,12,1,v=>{m.mid=v;if(E)applyMix(E,S.mix)},eqf));
    st.appendChild(mixSlider('고음',m.hi,-12,12,1,v=>{m.hi=v;if(E)applyMix(E,S.mix)},eqf));
    if(c==='melody'||c==='chords'){const T=S.tone[c];const th=document.createElement('div');th.className='sub';th.textContent='음색';st.appendChild(th);
      st.appendChild(mixSlider('밝기',T.br,0.3,2,0.05,v=>{T.br=v},v=>Math.round(v*100)+'%'));
      st.appendChild(mixSlider('어택',T.atk,0,0.8,0.01,v=>{T.atk=v},v=>(v*1000).toFixed(0)+'ms'));
      st.appendChild(mixSlider('릴리즈',T.rel,0.05,2,0.01,v=>{T.rel=v},v=>v<1?(v*1000).toFixed(0)+'ms':v.toFixed(1)+'s'))}
    // 채널별 소리 선택 · 샘플
    const extra=document.createElement('div');extra.className='sx';
    if(c==='chords'){extra.innerHTML=`<select aria-label="코드 소리"><option value="pad">패드</option><option value="supersaw">슈퍼소 코드</option><option value="piano">피아노</option><option value="epiano">일렉트릭 피아노</option><option value="pluck">플럭</option></select>`;
      const sl=extra.firstChild;sl.value=S.chordInst;sl.onchange=()=>{S.chordInst=sl.value;save()}}
    if(c==='bass'){extra.innerHTML=`<select aria-label="베이스 패턴"><option value="off">끔</option><option value="sustain">길게</option><option value="8th">8분</option><option value="offbeat">오프비트</option></select><select aria-label="베이스 소리"><option value="reese">리스</option><option value="sub">서브</option><option value="saw">톱니</option></select>`;
      const[a,b]=extra.children;a.value=S.bassMode;b.value=S.bassInst;a.onchange=()=>{S.bassMode=a.value;save()};b.onchange=()=>{S.bassInst=b.value;save()}}
    if(c==='kick'){const k=document.createElement('select');k.setAttribute('aria-label','드럼 키트');k.title='드럼 키트: 킥·스네어·하이햇·박수 소리가 함께 바뀌어요';
      k.innerHTML='<option value="edm">키트: EDM</option><option value="808">키트: 808</option><option value="hard">키트: 하드</option><option value="acoustic">키트: 어쿠스틱풍</option>';k.value=S.kit;
      k.onchange=()=>{S.kit=k.value;save();ensureCtx();applyMix(E,S.mix);const t=ctx.currentTime+0.02;drumHit('kick',t);drumHit('snare',t+0.3);drumHit('hat',t+0.15);drumHit('hat',t+0.45)};extra.appendChild(k)}
    if(c==='melody'||DRUMS.includes(c))extra.appendChild(sampleCtl(c));
    st.appendChild(extra);box.appendChild(st)}
  const ma=S.mix.master,st=document.createElement('div');st.className='strip master';st.setAttribute('role','group');st.setAttribute('aria-label','마스터');
  st.innerHTML='<div class="sh"><b>마스터</b></div>';
  st.appendChild(mixSlider('볼륨',ma.v,0,1.2,0.01,v=>{ma.v=v;if(E)applyMix(E,S.mix)},v=>Math.round(v*100)));
  st.appendChild(mixSlider('사이드체인',ma.sc,0,0.9,0.01,v=>{ma.sc=v},v=>Math.round(v*100)));
  st.appendChild(mixSlider('리버브 길이',ma.size,0,3,1,v=>{ma.size=v;if(E)applyMix(E,S.mix)},v=>['짧게','보통','길게','아주 길게'][v]));
  const mt=document.createElement('div');mt.className='meter';mt.innerHTML='<div class="mbar"><i id="meterFill"></i></div><span id="meterDb">-∞</span>';st.appendChild(mt);
  box.appendChild(st)}
$('mixReset').onclick=()=>{pushUndo();S.mix=mixDefaults();S.tone=toneDefaults();S.kit='edm';buildMixer();if(E)applyMix(E,S.mix);save();status('믹서를 기본값으로 되돌렸어요.')};

// ---------- 커스텀 에셋 (내 샘플) ----------
const DB_NAME='melody-sketchpad-assets';
function idb(){return new Promise((res,rej)=>{if(!window.indexedDB)return rej(new Error('no idb'));const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('s');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbPut(k,v){try{const db=await idb();await new Promise((res,rej)=>{const tx=db.transaction('s','readwrite');tx.objectStore('s').put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){}}
async function idbDel(k){try{const db=await idb();await new Promise(res=>{const tx=db.transaction('s','readwrite');tx.objectStore('s').delete(k);tx.oncomplete=res;tx.onerror=res})}catch(e){}}
async function idbAll(){try{const db=await idb();return await new Promise(res=>{const out={};const tx=db.transaction('s','readonly');const st=tx.objectStore('s');const rq=st.openCursor();rq.onsuccess=()=>{const c=rq.result;if(c){out[c.key]=c.value;c.continue()}else res(out)};rq.onerror=()=>res(out)})}catch(e){return {}}}
const decoder=()=>ctx||new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,1,44100);
async function decode(ab){const ac=decoder();return await new Promise((res,rej)=>{const p=ac.decodeAudioData(ab.slice(0),res,rej);if(p&&p.then)p.then(res,rej)})}
function sampleCtl(slot){const w=document.createElement('div');w.className='smp';const s=SAMPLES[slot];
  const nm=document.createElement('span');nm.className='sn';nm.textContent=s?s.name:'기본 소리';
  const up=document.createElement('button');up.className='tbtn xs';up.textContent=s?'바꾸기':'내 샘플';up.setAttribute('aria-label',CH_NAME[slot]+' 샘플 넣기');
  const fi=document.createElement('input');fi.type='file';fi.accept='audio/*';fi.hidden=true;
  up.onclick=()=>fi.click();
  fi.onchange=async()=>{const f=fi.files[0];if(!f)return;if(f.size>15*1024*1024){status('샘플은 15MB 이하로 넣어 주세요.');return}
    try{const ab=await f.arrayBuffer();const buf=await decode(ab);const root=s?s.root:60;SAMPLES[slot]={buf,root,name:f.name};await idbPut(slot,{ab,root,name:f.name});
      if(slot==='melody'){S.inst='sample';$('inst').value='sample';save()}buildMixer();status(`${CH_NAME[slot]}에 "${f.name}"을 넣었어요.`)}
    catch(e){status('이 파일은 소리로 읽을 수 없어요. wav나 mp3로 넣어 주세요.')}};
  w.append(nm,up,fi);
  if(s){if(slot==='melody'){const rs=document.createElement('select');rs.className='xs';rs.setAttribute('aria-label','샘플의 기준음');
      for(let p=36;p<=84;p++){const o=document.createElement('option');o.value=p;o.textContent='기준 '+NAMES_S[p%12]+(Math.floor(p/12)-1);rs.appendChild(o)}rs.value=s.root;
      rs.onchange=async()=>{s.root=+rs.value;const all=await idbAll();if(all[slot]){all[slot].root=s.root;idbPut(slot,all[slot])}};w.appendChild(rs)}
    const del=document.createElement('button');del.className='tbtn xs';del.textContent='기본으로';del.onclick=async()=>{delete SAMPLES[slot];await idbDel(slot);if(slot==='melody'&&S.inst==='sample'){S.inst='piano';$('inst').value='piano';save()}buildMixer()};w.appendChild(del)}
  return w}
async function loadSamples(){const all=await idbAll();for(const[k,v]of Object.entries(all)){try{SAMPLES[k]={buf:await decode(v.ab),root:v.root||60,name:v.name}}catch(e){}}buildMixer()}

// ---------- 오디오 저장 (WAV) ----------
function wavBytes(buf){const ch=2,sr=buf.sampleRate,n=buf.length,L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L;const out=new DataView(new ArrayBuffer(44+n*4));
  const w=(o,s)=>{for(let i=0;i<s.length;i++)out.setUint8(o+i,s.charCodeAt(i))};w(0,'RIFF');out.setUint32(4,36+n*4,true);w(8,'WAVE');w(12,'fmt ');out.setUint32(16,16,true);out.setUint16(20,1,true);out.setUint16(22,ch,true);
  out.setUint32(24,sr,true);out.setUint32(28,sr*4,true);out.setUint16(32,4,true);out.setUint16(34,16,true);w(36,'data');out.setUint32(40,n*4,true);
  for(let i=0,o=44;i<n;i++,o+=4){out.setInt16(o,Math.max(-1,Math.min(1,L[i]))*32767,true);out.setInt16(o+2,Math.max(-1,Math.min(1,R[i]))*32767,true)}return new Uint8Array(out.buffer)}
async function renderWav(){const sr=44100,secs=totalTicks()*tickSec()+3;const oc=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(2,Math.ceil(sr*secs),sr);
  const OE=makeEngine(oc,false);applyMix(OE,S.mix);scheduleRange(OE,0,totalTicks(),0.05,false);const buf=await oc.startRendering();return wavBytes(buf)}

// ---------- 마디 복사 ----------
$('cpGo').onclick=()=>{let a=+$('cpFrom').value,b=+$('cpTo').value,c=+$('cpDest').value;if(b<a)[a,b]=[b,a];const n=b-a+1;
  if(c+n-1>S.bars){status(`붙일 자리가 모자라요. ${c}마디부터 ${n}마디를 붙이려면 곡이 ${c+n-1}마디 이상이어야 해요.`);return}
  pushUndo();const BT=4*PPQ,s0=(a-1)*BT,s1=b*BT,d0=(c-1)*BT,d1=d0+n*BT,shift=d0-s0;
  const src=S.notes.filter(x=>x.s>=s0&&x.s<s1).map(x=>({p:x.p,s:x.s+shift,l:Math.min(x.l,s1-x.s),v:x.v}));
  S.notes=S.notes.filter(x=>!(x.s>=d0&&x.s<d1)).concat(src);
  const ch=S.chords.slice(a-1,b);for(let i=0;i<n;i++)S.chords[c-1+i]=ch[i]?{...ch[i]}:null;
  for(const d of DRUMS){const seg=S.drums[d].slice((a-1)*16,b*16);for(let i=0;i<seg.length;i++)S.drums[d][(c-1)*16+i]=seg[i]}
  save();drawAll();status(`${a}~${b}마디를 ${c}~${c+n-1}마디에 복사했어요.`)};

// ---------- 결과 복사 ----------
function posText(t){const bar=Math.floor(t/(4*PPQ))+1,beat=Math.floor((t%(4*PPQ))/PPQ)+1,r=t%PPQ;
  if(r%12===0)return `${bar}.${beat}.${r/12+1}`;if(r%16===0)return `${bar}.${beat}.t${r/16+1}`;return `${bar}.${beat}+${r}/48`}
function lenText(l){if(l%12===0)return String(l/12);if(l%16===0)return 't'+(l/16);return l+'/48'}
function resultText(){const N=names();const key=N[S.root]+(S.mode==='minor'?' 단조':' 장조');const inst={piano:'피아노',epiano:'일렉트릭 피아노',supersaw:'슈퍼소',pluck:'플럭',chip:'칩튠',bell:'벨',sample:'내 샘플'}[S.inst]||S.inst;
  const L=[`[멜로디 스케치] BPM ${S.bpm} · ${key} · ${S.bars}마디 · 악기 ${inst}`];
  L.push('코드: '+S.chords.map((c,i)=>`${i+1}:${c?chordName(c):'-'}`).join(' | '));
  const ns=[...S.notes].sort((a,b)=>a.s-b.s||b.p-a.p);
  L.push('멜로디 (위치 = 마디.박.16분칸, t = 셋잇단 칸 / 길이 = 16분 개수, t = 셋잇단 개수 / v = 세기, 없으면 80):');
  let line=[];ns.forEach((n,i)=>{line.push(`${posText(n.s)} ${nn(n.p)} ${lenText(n.l)}`+(Math.round(n.v*100)!==80?` v${Math.round(n.v*100)}`:''));if(line.length===8||i===ns.length-1){L.push('  '+line.join(' | '));line=[]}});
  if(!ns.length)L.push('  (음 없음)');
  const dn={kick:'킥',snare:'스네어',hat:'하이햇',clap:'박수'};
  for(const d of DRUMS){const a=S.drums[d];if(!a.some(v=>v))continue;const bars=[];for(let b=0;b<S.bars;b++)bars.push(a.slice(b*16,b*16+16).map(v=>v?'x':'.').join(''));L.push(`${dn[d]}: `+bars.join(' '))}
  return L.join('\n')}
$('copy').onclick=async()=>{const t=resultText();const out=$('out');out.value=t;try{await navigator.clipboard.writeText(t);status('복사했어요. 대화에 붙여 주세요.');out.style.display='none'}
  catch(e){out.style.display='block';out.focus();out.select();status('자동 복사가 막혀 있어요. 아래 글을 길게 눌러 복사해 주세요.')}};
function status(s){$('status').textContent=s;clearTimeout(status.t);status.t=setTimeout(()=>$('status').textContent='',4000)}

// ---------- MIDI (zip) ----------
function vlq(n){const b=[n&0x7f];while(n>>=7)b.unshift((n&0x7f)|0x80);return b}
function track(events){events.sort((a,b)=>a.t-b.t||a.o-b.o);const d=[];let last=0;for(const e of events){d.push(...vlq(e.t-last),...e.b);last=e.t}d.push(0,0xff,0x2f,0);
  return [0x4d,0x54,0x72,0x6b,(d.length>>>24)&255,(d.length>>>16)&255,(d.length>>>8)&255,d.length&255,...d]}
function midiBytes(){const us=Math.round(60000000/S.bpm);const tempo=[{t:0,o:0,b:[0xff,0x51,3,(us>>16)&255,(us>>8)&255,us&255]},{t:0,o:0,b:[0xff,0x58,4,4,2,24,8]}];
  const prog={piano:0,epiano:4,supersaw:81,pluck:84,chip:80,bell:14,sample:0}[S.inst]||0;const mel=[{t:0,o:0,b:[0xc0,prog]}];
  for(const n of S.notes){mel.push({t:n.s,o:1,b:[0x90,n.p,Math.max(1,Math.round((n.v==null?0.8:n.v)*127))]});mel.push({t:n.s+n.l,o:0,b:[0x80,n.p,0]})}
  const ch=[{t:0,o:0,b:[0xc1,89]}];S.chords.forEach((c,b)=>{if(!c)return;const t=b*4*PPQ;chordVoices(c).forEach(m=>{ch.push({t,o:1,b:[0x91,m,70]});ch.push({t:t+4*PPQ,o:0,b:[0x81,m,0]})})});
  const dr=[];const map={kick:36,snare:38,hat:42,clap:39};for(const d of DRUMS)S.drums[d].forEach((v,i)=>{if(v){dr.push({t:i*12,o:1,b:[0x99,map[d],100]});dr.push({t:i*12+6,o:0,b:[0x89,map[d],0]})}});
  const tr=[track(tempo),track(mel),track(ch),track(dr)];const head=[0x4d,0x54,0x68,0x64,0,0,0,6,0,1,0,tr.length,0,PPQ];
  return new Uint8Array([...head,...tr.flat()])}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u){let c=0xffffffff;for(const b of u)c=CRC[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function zip(name,data){const enc=new TextEncoder().encode(name);const crc=crc32(data);const le=(n,b)=>Array.from({length:b},(_,i)=>(n>>>(8*i))&255);
  const local=[...le(0x04034b50,4),20,0,0,0,0,0,0,0,0,0,...le(crc,4),...le(data.length,4),...le(data.length,4),...le(enc.length,2),0,0,...enc];
  const off=local.length+data.length;const cen=[...le(0x02014b50,4),20,0,20,0,0,0,0,0,0,0,0,0,...le(crc,4),...le(data.length,4),...le(data.length,4),...le(enc.length,2),0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,...enc];
  const end=[...le(0x06054b50,4),0,0,0,0,1,0,1,0,...le(cen.length,4),...le(off,4),0,0];
  const out=new Uint8Array(local.length+data.length+cen.length+end.length);out.set(local,0);out.set(data,local.length);out.set(cen,off);out.set(end,off+cen.length);return out}
let downloads=null;const inClaude=!!(window.claude&&window.claude.use);
if(inClaude){window.claude.use('downloads').then(d=>{downloads=d;if(d){$('midi').hidden=false;$('saveProj').hidden=false;$('wav').hidden=false}}).catch(()=>{})}
else{$('midi').hidden=false;$('saveProj').hidden=false;$('wav').hidden=false;$('wav').textContent='오디오 저장 (WAV)';$('midi').textContent='MIDI 저장'}
function localDownload(filename,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);status('저장했어요.')}
async function offer(filename,data){if(!downloads)return;try{await downloads.save({filename,data});status('저장했어요.')}catch(e){const c=e&&e.code;
  status(c==='declined'?'저장을 취소했어요.':c==='rate_limited'?'잠시 후 다시 눌러 주세요.':'이 화면에서는 저장할 수 없어요.');if(c==='unavailable'||c==='not_granted'){$('midi').hidden=true;$('saveProj').hidden=true;$('wav').hidden=true}}}
$('midi').onclick=()=>{const m=midiBytes();if(inClaude)offer('melody-sketch-midi.zip',new Blob([zip('melody-sketch.mid',m)]));else localDownload('melody-sketch.mid',new Blob([m],{type:'audio/midi'}))};
function ab64(ab){const u=new Uint8Array(ab);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
function b64ab(b){const bin=atob(b),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer}
const fileName=()=>(lib.list[lib.current]?.name||'melody-sketch').replace(/[\\/:*?"<>|]+/g,'_').slice(0,60);
$('saveProj').onclick=async()=>{const all=await idbAll();const samples={};for(const[k,v]of Object.entries(all))if(v&&v.ab)samples[k]={name:v.name,root:v.root,b64:ab64(v.ab)};
  const j=JSON.stringify({app:'melody-sketchpad',version:2,name:lib.list[lib.current]?.name,song:S,samples});const fn=fileName()+'.json';
  if(inClaude)offer(fn,j);else localDownload(fn,new Blob([j],{type:'application/json'}));const n=Object.keys(samples).length;if(n)setTimeout(()=>status(`프로젝트를 저장했어요 (내 샘플 ${n}개 포함).`),300)};
$('wav').onclick=async()=>{if(!S.notes.length&&!S.chords.some(Boolean)&&!DRUMS.some(d=>S.drums[d].some(Boolean))){status('저장할 소리가 없어요. 먼저 음을 찍어 주세요.');return}
  const b=$('wav');b.disabled=true;status('오디오를 만드는 중이에요…');
  try{const w=await renderWav();if(inClaude)await offer('melody-sketch-audio.zip',new Blob([zip('melody-sketch.wav',w)]));else localDownload('melody-sketch.wav',new Blob([w],{type:'audio/wav'}))}
  catch(e){status('오디오를 만들지 못했어요. 브라우저가 이 기능을 지원하지 않을 수 있어요.')}finally{b.disabled=false}};
// ---------- MIDI 불러오기 ----------
function parseMidi(buf){const d=new DataView(buf);let p=0;const str=n=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(d.getUint8(p+i));p+=n;return s};
  const u32=()=>{const v=d.getUint32(p);p+=4;return v},u16=()=>{const v=d.getUint16(p);p+=2;return v},vlq=()=>{let v=0,b;do{b=d.getUint8(p++);v=(v<<7)|(b&0x7f)}while(b&0x80);return v};
  if(str(4)!=='MThd')throw new Error('MIDI 파일이 아니에요');u32();u16();const nt=u16(),div=u16();if(div&0x8000)throw new Error('지원하지 않는 시간 형식이에요');
  const notes=[],drums=[];let tempo=500000,tempoSet=false;
  for(let k=0;k<nt;k++){while(p<buf.byteLength&&str(4)!=='MTrk'){p+=u32()}if(p>=buf.byteLength)break;const len=u32(),end=p+len;let t=0,rs=0;const open={};
    while(p<end){t+=vlq();let st=d.getUint8(p);if(st&0x80)p++;else st=rs;
      if(st===0xff){const ty=d.getUint8(p++),l=vlq();if(ty===0x51&&!tempoSet){tempo=(d.getUint8(p)<<16)|(d.getUint8(p+1)<<8)|d.getUint8(p+2);tempoSet=true}p+=l;continue}
      if(st===0xf0||st===0xf7){p+=vlq();continue}
      rs=st;const ty=st&0xf0,ch=st&0x0f,a=d.getUint8(p++),b=(ty===0xc0||ty===0xd0)?0:d.getUint8(p++);
      if(ty===0x90&&b>0){if(ch===9)drums.push({t,n:a});else open[ch+':'+a]={t,v:b}}
      else if((ty===0x80)||(ty===0x90&&b===0)){const o=open[ch+':'+a];if(o){notes.push({p:a,t0:o.t,t1:t,v:o.v});delete open[ch+':'+a]}}}
    p=end}
  return{notes,drums,div,bpm:60000000/tempo}}
$('midiIn').onchange=async()=>{const f=$('midiIn').files[0];$('midiIn').value='';if(!f)return;
  try{const r=parseMidi(await f.arrayBuffer());if(!r.notes.length&&!r.drums.length){status('이 MIDI에는 음이 없어요.');return}
    const cv=t=>Math.round(t*PPQ/r.div);const maxT=Math.max(...r.notes.map(n=>cv(n.t1)),...r.drums.map(x=>cv(x.t)+1),1);
    let bars=Math.ceil(maxT/(4*PPQ));const cut=bars>32;bars=Math.min(32,Math.max(1,bars));
    pushUndo();sel.clear();S.bpm=Math.max(60,Math.min(300,Math.round(r.bpm)));S.bars=bars;S.chords=Array(bars).fill(null);
    for(const dname of DRUMS)S.drums[dname]=Array(bars*16).fill(0);const lim=bars*4*PPQ;let moved=0;
    S.notes=r.notes.map(n=>{let p=n.p;while(p<LOW){p+=12;moved++}while(p>HIGH){p-=12;moved++}const s0=cv(n.t0);return{p,s:s0,l:Math.max(3,Math.min(cv(n.t1)-s0,lim-s0)),v:Math.max(0.05,n.v/127)}}).filter(n=>n.s<lim);
    const DM={35:'kick',36:'kick',38:'snare',40:'snare',37:'snare',42:'hat',44:'hat',46:'hat',39:'clap'};
    for(const x of r.drums){const k=DM[x.n];if(!k)continue;const i=Math.round(cv(x.t)/12);if(i<bars*16)S.drums[k][i]=1}
    if(r.notes.some(n=>n.p>=21))S.inst=S.inst||'piano';
    syncControls();save();layout();selChanged();buildMixer();
    status(`${f.name}을 불러왔어요: 음 ${S.notes.length}개, ${S.bpm} BPM, ${bars}마디`+(cut?' (32마디까지만 불러왔어요)':'')+(moved?` · 롤 밖의 음은 옥타브를 옮겼어요`:''))}
  catch(e){status('MIDI를 읽지 못했어요: '+(e.message||'알 수 없는 형식'))}};
$('midiLoad').onclick=()=>$('midiIn').click();
$('loadProj').onclick=()=>$('fileIn').click();
$('fileIn').onchange=async()=>{const f=$('fileIn').files[0];$('fileIn').value='';if(!f)return;
  try{const raw=JSON.parse(await f.text());const song=raw&&raw.app==='melody-sketchpad'?raw.song:raw;if(!song||!song.notes)throw 0;
    const id=newId();lib.list[id]={name:(raw.name||f.name.replace(/\.json$/i,'')).slice(0,40),updated:Date.now()};lsSet(PK(id),JSON.stringify(normalize(song)));openProject(id);
    let n=0;if(raw.samples)for(const[k,v]of Object.entries(raw.samples)){try{const ab=b64ab(v.b64);SAMPLES[k]={buf:await decode(ab),root:v.root||60,name:v.name};await idbPut(k,{ab,root:v.root||60,name:v.name});n++}catch(e){}}
    buildMixer();status(`"${lib.list[id].name}"을 새 프로젝트로 불러왔어요`+(n?` (내 샘플 ${n}개 포함)`:'')+'.')}
  catch(e){status('이 파일은 스케치패드 프로젝트 파일이 아니에요.')}};
// ---------- 내 프로젝트 (여러 곡) ----------
function openProject(id){clearTimeout(saveT);if(playing)stop();lib.current=id;saveLib();let d=null;try{d=JSON.parse(lsGet(PK(id))||'null')}catch(e){}
  S=normalize(d||blank());undoStack=[];sel.clear();$('selBar').hidden=true;startTick=0;syncControls();layout();selChanged();buildMixer();if(E)applyMix(E,S.mix);$('projName').value=lib.list[id].name;updatePos(0)}
function newProject(from){const id=newId();const base=from?JSON.parse(JSON.stringify(S)):{...blank(),bpm:S.bpm,root:S.root,mode:S.mode,inst:S.inst};
  lib.list[id]={name:from?(lib.list[lib.current].name+' 복사본').slice(0,40):'새 곡 '+(Object.keys(lib.list).length+1),updated:Date.now()};save();lsSet(PK(id),JSON.stringify(base));openProject(id);return id}
function renderProjects(){const box=$('projList');box.innerHTML='';const ids=Object.keys(lib.list).sort((a,b)=>lib.list[b].updated-lib.list[a].updated);
  for(const id of ids){const p=lib.list[id],row=document.createElement('div');row.className='prow'+(id===lib.current?' cur':'');
    const nm=document.createElement('div');nm.className='pn';nm.innerHTML=`<b></b><span>${new Date(p.updated).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}${id===lib.current?' · 지금 여는 곡':''}</span>`;nm.querySelector('b').textContent=p.name;
    const bt=document.createElement('div');bt.className='pb';
    const mk=(t,f,lab)=>{const b=document.createElement('button');b.className='tbtn xs';b.textContent=t;b.setAttribute('aria-label',p.name+' '+(lab||t));b.onclick=f;bt.appendChild(b)};
    if(id!==lib.current)mk('열기',()=>{save();openProject(id);$('projDlg').close();status(`"${p.name}"을 열었어요.`)});
    mk('복제',()=>{if(id!==lib.current){save();openProject(id)}newProject(true);renderProjects();status('복제했어요.')});
    mk('삭제',()=>{if(!confirm(`"${p.name}"을 지울까요? 되돌릴 수 없어요.`))return;delete lib.list[id];lsDel(PK(id));if(!Object.keys(lib.list).length){lib.current=null;newProject(false)}else if(id===lib.current){openProject(Object.keys(lib.list).sort((a,b)=>lib.list[b].updated-lib.list[a].updated)[0])}saveLib();renderProjects();status('지웠어요.')});
    row.append(nm,bt);box.appendChild(row)}}
$('projBtn').onclick=()=>{save();renderProjects();const d=$('projDlg');if(d.showModal)d.showModal();else d.setAttribute('open','')};
$('projNew').onclick=()=>{newProject(false);renderProjects();status('새 곡을 만들었어요.')};
$('projClose').onclick=()=>$('projDlg').close();
$('projName').onchange=()=>{const v=$('projName').value.trim().slice(0,40)||'이름 없는 곡';$('projName').value=v;lib.list[lib.current].name=v;saveLib();status('이름을 바꿨어요.')};


$('clear').onclick=()=>{newProject(false);status('새 곡을 만들었어요. 이전 곡은 “내 프로젝트”에 그대로 있어요.')};

// ---------- 확대/축소 ----------
function zoom(ax,dir){const vw=wrap.clientWidth-KEYW,vh=wrap.clientHeight-RULER;
  if(ax==='x'){const ni=Math.max(0,Math.min(ZX_LEVELS.length-1,zxi+dir));if(ni===zxi)return;const ct=(wrap.scrollLeft+vw/2)/TICKPX;zxi=ni;TICKPX=ZX_LEVELS[zxi];drawAll();wrap.scrollLeft=Math.max(0,ct*TICKPX-vw/2)}
  else{const ni=Math.max(0,Math.min(RH_LEVELS.length-1,rhi+dir));if(ni===rhi)return;const cr=(wrap.scrollTop+vh/2)/ROWH;rhi=ni;ROWH=RH_LEVELS[rhi];drawAll();wrap.scrollTop=Math.max(0,cr*ROWH-vh/2)}
  $('zxOut').disabled=zxi===0;$('zxIn').disabled=zxi===ZX_LEVELS.length-1;$('zyOut').disabled=rhi===0;$('zyIn').disabled=rhi===RH_LEVELS.length-1}
$('zxIn').onclick=()=>zoom('x',1);$('zxOut').onclick=()=>zoom('x',-1);$('zyIn').onclick=()=>zoom('y',1);$('zyOut').onclick=()=>zoom('y',-1);
wrap.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoom('x',e.deltaY<0?1:-1)}},{passive:false});
$('moreBtn').onclick=()=>{const o=$('more').classList.toggle('open');$('moreBtn').setAttribute('aria-expanded',o);$('moreBtn').setAttribute('aria-label',o?'설정 접기':'설정 펼치기')};

// 시작
$('projName').value=lib.list[lib.current].name;$('boot')&&$('boot').remove();
syncControls();layout();updatePos(0);loadSamples();loadPiano();
wrap.scrollTop=(HIGH-79)*ROWH-40;
window.addEventListener('resize',()=>{const d=Math.max(1,Math.min(3,window.devicePixelRatio||1));if(d!==DPR){DPR=d;layout()}});
const mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');if(mq&&mq.addEventListener)mq.addEventListener('change',()=>drawAll());
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>drawAll());
})();
