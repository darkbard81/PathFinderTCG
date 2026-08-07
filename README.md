# PathfinderTCG

PathfinderTCG는 [ElvenBattle](../ElvenBattle)을 **PixiJS v8 + TypeScript + Vite**로 포팅하는 저장소다.
원본은 Phaser 4와 `phaser4-rex-plugins`(rexUI)로 만들어진 2D 카드배틀 게임이며, 이 저장소의 목표는 게임 규칙과 데이터를 그대로 유지한 채 렌더링·UI·연출 계층만 PixiJS로 교체하는 것이다.

## 포팅 전제

원본 `src/game/`은 Phaser에 의존하지 않는다(`grep -r phaser src/game` 결과 0건).
따라서 이 포팅은 **재작성이 아니라 뷰 계층 교체**다.

| 계층 | 원본 | 이 저장소에서의 처리 |
| --- | --- | --- |
| 도메인 (`src/game/`) | 프레임워크 비의존 TS | 로직 변경 없이 이식. 테스트도 함께 이식해 동일하게 통과시킨다 |
| 뷰 (`src/phaser/`) | Phaser Scene, rexUI, Tween | `src/pixi/`로 **전면 재작성** |
| 서버·도구 (`src/server/`, `src/tools/`) | Vite middleware, Playwright | 거의 그대로 이식. Phaser 의존 없음 |
| 데이터 (`cards/`, `assets/`) | JSON schema, manifest | 그대로 사용. schema 변경 없음 |

## 개념 대응표 (Phaser 4 → PixiJS v8)

PixiJS는 렌더러이지 게임 프레임워크가 아니다. Phaser가 기본 제공하던 것 중 상당수는 이 저장소가 직접 소유해야 한다.

| Phaser 4 | PixiJS v8 | 비고 |
| --- | --- | --- |
| `new Phaser.Game(config)` | `new Application()` + `await app.init(...)` | 생성자는 인자를 받지 않는다. init은 async |
| `Scene`, Scene Manager | 없음 → `src/pixi/scenes/SceneRouter` | `Container` 기반 화면 + 명시적 lifecycle을 직접 구현 |
| `Phaser.Scale.FIT` | 없음 → `resolveViewportLayout` + 루트 `Container` scale | 고정 가상 해상도를 버리고 반응형으로 전환한다 (아래 참조) |
| `this.load.*` (Loader) | `Assets.init` / `Assets.load` / bundle | `assets.json` manifest를 Pixi 번들로 변환해 등록 |
| rexUI (`this.rexUI.add.*`) | **DOM + CSS** (`src/dom/`) | 캔버스 위젯을 다시 만들지 않는다 (아래 참조) |
| `this.tweens`, `time.delayedCall` | 없음 → `src/pixi/sequence/SequenceRunner` | `Ticker` 위에 시간축 연출을 직접 구현 |
| `GameObject`, `setInteractive()` | `Container` 파생 + `eventMode` | `DisplayObject`는 v8에 없다 |
| `Phaser.GameObjects.Video` | `Assets.load` 비디오 텍스처 + `Sprite` | `.webm` 알파 재생 정책은 이식 시 재검증 필요 |
| `game.registry` | 명시적 DI (`createServices()`) | 전역 mutable 레지스트리는 만들지 않는다 |

## 화면 정책 (원본과 의도적으로 다른 부분)

원본은 1920x1280 가상 해상도를 FIT으로 letterbox 하는 고정 레이아웃이다. 이 저장소는 **1024x768을 최소 해상도로 하는 반응형 뷰 계층**으로 전환한다.

`src/pixi/app/viewport.ts`의 순수 함수 하나가 이 정책을 소유한다.

```
scale  = min(1, viewportWidth / 1024, viewportHeight / 768)
logical = { width: viewportWidth / scale, height: viewportHeight / scale }
```

- 뷰포트가 1024x768 이상이면 `scale = 1`이고 논리 크기는 뷰포트 크기와 같다. 남는 공간은 축소가 아니라 **레이아웃이 사용한다.**
- 어느 한 축이라도 1024x768보다 작으면 그만큼 균일 축소한다. 논리 크기는 **항상 1024x768 이상**이 보장된다.
- 따라서 letterbox 여백이 없다. 캔버스는 항상 뷰포트를 채운다.
- 화면은 고정 좌표가 아니라 `resize(layout)`으로 전달받은 논리 사각형에 맞춰 배치한다.
- devicePixelRatio는 이 계산과 무관하다. `resolution` + `autoDensity`가 따로 처리한다.

