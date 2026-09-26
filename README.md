# 멜로디 스케치패드

브라우저에서 멜로디·코드·드럼을 찍고 바로 들어 볼 수 있는 피아노 롤이에요.

## 파일
- `public/` — **웹사이트에 나가는 파일** (Vercel이 이 폴더를 그대로 배포해요)
  - `index.html` 화면 · `style.css` 디자인 · `app.js` 동작 + 피아노 소리 (압축됨)
  - `og.png` 링크 공유 미리보기 그림 · `apple-touch-icon.png` 휴대폰 홈 화면 아이콘
- `src/` — 고칠 때 보는 **읽기 쉬운 원본** (`src/index.html`을 열면 원본으로 바로 실행돼요)
  - `build.py` — 원본을 고친 뒤 `python build.py`를 실행하면 `public/`의 세 파일이 다시 만들어져요
- `vercel.json` — "빌드 없이 public 폴더를 배포" 설정

## 배포
이 저장소는 Vercel 프로젝트 `melody-sketchpad`에 연결해서 씁니다. `main` 브랜치에 올리면 https://melody-sketchpad.vercel.app 이 자동으로 바뀌어요.

## 저장
- 작업은 브라우저에 자동 저장돼요 (같은 기기·같은 브라우저).
- **MIDI 저장**: `.mid` 파일로 바로 저장돼요. FL Studio 등에서 열 수 있어요.
- **프로젝트 파일 저장/불러오기**: `.json` 파일로 저장해 두었다가 다른 기기에서 불러올 수 있어요.
- **결과 복사**: 음·코드·드럼을 글로 복사해서 Claude와의 대화에 붙일 수 있어요.

## 크레딧
- 피아노 소리: **Salamander Grand Piano V3** — Alexander Holm, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/). 원본: https://archive.org/details/SalamanderGrandPianoV3 (21음을 최대 8초로 자르고 56kbps mp3로 변환함)

## 원본을 고친 뒤
1. `src/` 안의 파일을 고쳐요 (`src/index.html`을 열면 고친 원본으로 바로 실행돼요)
2. `src` 폴더에서 `python build.py` 실행 → `public/`의 세 파일이 다시 만들어져요 (압축은 안 해요)
3. GitHub에 올리면 사이트가 자동으로 바뀌어요
