"""src 폴더의 원본을 웹사이트용 세 파일(../public/index.html · style.css · app.js)로 만들어요.
사용법:  python build.py
- app.js = piano-samples.js(피아노 소리) + app.js(동작)를 이어 붙인 것
- 압축은 하지 않아요 (파일이 조금 커지지만 똑같이 동작해요)"""
import os
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.normpath(os.path.join(here, '..', 'public'))
read = lambda n: open(os.path.join(here, n), encoding='utf-8').read()
def write(n, s):
    open(os.path.join(out, n), 'w', encoding='utf-8').write(s)
    print('만들었어요:', n, f'({len(s.encode("utf-8"))/1024:.0f} KB)')
write('index.html', read('index.html').replace('<script src="piano-samples.js" defer></script>\n', ''))
write('style.css', read('style.css'))
write('app.js', read('piano-samples.js').rstrip() + '\n' + read('app.js'))
