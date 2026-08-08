# PathfinderTCG

PathfinderTCG는 [ElvenBattle](../ElvenBattle)을 **PixiJS v8 + TypeScript + Vite**로 포팅하는 저장소다.

> **목표**
> ElvenBattle의 게임 규칙을 한 줄도 바꾸지 않은 채, 뷰 계층만 PixiJS v8 + DOM으로 교체한다.
> 규칙은 `src/game/`이 단독으로 소유하고, 화면은 그 상태를 읽어 그릴 뿐 스스로 판단하지 않는다.

이 문서의 목표는 **처음 온 사람이 저장소를 돌리고, 무엇이 이식 대상이고 무엇이 재작성 대상인지 구분하게** 만드는 것이다.
계층 구조와 설계 규칙은 [Architecture.md](Architecture.md)에, 작업 규칙은 [AGENTS.md](AGENTS.md)에 있다.

## 포팅 전제

원본 `src/game/`은 Phaser에 의존하지 않는다. 따라서 이 포팅은 **재작성이 아니라 뷰 계층 교체**다.

| 계층 | 원본 | 이 저장소에서의 처리 |
| --- | --- | --- |
| 도메인 (`src/game/`) | 프레임워크 비의존 TS | 로직 변경 없이 이식. 테스트도 함께 이식해 동일하게 통과시킨다 |
| 뷰 (`src/phaser/`) | Phaser Scene, rexUI, Tween | `src/pixi/` + `src/dom/`으로 **전면 재작성** |
| 서버·도구 (`src/server/`, `src/tools/`) | Vite middleware, Playwright | 거의 그대로 이식 |
| 데이터 (`cards/`, `assets/`) | JSON schema, manifest | 그대로 사용. schema 변경 없음 |

## 현재 상태

원본 `src/phaser/scenes/`의 모든 화면을 이식했다.

| 원본 화면 | 상태 |
| --- | --- |
| BootScene | `src/main.ts` + `src/pixi/app/create-app.ts`로 흡수 |
| Title / Loader / MainMenu / SaveSlot | 이식 완료 |
| Stage | 이식 완료 |
| DeckBuild / Equipment / Growth | 이식 완료. 세 화면이 공통 작업대 UI를 공유하도록 재설계했다 |
| Battlefield | 이식 완료. 배치·이동·공격·스킬·턴 진행·방어 선택·연출·결과 저장 |

### 아직 이식하지 않은 것

- **카드 정보 패널** — 원본은 카드에 마우스를 올리면 능력 텍스트 상세를 띄운다. 지금은 전장에서 카드 능력을 읽을 방법이 없다. `src/theme.ts`의 `cardInfo*` 토큰이 이것을 위해 남아 있다.
- **`SequenceVideoPlayer`** — `SequenceRunner`의 `video` step은 재생기를 주입하지 않으면 건너뛴다. 현재 주입하지 않는다.
- **행동 팝업 일부** — 원본은 배치·이동·방어에도 색이 다른 텍스트 팝업을 띄운다. 이 저장소는 피해·회복·강화만 연출한다. `colors.popup*` 토큰 5개가 미사용으로 남아 있다.
- **`assets.json` 생성기** — `sharp` 의존이 필요하다. 현재는 기존 자산 트리의 `assets.json`을 그대로 쓴다.

## 원본과 의도적으로 다른 부분

### 반응형 해상도

원본은 1920x1280 가상 해상도를 FIT으로 letterbox 한다. 이 저장소는 **1024x768을 최소 해상도로 하는 반응형**이다.
`src/pixi/app/viewport.ts`의 순수 함수 하나가 이 정책을 소유한다.

```
scale   = min(1, viewportWidth / 1024, viewportHeight / 768)
logical = { width: viewportWidth / scale, height: viewportHeight / scale }
```

- 뷰포트가 1024x768 이상이면 `scale = 1`이고, 남는 공간은 축소가 아니라 **레이아웃이 사용한다.**
- 한 축이라도 최소 해상도보다 작으면 그만큼 균일 축소한다. 논리 크기는 **항상 1024x768 이상**이다.
- letterbox 여백이 없다. 캔버스는 항상 뷰포트를 채운다.
- devicePixelRatio는 이 계산과 무관하다. `resolution` + `autoDensity`가 담당한다.

### UI는 DOM이 그린다

원본은 rexUI로 캔버스 위에 UI를 그렸다. 이 저장소는 **화면 전체를 DOM으로 만든다.**

rexUI 호출은 원본에서 7군데뿐이었고 전부 레이아웃 용도였다 — flexbox, grid, overflow, absolute, 리치 텍스트. 브라우저가 이미 주는 것을 캔버스에 다시 만들 이유가 없고, 반응형 목표에는 CSS가 압도적으로 유리하다.

**전장도 예외가 아니다.** 보드·필드 카드·손패·드래그가 전부 DOM이다. 덱 구성·장비·성장과 **같은 카드 타일 컴포넌트**(`src/dom/screens/card-tile.ts`)를 쓰기 위해서다. 캔버스는 두 장만 쓴다.

```
.pf-battlefield__dialog     결과·방어 모달        DOM
.pf-battlefield__effects    타격 연출             Canvas  ← 위쪽 캔버스
카드 타일 · 손패 · 레일                            DOM
──────────────────────────────────────────────
Pixi 본 캔버스              배경 이미지 + 디밍     Canvas  ← 아래쪽 캔버스
```

