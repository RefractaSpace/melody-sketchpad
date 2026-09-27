#!/bin/bash
# public/ 를 앱에 담고(피아노 녹음은 빼고 서버에서 받게), Windows .exe 로 묶어요.
set -e
cd "$(dirname "$0")"
rm -rf app && mkdir app
cp -r ../public/. app/ && rm -rf app/assets app/piano*.js app/og.png
python3 - <<'PY'
p='app/index.html'; h=open(p,encoding='utf-8').read()
h=h.replace('<script>window.PIANO_SRC = "piano.js";','<script>window.MSK_SERVER = "https://melody-sketchpad.vercel.app"; window.PIANO_SRC = "piano.js";',1)
open(p,'w',encoding='utf-8').write(h)
PY
grep -q 'MSK_SERVER' app/index.html
npx --yes @electron/packager . MelodySketchpad --platform=win32 --arch=x64 --out=dist --overwrite --asar --ignore='^/dist' --ignore='^/build.sh' --app-version=5.0.0
cd dist && rm -f MelodySketchpad-win32-x64.zip && zip -qr -9 MelodySketchpad-win32-x64.zip MelodySketchpad-win32-x64 && ls -la MelodySketchpad-win32-x64.zip
