# PathfinderTCG Agent Guide

이 문서는 PathfinderTCG 저장소에서 작업하는 사람과 에이전트의 기본 개발 규칙이다.
이 저장소의 현재 목적은 하나다: **ElvenBattle(Phaser 4 + rexUI)을 PixiJS v8로 포팅한다.** 새 게임을 설계하는 곳이 아니다.

작업 전 현재 브랜치, 작업 트리, 원본 구현을 먼저 확인하고 기존 사용자 변경을 보존한다.

규칙의 우선순위는 다음과 같다.

1. 사용자의 현재 요청과 이슈의 명시적 범위
2. 저장소의 실제 설정과 스키마: `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `cards/*.schema.json`
3. 이 문서와 `README.md`, `documents/Comment_Rule.md`
4. 이식 원본 `/home/deck/Documents/ElvenBattle` — 게임 규칙·데이터·화면 흐름의 기준
5. `pixijs-skills` 스킬과 [PixiJS v8 공식 문서](https://pixijs.download/release/docs/llms.txt)
6. 일반적인 프레임워크 관례

충돌하거나 오래된 설명이 있으면 추측하지 말고 상위 source of truth를 따른다.
PixiJS API가 확실하지 않으면 기억으로 쓰지 말고 `pixijs-skills` 하위 스킬이나 공식 문서를 먼저 읽는다.

## 이식 원본 취급 규칙

- `/home/deck/Documents/ElvenBattle`은 **읽기 전용**이다. 어떤 경우에도 수정·커밋하지 않는다.
- 게임 규칙, 카드 효과, 저장 형식, 화면 흐름의 정답은 원본 구현과 원본 테스트다. 포팅 중 "더 나은 규칙"을 발명하지 않는다.
- 원본과 동작이 달라져야 한다면 코드로 결정하지 말고 사용자에게 확인한다.
- 원본에 있는 버그를 발견하면 조용히 고치지 말고 보고한 뒤 지시를 받는다.

## Repository Map

- `src/game/`: PixiJS에 의존하지 않는 전투 규칙, 카드·덱·장비·성장, 저장 상태, 스테이지 진행, 자산 manifest 해석. 원본에서 **로직 변경 없이** 이식한다.
- `src/pixi/app/`: `Application` 생성, 반응형 viewport 정책(`viewport.ts`), 부트스트랩
- `src/pixi/scenes/`: `Container` 기반 화면과 `SceneRouter`. 화면 전환, 입력 전달, 월드 렌더링
- `src/dom/`: DOM UI 오버레이. 화면 크롬 전체와 스케일 동기화를 담당한다 (원본 rexUI 대체)
- `src/pixi/sequence/`: `Ticker` 기반 연출 시퀀스. 원본 `SequencePlugin` / `AnimationSequence` 대체
- `src/pixi/assets/`: `assets.json` manifest를 Pixi `Assets` 번들로 등록하는 경계
- `src/theme.ts`: Canvas UI와 DOM UI가 공유하는 semantic 색상·텍스트·surface 토큰
- `src/server/`: `/tcg` 자산과 `/api/save-slots` 서버 미들웨어
- `src/tools/card-text/`, `tools/card-text/`: 카드 텍스트 도구의 서버·클라이언트와 별도 HTML 진입점
- `src/config.ts`: `PATHFINDER_TCG_*` 환경 변수와 서버·캡처·자산 기본 설정. 원본의 `ELVEN_BATTLE_*` 접두사는 이 저장소에서 사용하지 않는다
- `cards/`: 카드·덱 정의, 스테이지 JSON, `card.schema.json`, `stage.schema.json`
- `assets/`: 로컬 런타임 자산. Git에는 `assets/README.md`만 유지하며 `assets/assets.json`은 생성물이다
- `.data/save-slots/`: 로컬 저장 슬롯 상태. 소스나 테스트 fixture로 간주하지 않는다
- `index.html`, `tools/card-text/index.html`: Vite가 함께 빌드하는 두 진입점

## Commands

**Node 22 이상에서만 동작한다.** 작업 전 `nvm use`로 `.nvmrc`(24)를 적용한다. Node 20에서는 `pixi.js`를 import 하는 테스트가 `navigator is not defined`로 실패하고, `engine-strict`가 설치를 막는다.

- `npm run dev`: Vite 개발 서버
- `npm run build`: `tsc -b`와 `vite build`를 실행하는 필수 production 검증
- `npm run test` / `npx vitest run <test-file...>`: 전체 또는 변경 범위 테스트
- `npm run lint`, `npm run format`, `npm run format:check`
- `npm run check`: typecheck, lint, format:check, test 최종 gate
- `npm run assets:build`: 자산을 변경했을 때만 실행

무관한 파일까지 바꾸는 전체 포맷은 피한다. 필요하면 수정 파일만 Prettier로 정리하고 최종 gate에서 `npm run format:check`를 실행한다.

## Working Method

1. `git status --short --branch`로 브랜치와 기존 변경을 확인한다.
2. 원본 ElvenBattle의 대응 파일, 그 테스트, 관련 스키마를 먼저 읽는다.
3. 필요한 PixiJS API를 `pixijs-skills`에서 확인한다. 기억에 의존해 v7 문법을 쓰지 않는다.
4. 가장 좁은 소유 모듈에서 변경하고, 중복 Helper나 우회 경로를 만들지 않는다.
5. 동작 변경과 함께 같은 경계의 테스트를 추가하거나 갱신한다.
6. 변경 범위의 테스트 → lint → build → format 순으로 검증한다.
7. 최종 diff와 `git status`로 생성물·로컬 데이터·무관한 변경이 섞이지 않았는지 확인한다.

요청이 진단이나 확인만을 요구하면 코드를 수정하지 않는다. 구현 요청이어도 명시된 범위를 넘어서는 리팩터링, 의존성 추가, 외부 상태 변경은 하지 않는다.

## PixiJS v8 규칙

원본이 Phaser라서 v7 시절 Pixi 관용구나 Phaser 습관이 섞이기 쉽다. 아래는 반드시 지킨다.

### Application

- `new Application()`은 인자를 받지 않는다. 모든 옵션은 `await app.init({...})`에 넘긴다.
- `app.canvas`, `app.renderer`, `app.screen`은 `init()` resolve 이후에만 접근한다. `app.view`는 쓰지 않는다.
- Vite production 빌드를 위해 module top-level `await`를 쓰지 않고 async IIFE 안에서 부트스트랩한다.
- `Application`은 `src/pixi/app/`에서 한 번만 만든다. 다른 모듈이 전역 `app`을 import해 화면 상태를 바꾸지 않는다.

### 화면 (Scene)

- PixiJS에는 Scene Manager가 없다. 화면은 `Container`를 소유한 클래스이며 lifecycle(`enter` / `exit` / `update`)은 `SceneRouter`가 명시적으로 호출한다.
- 화면 종료는 `container.destroy({ children: true })`로 서브트리를 정리하고, 등록한 ticker 콜백과 이벤트 리스너를 함께 해제한다. Phaser의 `SHUTDOWN` 자동 정리에 해당하는 것은 없다.
- 화면 간 데이터는 명시적 인자나 저장·도메인 API로 전달하고 mutable global object를 쓰지 않는다.

### 반응형 viewport

- 이 저장소는 고정 가상 해상도를 쓰지 않는다. **최소 해상도는 1024x768이고 그 위로는 논리 크기가 뷰포트에 따라 늘어난다.** 정책은 `src/pixi/app/viewport.ts`의 순수 함수 하나가 소유한다.
- 화면은 좌표를 하드코딩하지 않는다. `resize(layout)`으로 받은 논리 사각형에 맞춰 앵커·비율로 배치한다. `1920`, `1280` 같은 원본 상수를 그대로 옮기지 않는다.
- 논리 크기는 1024x768 이상이 보장되므로 그보다 작은 경우를 방어할 필요는 없지만, **더 큰 경우는 항상 가능하다.** 남는 공간을 중앙 정렬로만 흘려보낼지 레이아웃이 사용할지는 화면마다 의도적으로 정한다.
- 스케일 계산을 화면이나 `UiFactory`에서 다시 하지 않는다. `app.screen`을 직접 읽어 배치하지 않고 라우터가 전달한 layout을 쓴다.
- devicePixelRatio는 viewport 정책과 무관하다. `resolution` + `autoDensity`가 담당한다.

### 씬 그래프

- leaf(`Sprite`, `Graphics`, `Text`, `Mesh`, `ParticleContainer`, `DOMContainer`)에 `addChild`하지 않는다. 그룹이 필요하면 `Container`로 감싼다.
- `DisplayObject`는 v8에 없다. 공통 타입은 `Container`를 쓴다.
- `x`/`y`는 부모 기준 로컬 좌표다. 월드 좌표가 필요하면 `toGlobal()` / `getGlobalPosition()`을 쓴다.
- 크고 정적인 서브트리(보드, UI 레이어, 배경)는 `isRenderGroup: true`로 만든다.
- `sortableChildren`은 자식에게 서로 다른 `zIndex`를 줄 때만 의미가 있다.

### 자산

- `Texture.from(url)`은 로딩하지 않고 캐시만 읽는다. 로딩은 항상 `Assets.load()`다.
- `Assets.add`는 `{ alias, src }` 객체 형태만 쓴다.
- 자산은 화면 단위 번들로 묶고, 화면을 떠날 때 `Assets.unloadBundle()`로 GPU 메모리를 해제한다.
- `assets/` 파일 경로를 gameplay 코드에 하드코딩하지 않고 안정적인 manifest key를 쓴다. URL 조합은 `src/game/assets/manifest.ts`와 `src/pixi/assets/` 경계 밖으로 복제하지 않는다.
- 확장자가 없는 URL만 `parser` 필드로 로더를 지정한다.

### 시간축

- ticker 콜백의 인자는 delta 숫자가 아니라 `Ticker` 인스턴스다. `(ticker) => ... ticker.deltaTime` 형태로 쓴다.
- `deltaTime`은 무차원 배율(60fps에서 1.0)이고 밀리초가 아니다. 실시간 계산은 `deltaMS`를 쓴다.
- 전투 판정과 저장 상태는 프레임 콜백에서 갱신하지 않는다.
- `updateTransform` 오버라이드는 없다. 오브젝트 단위 프레임 로직은 `onRender`를 쓴다.

## Shared Helper First

저장소 공용 Helper가 책임지는 기능을 화면이나 기능 파일에서 다시 구현하지 않는다. 먼저 기존 API를 사용하고, 현재 API가 재사용 가능한 요구를 표현하지 못할 때는 소유 모듈의 타입·구현·테스트를 함께 확장한다. 한 화면에만 필요한 도메인 규칙을 억지로 전역화하지 않으며 mutable singleton도 만들지 않는다.

### UI 경계: DOM과 캔버스

**화면 크롬은 DOM으로 만든다. 캔버스 위젯 툴킷을 다시 만들지 않는다.**

- **DOM**(`src/dom/`): 타이틀, 저장 슬롯, 메인 메뉴, 스테이지 선택, 덱 편집, 장비, 성장, 로딩, 설정, HUD 크롬.
- **캔버스**(`src/pixi/`): 전장 월드 — 보드, 필드 위 카드, **손패**, 드래그 프리뷰, 이펙트, 카메라.
- 경계 기준은 하나다: **월드 좌표계에 속하고 드래그·애니메이션 대상이면 캔버스, 나머지는 DOM.** 손패는 보드로 끌어다 놓는 대상이라 캔버스에 둔다. 제스처가 DOM/캔버스 경계를 넘게 만들지 않는다.
- 레이아웃은 CSS로 한다. flexbox, grid, `overflow`, `position`을 캔버스 좌표 계산으로 대체하지 않는다.
- 색·폰트·surface 값은 `src/theme.ts`가 유일한 원본이다. DOM에는 CSS 커스텀 속성으로 주입된 토큰을 쓰고, 캔버스에는 같은 토큰의 `canvas` 표현을 쓴다. CSS나 화면 코드에 raw hex를 직접 적지 않는다.
- 오버레이 루트는 `pointer-events: none`이고 개별 위젯만 `auto`로 되돌린다. 이 규칙을 어기면 캔버스 입력이 죽는다.
- DOM 오버레이의 스케일은 `DomLayer`가 `resolveViewportLayout` 결과로만 적용한다. 화면이나 CSS에서 스케일을 다시 계산하지 않는다.
- 화면 전환 시 DOM 루트도 캔버스 `view`와 함께 반드시 정리한다. 남은 노드는 다음 화면의 입력을 가로챈다.
- rexUI 위젯을 1:1로 흉내 내지 않는다. 원본 화면이 만족시키던 **요구**를 재현하고 구현은 DOM에 맞게 고른다.

### 연출 시퀀스

- 시간축이 있는 wait, shake, video, custom 연출, 입력 잠금, 공통 재생속도는 `src/pixi/sequence/`의 `SequenceRunner`를 사용한다. 원본 `sequence-types.ts`의 step 계약(`timer`, `duration`, `mode`, `playback`, `action`)을 유지한다.
- 재사용 가능한 새 step은 화면 로컬 타이머·보간 체인으로 복제하지 말고 step 타입, runner, builder, 테스트를 함께 확장한다.
- `SequenceRunner`는 전투 판정이나 저장 상태를 소유하지 않는다. 화면이 확정된 오브젝트, 좌표, 안정적인 manifest key와 실행 순서만 전달한다.
- runner는 화면 lifecycle에 맞춰 한 번 만들고 화면 종료 시 `destroy()`해 타이머, 진행 중 보간, 대기 중 Promise를 정리한다.
- 브라우저별 자산 선택이나 파일 경로 분기는 step과 gameplay ID에 넣지 않는다. manifest·Loader 경계에서 같은 key에 맞는 자산을 고른다.

### 그 외 공용 경계

- 서버·자산 설정은 `src/config.ts`를 사용하고 환경 변수를 다른 파일에서 다시 파싱하지 않는다.
- 자산 URL과 manifest 호환 처리는 `src/game/assets/manifest.ts`, 정적 제공은 `src/server/assets-middleware.ts`를 확장한다.
- 저장 슬롯 HTTP 흐름은 `src/game/save/client-api.ts`와 `src/server/save-slots-api.ts`의 validation·오류 계약을 따른다.
- 같은 계산이나 정책이 두 곳 이상에서 필요하면 책임이 맞는 `src/game`, `src/pixi`, `src/server` 모듈로 올리고 공개 API와 테스트를 함께 추가한다.

## Engineering Conventions

- TypeScript는 `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`를 지킨다.
- `any`와 넓은 타입 단언으로 오류를 숨기지 않는다. 외부 JSON, URL, 저장 데이터는 런타임 검증 후 좁힌다.
- 클래스, public 메서드, 의미 있는 top-level 함수와 새 public API에는 `documents/Comment_Rule.md`에 맞는 간결한 한국어 TSDoc을 작성한다.
- 단순 private/helper와 함수 본문에는 설명을 반복하는 주석을 추가하지 않는다.
- 게임 규칙과 저장 가능한 상태는 `src/game`이 소유한다. 화면은 입력을 action으로 전달하고 상태를 읽어 렌더링한다.
- `Container`, `Sprite`, 보간 상태, 카메라 rig는 disposable view state이며 source of truth가 아니다.
- 카메라, hit-stop, 흔들림, parallax는 규칙과 분리하고 전투 가독성을 우선한다.
- 원본의 파일명, export 이름, 도메인 용어, manifest key를 우선한다. Phaser 전용 이름(`Scene`, `GameObject`, `rexUI`)만 Pixi 개념에 맞게 바꾼다.
- 불필요한 호환 alias나 dead code를 남기지 않는다.

## Data, Assets, and Server Constraints

- 카드 변경은 `cards/card.schema.json`, 스테이지 변경은 `cards/stage.schema.json`과 기존 loader를 따른다. 포팅 과정에서 schema를 바꾸지 않는다.
- 저장 데이터는 schema version과 validation을 유지한다. 전투 중 mutation을 위해 저장 세션의 카드 인스턴스 참조를 공유하지 않는다.
- 자산 변경 후에만 `npm run assets:build`를 실행한다. `assets/assets.json`, 로컬 이미지·폰트·영상은 커밋 대상이 아니다.
- fresh clone에는 런타임 `assets/`와 `.data/`가 없을 수 있다. 존재한다고 가정하거나 임의 fixture로 커밋하지 않는다.
- `/tcg`, `/api/save-slots`, `/api/card-text-tool` 또는 Vite middleware 순서를 바꾸면 해당 서버 테스트와 두 HTML build input을 모두 확인한다.
- 경로, URL, JSON 입출력에는 Node·Web 표준 API를 사용하고 traversal, malformed input, 네트워크 실패를 명시적으로 처리한다.
- 비동기 로딩 실패는 가능한 범위에서 복구·재시도 가능하게 만들고 사용자 흐름을 불필요하게 끊지 않는다.
- 이 개발 환경(SteamOS)에서 Playwright는 **chromium만** 구동된다. 설치·실행 시 브라우저를 chromium으로 명시하고 webkit·firefox 경로를 전제하지 않는다. Playwright는 카드 텍스트 도구의 런타임 의존이며, 에이전트가 화면을 검증하는 용도로 쓰지 않는다.

## Do Not

- 원본 저장소 `/home/deck/Documents/ElvenBattle`을 수정하지 않는다.
- 포팅 중 게임 규칙, 밸런스, 저장 형식, 카드 데이터를 임의로 바꾸지 않는다.
- `pixi.js` v7 API(`beginFill`/`endFill`, `BaseTexture`, `DisplayObject`, `@pixi/*` 서브패키지, 생성자 옵션 `Application`)를 쓰지 않는다.
- 기존 사용자 변경을 덮어쓰거나 요청 없이 `git reset --hard`, checkout 복원, 대량 삭제를 실행하지 않는다.
- 요청 없이 commit, push, branch 생성, PR 작성 또는 이슈 수정을 하지 않는다.
- `.env`, credential, `.data/`, `dist/`, coverage, 임시 캡처, 로컬 runtime asset을 커밋하지 않는다.
- 의존성 변경 없이 `package-lock.json`을 갱신하지 않는다. 새 런타임 의존성(UI·트윈·사운드 라이브러리 포함)은 먼저 사용자에게 확인한다.
- 화면 크롬을 캔버스에 그리지 않는다. 버튼·목록·패널·폼은 DOM으로 만든다.
- CSS나 화면 코드에 raw hex 색상을 적지 않는다. `src/theme.ts`의 토큰을 쓴다.
- DOM 오버레이에서 스케일이나 논리 크기를 다시 계산하지 않는다.
- 화면 로컬 타이머 조합으로 이미 `SequenceRunner`가 소유하는 연출 정책을 중복 구현하지 않는다.
- 보간·애니메이션 완료 여부에 게임 규칙의 정답을 의존시키지 않는다.
- 브라우저를 직접 띄워 시각적 결론을 내리지 않는다. 화면 확인은 사용자의 몫이다.
- schema를 우회한 임의 JSON, 무검증 저장 데이터, 브라우저별로 달라지는 gameplay key를 도입하지 않는다.

## Tests and Verification

변경과 가장 가까운 테스트를 실행하고 위험 경계에 따라 검증을 확장한다.

- 전투·턴·카드 효과: 이식한 `src/game/battle/*.test.ts`. **원본과 동일하게 통과해야 한다.**
- 저장·덱·장비·성장: 관련 save 모듈 테스트와 필요 시 save-slot API 테스트
- UI 경계와 테마 토큰: `src/dom/**/*.test.ts`, `src/theme.test.ts`
- 연출: `src/pixi/sequence/*.test.ts`
- manifest·자산 URL: `src/game/assets/manifest.test.ts`와 자산 middleware 동작
- Vite API·도구: 관련 server 테스트, main과 card-text 두 build entry

### 브라우저 검증은 사용자가 한다

렌더링을 실제로 확인해야 하는 변경은 단위 테스트로 증명하지 않는다. 그리고 **그 확인은 사용자가 직접 브라우저에서 수행한다.**

- 에이전트는 브라우저를 띄워 화면을 확인하지 않고, 스크린샷·Playwright·헤드리스 브라우저로 시각적 결론을 내리지 않는다.
- 에이전트는 "화면이 정상이다", "레이아웃이 맞다" 같은 판정을 하지 않는다. 대신 **사용자가 확인할 항목을 구체적으로 제시**한다: 실행 명령, 접속 주소, 봐야 할 지점, 정상/비정상 판단 기준.
- 코드·타입·단위 테스트 수준의 검증(`npm run check`)은 에이전트가 끝까지 책임진다. 그 경계까지만 결론을 낸다.
- 사용자의 확인 결과를 받기 전에 시각적 변경을 "완료"로 보고하지 않는다.

사용자에게 넘길 확인 항목의 기준선: 최소 해상도 1024x768, 그보다 큰 뷰포트, 최소 해상도 미만(균일 축소 구간)에서의 표시·입력·실패 재시도 흐름.

## Definition of Done

작업 완료는 다음 조건을 모두 만족할 때만 선언한다.

- 요청과 이슈의 완료 조건을 빠짐없이 구현했고 범위 밖 동작은 바뀌지 않았다.
- 이식된 화면·기능이 원본 ElvenBattle과 동일하게 동작한다. 차이가 있으면 의도적 결정이며 사용자에게 보고했다.
- 시각적 변경이 있으면 사용자가 브라우저에서 확인할 항목을 제시했고, 그 결과를 받았다. 받기 전에는 완료가 아니다.
- 새 동작과 회귀 위험을 검증하는 관련 Vitest가 통과한다.
- `npm run check`(또는 lint, build, format:check, test 개별 실행)가 통과한다.
- 자산 변경 시 `npm run assets:build`, schema·서버·UI·연출 변경 시 위의 전용 검증을 수행했다.
- public API, schema, manifest key, 저장 형식의 호환 영향과 migration 필요 여부를 검토했다.
- 최종 diff에 dead code, 우회 Helper, 무관한 포맷 변경, generated/local 파일, 비밀정보가 없다.
- 사용자에게 변경 요약, 실행한 검증, 남은 수동 확인이나 알려진 제한을 정확히 전달한다.

## PR Expectations

- PR은 하나의 이슈·목적에 집중하고 drive-by 리팩터링을 섞지 않는다. 포팅은 화면 단위로 쪼갠다.
- 제목과 commit은 `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:` 등 명확한 type과 짧은 요약을 사용한다.
- 본문에는 사용자 관점의 변화, 대응하는 원본 파일, 공용 Helper 변경, 호환성·schema·asset 영향, 실행한 명령과 결과를 적는다.
- 시각 변경에는 필요한 경우 before/after 캡처나 재현 절차를 제공하되 로컬 캡처 파일 자체를 소스에 남기지 않는다.
- 리뷰 전에 전체 diff와 새 파일을 확인하고 Definition of Done을 체크한다.
