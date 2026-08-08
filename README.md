# PathfinderTCG

> **목표**
> Pathfinder 2e 몬스터를 카드로 쓰는 2D 턴제 카드 배틀 게임을 만든다.
> 게임 규칙은 `src/game/`이 단독으로 소유하고, 화면은 그 상태를 읽어 그릴 뿐 스스로 판단하지 않는다.

**PixiJS v8 + TypeScript + Vite**로 만든다. 최소 해상도 1024×768의 반응형 웹 게임이다.

이 문서의 목표는 **처음 온 사람이 저장소를 돌리고, 무엇을 어디에 쓰는지 구분하게** 만드는 것이다.
계층 구조와 설계 규칙은 [Architecture.md](Architecture.md)에, 작업 규칙은 [AGENTS.md](AGENTS.md)에 있다.

## 게임

카드는 Pathfinder 2e 몬스터 데이터에서 뽑아 코스트·지배력·공격·체력 네 수치로 옮긴 것이다.

- 저장 슬롯 3개. 각 슬롯이 덱(리더 1장 + 유닛 29장), 장비, 수집품, 스테이지 진행도를 갖는다.
- 스테이지를 골라 전투에 들어간다. 현재 Level 01~07과 맨 앞의 Test Stage까지 8개다.
- 전장은 진영마다 **전위 3칸 + 후위 3칸**이다. 양측 리더는 후위 가운데에서 시작하고, 손패 5장을 들고 시작한다.
- **배치는 지배력이 정한다.** 빈 칸에 인접한 아군의 지배력 합계 이하 코스트의 카드만 놓을 수 있다. 카드를 놓을수록 놓을 수 있는 칸이 넓어진다.
- 카드는 턴마다 이동·공격·활성 스킬을 각각 한 번 쓴다. 후위는 기본 공격을 못 하고, 후위를 때리려면 그 앞 전위 칸이 비어 있어야 한다.
- 적 리더를 쓰러뜨리면 승리다. 적 묘지에서 카드를 보상으로 얻고, 전투에 참여한 카드는 EXP를 받는다.

## 화면

| 화면 | 역할 |
| --- | --- |
| 타이틀 | 계정 로그인·가입 |
| 로딩 | `assets.json` 기반 자산 프리로드 |
| 메인 메뉴 | 게임 시작, 라이선스, 로그아웃 |
| 저장 슬롯 | 슬롯 3개 선택·생성·삭제 |
| 스테이지 | 스테이지 선택과 최근 전투 결과 |
| 덱 구성 / 장비 / 성장 | 공통 작업대 UI를 공유한다 |
| 전장 | 배치·이동·공격·스킬·턴 진행·방어 선택·연출·결과 저장 |

### 아직 없는 것

- **카드 정보 패널** — 지금은 전장에서 카드 능력 텍스트를 읽을 방법이 없다. `src/theme.ts`의 `cardInfo*` 토큰이 이 화면을 위해 남아 있다. 레이아웃 확정 후에 만든다.
- **행동 팝업 일부** — 피해·회복·강화만 연출한다. 배치·이동·방어에는 연출이 없다. `colors.popup*` 토큰 5개가 미사용이다.
- **영상 연출** — `SequenceRunner`의 `video` step은 재생기를 주입하지 않으면 건너뛴다. 현재 주입하지 않는다.
- **`assets.json` 생성기** — `sharp` 의존이 필요하다. 현재는 준비된 자산 트리의 `assets.json`을 그대로 쓴다.

## 설계 결정

### 반응형 해상도

고정 가상 해상도를 쓰지 않는다. **1024×768이 최소이고 그 위로는 논리 크기가 뷰포트를 따라 늘어난다.**
`src/pixi/app/viewport.ts`의 순수 함수 하나가 이 정책을 소유한다.

```
scale   = min(1, viewportWidth / 1024, viewportHeight / 768)
logical = { width: viewportWidth / scale, height: viewportHeight / scale }
```

- 뷰포트가 1024×768 이상이면 `scale = 1`이고, 남는 공간은 축소가 아니라 **레이아웃이 사용한다.**
- 한 축이라도 최소보다 작으면 그만큼 균일 축소한다. 논리 크기는 **항상 1024×768 이상**이다.
- letterbox 여백이 없다. 캔버스는 항상 뷰포트를 채운다.
- devicePixelRatio는 이 계산과 무관하다. `resolution` + `autoDensity`가 담당한다.

### UI는 DOM이 그린다

PixiJS는 렌더러이지 UI 툴킷이 아니다. 캔버스 위에 위젯 툴킷을 다시 만들지 않는다.
버튼·목록·패널·폼은 물론이고 **전장의 보드·필드 카드·손패·드래그까지 전부 DOM**이다.

전장 카드가 덱 구성·장비·성장과 **같은 카드 타일 컴포넌트**(`src/dom/screens/card-tile.ts`)를 쓰기 위해서다.
카드 표현을 두 벌 유지하면 반드시 어긋난다.

캔버스는 두 장만 쓴다.

```
.pf-battlefield__dialog     결과·방어 모달        DOM
.pf-battlefield__effects    타격 연출             Canvas  ← 위쪽 캔버스
카드 타일 · 손패 · 레일                            DOM
──────────────────────────────────────────────
Pixi 본 캔버스              배경 이미지 + 디밍     Canvas  ← 아래쪽 캔버스
```

DOM 오버레이는 항상 본 캔버스 위에 있다. 카드 **위에** 그려야 하면 오버레이 안쪽에 캔버스를 한 장 더 둔다.

### MVP (Passive View)

뷰가 모델을 읽지 않는다. Presenter가 뷰 모델을 만들어 밀어 넣고, 뷰는 콜백만 돌려준다.
자세한 규칙과 검증 방법은 [Architecture.md](Architecture.md)에 있다.

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

자산이 없으면 로딩 화면이 `assets.json` 요청 실패를 표시하고, 카드 출처 검증 테스트 2개는 자동으로 skip된다.

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
  game/              # 게임 규칙과 저장 상태 (Model). 렌더러에 의존하지 않는다
    battle/  save/  stage/  assets/  auth/
  pixi/
    app/             # Application 생성, 반응형 viewport 정책
    scenes/          # 화면(Presenter)과 SceneRouter
    battle/          # 전장 연출 캔버스와 표시값 변환
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

1. **방어 선택 UI가 실제 덱에서 발동하지 않는다.** `guardian_block` 능력을 가진 카드가 `cards/deck_test.json`에만 있다. 엔진과 UI는 준비돼 있고 카드 데이터 문제다.

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