UI는 이 정책 위에서 단계별로 변형한다. 큰 화면에서 논리 크기가 계속 커지는 것을 어느 지점에서 멈출지(상한 스케일)는 UI 작업 중에 정한다.

## UI 계층: DOM과 캔버스

원본은 rexUI로 캔버스 위에 UI를 그렸다. 이 저장소는 **화면 크롬을 DOM으로 만든다.**

원본에서 rexUI 호출은 7군데뿐이었고 전부 레이아웃 용도였다 — `sizer`(flexbox), `gridSizer`(grid), `scrollablePanel`(overflow), `overlapSizer`(absolute), `BBCodeText`(리치 텍스트). 브라우저가 이미 공짜로 주는 것을 캔버스 위에 다시 만들 이유가 없고, 반응형 목표에는 CSS가 압도적으로 유리하다. 원본도 타이틀·메인 메뉴는 이미 DOM으로 만들고 있었다.

| 담당 | 대상 |
| --- | --- |
| **DOM** (`src/dom/`) | 타이틀, 저장 슬롯, 메인 메뉴, 스테이지 선택, 덱 편집, 장비, 성장, 로딩, 설정, HUD 크롬 |
| **캔버스** (`src/pixi/`) | 전장 월드 — 보드, 필드 위 카드, **손패**, 드래그 프리뷰, 이펙트, 카메라 |

경계 기준: **월드 좌표계에 속하고 드래그·애니메이션 대상이면 캔버스, 나머지는 DOM.** 손패는 보드로 끌어다 놓는 대상이므로 캔버스에 둔다. 제스처가 DOM과 캔버스 경계를 넘지 않게 하기 위함이다.

지켜야 할 것:

- **스케일 동기화** — 오버레이 루트에 논리 크기와 `transform: scale(scale)`을 적용한다. `scale = 1`에서는 no-op이라 평범한 반응형 CSS고, 최소 해상도 미만에서만 캔버스와 함께 균일 축소된다. 정책 소유자는 `resolveViewportLayout` 하나뿐이다.
- **이벤트** — 오버레이 루트는 `pointer-events: none`, 개별 위젯만 `auto`. 그렇지 않으면 오버레이가 캔버스 입력을 모두 가로챈다.
- **토큰 공유** — `src/theme.ts`가 색·텍스트·surface의 유일한 원본이다. 토큰은 `{ canvas: number, css: '#rrggbb' }` 두 표현을 함께 갖고, 부팅 시 CSS 커스텀 속성으로 주입되어 DOM과 캔버스가 같은 값을 쓴다.
- **z-order 제약** — DOM은 항상 캔버스 위에 있다. 캔버스 이펙트를 DOM UI 위에 얹어야 하면 별도 캔버스 레이어가 필요하다.

## 실행

**Node 22 이상이 필요하다.** `.nvmrc`에 24를 고정해 두었고 `engine-strict`가 켜져 있어 낮은 버전에서는 설치 단계에서 막힌다.

```bash
nvm use      # .nvmrc 적용
npm ci
npm run dev
```

Node 20 이하에서는 `pixi.js`를 import 하는 테스트가 `navigator is not defined`로 실패한다. Node 21부터 `navigator`가 전역으로 제공되고 PixiJS의 `isSafari()`가 이를 읽기 때문이다. 이 요구사항은 우연이 아니라 명시적 제약으로 고정했다.

## 스크립트

- `npm run dev`: Vite 개발 서버
- `npm run build`: `tsc -b` + `vite build` (production 검증)
- `npm run preview`: production 결과 확인
- `npm run test`: Vitest 실행
- `npm run lint` / `npm run format` / `npm run format:check`
- `npm run check`: typecheck, lint, format:check, test를 한 번에 실행하는 최종 gate

`assets/assets.json` 생성기(`npm run assets:build`)는 아직 이식하지 않았다. `sharp` 의존이 필요하며, 현재는 기존 자산 트리의 `assets.json`을 그대로 사용한다.

