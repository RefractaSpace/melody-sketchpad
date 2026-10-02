/* 30-composer.js — 스케치패드 AI 작곡기 (가족 앱). 주소 /composer (= /?app=composer)
   스케치패드와 같은 엔진(음악 AI 2)을 쓰고, 화면만 "글 → 곡" 하나로 단순하게. 만든 곡은 내 프로젝트에 저장됨. */
const CP = new URLSearchParams(location.search).get('app') === 'composer';
if (CP) {
  document.body.classList.add('composer'); $('composerApp').hidden = false; document.title = '스케치패드 AI 작곡기';
  let len = 'song', busy = false, lastWav = null, lastName = '', t0 = 0, n = 0;
  const say = m => { $('czStatus').textContent = m; };
  document.querySelectorAll('.cz-chips button').forEach(b => b.onclick = () => { $('czPrompt').value = b.dataset.p; $('czPrompt').focus(); });
  document.querySelectorAll('.cz-seg button').forEach(b => b.onclick = () => { len = b.dataset.len; document.querySelectorAll('.cz-seg button').forEach(x => x.setAttribute('aria-checked', x === b)); });
  // 분위기에 맞는 빠르기
  const bpmFor = t => /잔잔|밤|발라드|느리|조용|꿈|로파이|lofi|슬픈/.test(t) ? (/로파이|lofi|꿈/.test(t) ? 80 : 76) : /신나|축제|댄스|edm|빠르|파워/.test(t) ? 124 : 104;
  async function make(again) {
    if (busy) return; busy = true; $('czGo').disabled = $('czAgain').disabled = true; $('czBar').hidden = false; t0 = performance.now();
    const prompt = $('czPrompt').value.trim() || '밝은 팝, 드럼', tick = m => say(`${m} · ${((performance.now() - t0) / 1000).toFixed(0)}초`);
    try {
      tick(mvModels.multitrack_chords ? '음악 AI가 짓는 중' : '음악 AI 모델을 받는 중 (처음 한 번)');
      newProject(false); n = Object.keys(lib.list).length; lastName = ('AI 작곡기 · ' + prompt).slice(0, 40); lib.list[lib.current].name = lastName;
      S.bpm = bpmFor(prompt.toLowerCase()); S.root = [0, 2, 5, 7, 9][Math.floor(Math.random() * 5)]; S.mode = 'major'; S.playlist.clips = [];
      const seed = (Date.now() & 0xffff) || 1; let info = '';
      try {
        if (len === 'song') { const r = await musicArrange({prompt, seed, tries:4, onStep:tick}); info = `곡 전체 ${r.bars}마디 · 인트로·벌스·후렴·브리지·후렴·아웃트로`; }
        else { const {data} = await musicSection({prompt, bars:8, seed, tries:4, fill:false}); const res = applyCompose(data, prompt); S.playlist.clips.push({id:newId(), pat:res.P.id, t:0, bar:0}); S.playMode = 'song'; save(); info = '8마디'; }
      } catch (e) {   // 인터넷이 없거나 모델을 못 받으면 규칙 AI로
        const d = localCompose({prompt, bars:8, seed}), res = applyCompose(d, prompt); S.playlist.clips = [{id:newId(), pat:res.P.id, t:0, bar:0}]; S.playMode = 'song'; save(); info = '8마디 · 규칙 AI (음악 AI를 쓸 수 없어서)';
      }
      tick('소리 만드는 중');
      const buf = await renderWav(); lastWav = buf instanceof Uint8Array ? buf : wavBytes(buf);
      const url = URL.createObjectURL(new Blob([lastWav], {type:'audio/wav'})), a = $('czAudio'); if (a.src) URL.revokeObjectURL(a.src); a.src = url;
      $('czName').textContent = lastName; $('czInfo').textContent = `${info} · ${S.bpm} BPM · ${((performance.now() - t0) / 1000).toFixed(0)}초 걸림`;
      $('czResult').hidden = false; { const keep = {...CS}; Object.assign(CS, {bg:'#0b0b0d', mute:'#777', line2:'#3a3a40'}); drawThumb($('czThumb'), S); Object.assign(CS, keep); } say('완성했습니다.'); a.play().catch(() => {});
      $('czResult').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'nearest'});
    } catch (e) { say('만들지 못했습니다: ' + e.message); }
    busy = false; $('czGo').disabled = $('czAgain').disabled = false; $('czBar').hidden = true; void again; void n;
  }
  $('czGo').onclick = () => make(false); $('czAgain').onclick = () => make(true);
  $('czPrompt').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); make(false); } };
  $('czMp3').onclick = async () => { if (!lastWav) return; say('MP3로 바꾸는 중'); try { const m = await wavToMp3(lastWav); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([m], {type:'audio/mpeg'})); a.download = lastName.replace(/[\\/:*?"<>|]/g, '') + '.mp3'; a.click(); say('MP3를 저장했습니다.'); } catch (e) { say('MP3로 바꾸지 못했습니다: ' + e.message); } };
  $('czOpen').onclick = e => { e.preventDefault(); save(); location.href = '/'; };   // 같은 프로젝트 목록이라 스케치패드가 이 곡을 열어 둠
  setTimeout(() => mmLoad().then(() => Promise.all([mmModel('chord_pitches_improv'), mvModel('multitrack_chords')])).catch(() => {}), 600);   // 미리 받기
  setTimeout(() => $('czPrompt').focus(), 100);
}