DOM 오버레이는 항상 본 캔버스 위에 있다. 카드 **위에** 무언가를 그려야 하면 오버레이 안쪽에 캔버스를 한 장 더 둔다.

### 아키텍처는 MVP(Passive View)

뷰가 모델을 읽지 않는다. Presenter가 뷰 모델을 만들어 밀어 넣고, 뷰는 콜백만 돌려준다. 자세한 규칙은 [Architecture.md](Architecture.md)에 있다.

## 실행

**Node 22 이상이 필요하다.** `.nvmrc`에 24를 고정했고 `engine-strict`가 켜져 있어 낮은 버전은 설치 단계에서 막힌다.

```bash
nvm use      # .nvmrc 적용
npm ci
npm run dev
```

Node 20 이하에서는 `pixi.js`를 import 하는 테스트가 `navigator is not defined`로 실패한다. Node 21부터 `navigator`가 전역으로 제공되고 PixiJS의 `isSafari()`가 이를 읽기 때문이다. 우연이 아니라 명시적 제약이다.

### 로컬 자산 준비

`assets/`는 git 추적 대상이 아니다. 실제 자산 트리를 그 경로에 두거나 심볼릭 링크를 건다.

```bash
ln -sfn /path/to/asset-tree assets
```

자산이 없으면 로딩 화면이 `assets.json` 요청 실패를 표시하고, PF2E 출처 검증 테스트 2개는 자동으로 skip된다.

## 스크립트

- `npm run dev` — Vite 개발 서버
- `npm run build` — `tsc -b` + `vite build`
- `npm run preview` — production 결과 확인
- `npm run test` — Vitest
- `npm run lint` / `npm run format` / `npm run format:check`
- `npm run check` — lint, format:check, test, build를 한 번에 실행하는 최종 gate

## 디렉터리

```
src/
  game/              # 프레임워크 비의존 도메인 (Model). ElvenBattle에서 로직 변경 없이 이식
    battle/  save/  stage/  assets/  auth/
  pixi/
    app/             # Application 생성, 반응형 viewport 정책
    scenes/          # 화면(Presenter)과 SceneRouter
    battle/          # 전장 연출 캔버스
    sequence/        # SequenceRunner — Ticker 기반 연출 시퀀스
    assets/          # assets.json manifest ↔ Pixi Assets 번들
  dom/
    screens/         # 화면 크롬(View). 전장 보드와 카드도 여기 있다
  server/            # /tcg 자산과 /api/* middleware
  tools/card-text/   # 카드 텍스트 편집 도구 (별도 진입점)
  config.ts          # 환경 변수와 서버·자산 기본 설정
  theme.ts           # 색·텍스트·surface 토큰. DOM과 캔버스의 유일한 원본
cards/               # 카드·덱·스테이지 JSON과 schema
assets/              # 로컬 런타임 자산. git 추적 대상이 아니다
documents/           # 프로젝트 규칙 문서
```

## 알려진 부채

문서화 시점에 코드와 규칙이 어긋나 있는 지점이다. 고칠 때까지 여기에 남긴다.

1. **뷰 계약이 두 종류다.** Stage·DeckBuild·Equipment·Growth·Battlefield는 `render(model)` 단방향이고, Title·MainMenu·SaveSlot·Loader는 `setStatus` / `setBusy` 같은 명령형 setter를 노출한다. 뒤쪽 넷은 Passive View 규칙이 서기 전에 만든 화면이다.
2. **`stage-view.ts`가 도메인 함수를 직접 호출한다.** `isStageUnlocked`를 뷰에서 부른다. 잠금 여부는 뷰 모델로 받아야 한다.
3. **프레젠터 코드가 `src/dom/`에 있다.** `battle-card-tile.ts`와 `battle-log.ts`는 `BattleRuntimeState`를 읽어 표시값으로 바꾼다. 하는 일은 Presenter인데 위치가 View 폴더다.
4. **`AGENTS.md`의 UI 경계 규칙이 낡았다.** "손패와 필드 카드는 캔버스"라고 적혀 있으나 실제로는 전부 DOM이다. `npm run assets:build` 스크립트 언급도 현재 `package.json`에 없다.
5. **방어 선택 UI가 실제 덱에서 발동하지 않는다.** `guardian_block` 능력을 가진 카드가 `cards/deck_test.json`에만 있다. 엔진과 UI는 준비돼 있고 카드 데이터 문제다.

## 참고

- 카드 정의는 `cards/card.schema.json`, 스테이지는 `cards/stage.schema.json`을 따른다.
- 저장 슬롯은 로컬 상태로 취급한다.
- 주석 규칙은 [documents/Comment_Rule.md](documents/Comment_Rule.md)를 따른다.
- PixiJS API는 [PixiJS v8 문서](https://pixijs.download/release/docs/llms.txt)와 `pixijs-skills` 스킬을 source of truth로 삼는다.

## 권리 고지

이 프로젝트는 비공식·비상업 팬메이드 게임 프로젝트다.

원작과 관련된 상표, 캐릭터, 명칭, 설정, 이미지, 음악, 기타 지식재산권은 각 권리자에게 있다.
본 저장소의 라이선스는 이 프로젝트를 위해 작성된 원본 소스코드와 자체 제작 리소스에만 적용되며, 제3자 지식재산권에 대한 사용 권한을 부여하지 않는다.

본 저장소는 원작의 이미지, 음악, 보이스, 독점 데이터의 재배포를 의도하지 않는다.
권리자 또는 관계자의 문제 제기가 있을 경우 해당 내용을 검토하고 필요한 조치를 취한다.
