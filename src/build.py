"""src 폴더의 원본을 웹사이트용 파일(../public/)로 만들어요.
사용법:  python build.py            (그대로 합치기)
         python build.py --min      (terser·clean-css가 설치돼 있으면 압축까지: npm i -g terser clean-css-cli)

만드는 파일
  public/index.html  화면
  public/style.css   디자인
  public/app.js      동작 (src/js/01~09를 순서대로 합친 것)
  public/piano.js    녹음 피아노 소리 (페이지가 뜬 뒤 따로 불러와요)
  public/piano-soft.js · piano-hard.js  세기 층 (기본 피아노가 준비된 뒤 불러와요)
"""
import os, re, shutil, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.normpath(os.path.join(here, '..', 'public'))
read = lambda *p: open(os.path.join(here, *p), encoding='utf-8').read()
def write(name, text):
    path = os.path.join(out, name); open(path, 'w', encoding='utf-8').write(text)
    print(f'만들었어요: public/{name} ({len(text.encode("utf-8"))/1024:.0f} KB)')

mods = sorted(f for f in os.listdir(os.path.join(here, 'js')) if re.match(r'\d\d-.*\.js$', f))
app = '/* 멜로디 스케치패드 — 읽기 쉬운 원본은 src/js/ (src/index.html과 똑같이 동작하도록 감싸지 않고 순서대로 합침) */\n' + '\n'.join(read('js', m) for m in mods) + '\n'
html = read('index.html')
html = re.sub(r'(<script src="js/\d\d-[^"]+" defer></script>\s*)+', '<script src="app.js" defer></script>\n', html)
html = html.replace('window.PIANO_SRC = "piano-samples.js"', 'window.PIANO_SRC = "piano.js"')
write('index.html', html); write('style.css', read('style.css')); write('app.js', app); write('piano.js', read('piano-samples.js')); write('piano-soft.js', read('piano-soft.js')); write('piano-hard.js', read('piano-hard.js'))

if '--min' in sys.argv:
    for tool, args in (('terser', ['--compress', 'passes=2', '--mangle', '-o']), ('cleancss', ['-O2', '-o'])):
        if not shutil.which(tool): print(f'{tool}가 없어서 압축은 건너뛰었어요'); continue
        f = os.path.join(out, 'app.js' if tool == 'terser' else 'style.css')
        subprocess.run([tool, f] + args + [f], check=True); print(f'압축했어요: {os.path.basename(f)} ({os.path.getsize(f)/1024:.0f} KB)')
