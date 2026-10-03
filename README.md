# 멜로디 스케치패드

브라우저에서 쓰는 **FL Studio식 작곡 도구**예요. 채널 랙·피아노 롤로 패턴을 만들고, 플레이리스트에 패턴을 놓아 곡을 구성해요.

## 새로 들어간 것 (v5)
- 템포 지도 · 믹서 이펙트 칸(압축기·디스토션·로우패스·하이패스·코러스) · 볼륨·필터 자동화
- MIDI 건반 · 자판 건반 · 음 녹음 · 마이크 녹음
- 플레이리스트 조각 늘리기/잘라내기/색 · 노트북 화면 배치
- 피아노 세기 층 (Salamander V3 velocity 4·기본·14)

## 작업 흐름
| 창 | 단축키 | 하는 일 |
|---|---|---|
| 플레이리스트 | F5 | 패턴 조각을 시간 위에 놓아 곡 만들기 (최대 128마디) |
| 채널 랙 | F6 | 악기·드럼 채널, 스텝 버튼으로 박자 찍기 |
| 피아노 롤 | F7 | 고른 채널의 음 찍기 · 박 단위 코드 · 세기 |
| 브라우저 | F8 | 소리 미리 듣기 · 채널로 더하기 · 패턴 목록 |
| 믹서 | F9 | 채널마다 볼륨·팬·리버브·딜레이·EQ, 마스터 |

곡은 **우리 형식 MSK(.msk)**로 저장해요 → [MSK 형식 설명서](docs/msk-format.md). 작은 이진 파일이라 프로젝트 JSON보다 15~45배 작고, 내 샘플까지 담겨요. 내 프로젝트 목록도 브라우저에 MSK로 보관해서 곡을 훨씬 많이 저장할 수 있어요.
**불러오기**는 파일 이름이 아니라 **내용을 스캔해서** 형식(MSK·MIDI·프로젝트·악보)을 알아봐요. 사람이 읽는 **악보 형식(.txt)** → [악보 형식 설명서](docs/score-format.md). **곡 코드**(MSK1.…)로 곡을 글자로 주고받을 수 있고, **파일 변환기**로 모든 형식을 서로 바꿔요. 예제 곡은 `songs/` 폴더에 있어요.

맨 위 **PAT**은 지금 패턴만 반복, **SONG**은 플레이리스트 곡 전체를 재생해요 (L키로 전환). 창은 제목줄을 끌어 옮기고 모서리로 크기를 바꿔요.

## 파일
- `public/` — **웹사이트에 나가는 파일** (Vercel이 이 폴더를 그대로 배포해요)
  - `index.html` 화면 · `style.css` 디자인 · `app.js` 동작 (압축됨)
  - `piano.js` 녹음 피아노 소리 — 화면이 먼저 뜨고, 이 파일은 뒤에서 따로 불러와요 (그동안은 합성 피아노)
  - `og.png` 링크 공유 미리보기 그림 · `apple-touch-icon.png` 휴대폰 홈 화면 아이콘
- `src/` — 고칠 때 보는 **읽기 쉬운 원본** (`src/index.html`을 열면 원본 코드로 바로 실행돼요)
  - `js/00-msk.js` 우리 형식 MSK 읽기·쓰기 · 형식 자동 인식(스캔) · 브라우저 저장
  - `js/01-core.js` 곡 데이터(채널·패턴·플레이리스트)·저장 · `02-view.js` 피아노 롤 그리기 · `03-edit.js` 피아노 롤 편집 · `04-audio.js` 소리 엔진
  - `js/05-play.js` 재생(PAT·SONG) · `06-mixer.js` 믹서 · `07-assets.js` 내 샘플 · `08-io.js` 저장·MIDI·WAV
  - `js/10-rack.js` 채널 랙 · `11-playlist.js` 플레이리스트 · `12-windows.js` 떠다니는 창 · `13-browser.js` 브라우저 · `14-score.js` 악보 텍스트 형식 · `15-convert.js` 악보 붙여넣기·파일 변환기 · `99-app.js` 패턴·설정·시작
  - `piano-samples.js` 피아노 소리 원본 · `build.py` 원본 → `public/` 만들기
- `docs/msk-format.md` — MSK 형식 설명서 (바이트 구조)
- `docs/score-format.md` — 악보 텍스트 형식 설명서
- `songs/` — 예제 곡 (악보 형식)
- `tests/run_tests.py` — 브라우저 자동 테스트 (109가지)
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
- 표준 악기 128종: **GeneralUser GS** — S. Christian Collins (자유 사용 허용, 앱 안 '소리 출처' 창에 표기)
- 오케스트라 15종(현악 4 · 목관 4 · 금관 4 · 마림바 · 글로켄슈필 · 실로폰): **VSCO 2 Community Edition** — Versilian Studios, [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (출처 표기 의무 없음, 감사의 뜻으로 적음). 원본: https://s3.amazonaws.com/VersilianStudios/VSCO-2.1-XRNI-20170216.zip
  - 원본 FLAC을 모노 · 최대 6초(마림바·글로켄 4초, 실로폰 3초) · 끝 0.25초 페이드로 자르고 opus 56kbps로 변환 (마림바·튜바는 고음 손실이 측정돼 96kbps)
  - 원음(`r`)·건반 구역(`k`)·미세 음정(`ft`, 센트)은 파일 이름이 아니라 **실제 소리의 기본 주파수를 재서** 정함. 파일 이름의 옥타브 표기가 실제보다 12 낮으니 다시 만들 때 주의

## 원본을 고친 뒤
1. `src/` 안의 파일을 고쳐요 (`src/index.html`을 열어 바로 확인)
2. `python src/build.py` 실행 → `public/`이 다시 만들어져요 (`--min`을 붙이면 terser로 압축)
3. `python tests/run_tests.py public/index.html`로 자동 테스트 (109가지)
4. GitHub에 올리면 사이트가 자동으로 바뀌어요

## 저장소 공개 범위

지금은 공개입니다. 코드를 보여 주는 편이 신뢰에 도움이 되고, 비공개로 바꾸면
GitHub 릴리스의 설치 파일도 함께 잠겨 내려받기가 막히기 때문입니다.

**6 출시(결제 시작) 때 비공개로 바꿉니다.** 그때 할 일:

1. 설치 파일을 다른 곳으로 옮기기 (Cloudflare R2 권장 — 전송 무료)
   Vercel Blob 은 Hobby 1GB 한도라 115MB 설치 파일에 맞지 않음
   (한도를 넘기면 30일간 Blob 접근이 막혀 **사용자 곡 저장까지 멈춤**)
2. `api/release.js` 의 TAGS 주소를 새 위치로
3. GitHub Settings → Danger Zone → Make private