### 로컬 자산 준비

`assets/`는 git 추적 대상이 아니다. 개발 시에는 실제 자산 트리를 그 경로에 두거나 심볼릭 링크를 건다.

```bash
ln -sfn /path/to/asset-tree assets
```

자산이 없으면 로딩 화면이 `assets.json` 요청 실패를 표시하고, PF2E 출처 검증 테스트 2개는 자동으로 skip된다.

## 목표 디렉터리 구조

```
src/
  game/              # 프레임워크 비의존 도메인 (ElvenBattle에서 이식)
    battle/  save/  stage/  assets/  auth/
  pixi/
    app/             # Application 생성, 반응형 viewport 정책, 부트스트랩
    scenes/          # 화면과 SceneRouter
    sequence/        # SequenceRunner — Ticker 기반 연출 시퀀스 (SequencePlugin 대체)
    assets/          # assets.json manifest ↔ Pixi Assets 번들 연결
  dom/               # DOM UI 오버레이. 화면 크롬은 전부 여기 (rexUI 대체)
  server/            # /tcg 자산과 /api/save-slots middleware
  tools/card-text/   # 카드 텍스트 편집 도구 (별도 진입점)
  config.ts          # 환경 변수와 서버·자산 기본 설정
  theme.ts           # semantic 색상·텍스트·surface 토큰
cards/               # 카드·덱·스테이지 JSON과 schema
assets/              # 로컬 런타임 자산. 전부 git 추적 대상이 아니다.
                     # 실제 디렉터리이거나 외부 자산 트리로의 심볼릭 링크다.
documents/           # 프로젝트 규칙 문서
```

## 진행 단계

1. **골격** — Vite + TS + PixiJS v8 프로젝트 설정, `Application` 부트, 반응형 viewport 정책, `SceneRouter`.
2. **도메인 이식** — `src/game/`과 `cards/`를 변경 없이 옮기고 기존 Vitest를 전부 통과시킨다. 이 단계가 끝나기 전에는 뷰 코드를 쓰지 않는다.
3. **자산 계층** — `assets.json` manifest를 Pixi `Assets` 번들로 등록하고 로딩 진행률·실패 재시도를 갖춘 Loader 화면을 만든다.
4. **UI 기반** — `theme.ts` 이식, 토큰을 CSS 커스텀 속성으로 주입, DOM 오버레이와 스케일 동기화를 담당하는 `DomLayer` 구현. 로딩 화면을 DOM으로 다시 만든다.
5. **화면 이식** — Title → SaveSlot → MainMenu → Stage → DeckBuild → Equipment → Growth 순으로 옮긴다. 규칙이 가장 복잡한 Battlefield는 마지막이다.
6. **연출** — `SequenceRunner`로 wait/shake/video/custom step과 입력 잠금을 복원하고 Battlefield 연출을 붙인다.
7. **서버·도구** — `/tcg`, `/api/save-slots`, 카드 텍스트 도구를 이식하고 두 build 진입점을 확인한다.

## 참고

- 카드 정의는 `cards/card.schema.json`, 스테이지는 `cards/stage.schema.json`을 따른다.
- 저장 슬롯은 로컬 상태로 취급한다.
- 작업 규칙은 [AGENTS.md](AGENTS.md)를 따른다.
- PixiJS API는 [PixiJS v8 문서](https://pixijs.download/release/docs/llms.txt)와 `pixijs-skills` 스킬을 source of truth로 삼는다.

## 권리 고지

이 프로젝트는 비공식·비상업 팬메이드 게임 프로젝트다.

원작과 관련된 상표, 캐릭터, 명칭, 설정, 이미지, 음악, 기타 지식재산권은 각 권리자에게 있다.
본 저장소의 라이선스는 이 프로젝트를 위해 작성된 원본 소스코드와 자체 제작 리소스에만 적용되며, 제3자 지식재산권에 대한 사용 권한을 부여하지 않는다.

본 저장소는 원작의 이미지, 음악, 보이스, 독점 데이터의 재배포를 의도하지 않는다.
권리자 또는 관계자의 문제 제기가 있을 경우 해당 내용을 검토하고 필요한 조치를 취한다.
