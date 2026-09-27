# 자동 업데이트 정보(latest.yml): electron-updater가 GitHub 릴리스에서 이 파일로 새 버전·검사값을 확인해요
import hashlib, base64, json, datetime
v = json.load(open('package.json'))['version']; f = f'dist/MelodySketchpad-Setup-{v}.exe'; b = open(f, 'rb').read(); h = base64.b64encode(hashlib.sha512(b).digest()).decode()
open('dist/latest.yml', 'w').write(f"version: {v}\nfiles:\n  - url: MelodySketchpad-Setup-{v}.exe\n    sha512: {h}\n    size: {len(b)}\npath: MelodySketchpad-Setup-{v}.exe\nsha512: {h}\nreleaseDate: '{datetime.datetime.utcnow().isoformat(timespec='milliseconds')}Z'\n")
