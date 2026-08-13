# Architecture

> **목표**
> 이 문서의 목표는 **변경을 어느 계층에 놓을지 혼자 결정할 수 있게** 만드는 것이다.
> 계층 간 의존 방향을 단방향으로 못 박고, 각 경계를 넘는 데이터의 형태와 그 경계를 지키는 방법을 적는다.

저장소 전반과 실행 방법은 [README.md](README.md), 작업 규칙은 [AGENTS.md](AGENTS.md)에 있다.

## 1. 계층과 의존 방향

이 저장소는 **MVP(Model–View–Presenter)의 Passive View** 변형이다. MVC가 아니다 — 뷰가 모델을 한 번도 읽지 않기 때문이다.

```
        ┌──────────────────────────────────────┐
        │  Presenter   src/pixi/scenes/*Scene  │
        └───────┬──────────────────────┬───────┘
        도메인 호출                뷰 모델 push
                │                      │
                ▼                      ▼
   ┌────────────────────┐   ┌────────────────────┐
   │  Model  src/game/  │   │  View  src/dom/    │
   │  규칙 · 저장 상태  │   │  DOM 크롬 · 렌더   │
   └────────────────────┘   └────────────────────┘
                ▲                      │
                └──────── ✗ ───────────┘
                   이 화살표는 없다
```

**의존 규칙**

| 규칙 | 검증 방법 |
| --- | --- |
| `src/game/`은 `src/pixi`·`src/dom`을 import 하지 않는다 | `grep -rn "from '\.\./\.\./pixi\|from '\.\./\.\./dom" src/game` → 0건 |
| `src/dom/`은 `src/pixi`를 import 하지 않는다 | `grep -rn "from '\.\./\.\./pixi" src/dom` → 0건 |
| `src/dom/`은 도메인을 **타입으로만** 참조한다 | 위반 0건. 아래 검사 스크립트로 확인한다 |
| Presenter는 `src/pixi/scenes/`에만 있다 | 도메인 호출과 뷰 모델 조립이 일어나는 유일한 곳 |

세 번째 규칙은 `grep`으로 잡히지 않는다. 멀티라인 import와 `import type` / 인라인 `type` 두 표기를 모두 봐야 한다.

```bash
node -e "
const fs=require('fs');
let bad=0;
for (const f of fs.readdirSync('src/dom/screens').filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts'))) {
  const s=fs.readFileSync('src/dom/screens/'+f,'utf8');
  for (const [,isType,clause,spec] of s.matchAll(/import(\s+type)?\s+([\s\S]*?)from\s+'([^']+)'/g)) {
    if(!spec.includes('/game/')) continue;
    const typeOnly = !!isType || clause.replace(/[{}\s]/g,'').split(',').filter(Boolean).every(x=>x.startsWith('type'));
    if(!typeOnly){ console.log('VALUE import:', f, spec, clause.replace(/\s+/g,' ').trim()); bad++; }
  }
}
console.log(bad===0 ? 'OK' : bad+' violations');
"
```

### 각 계층의 책임

**Model — `src/game/`**

게임 규칙과 저장 가능한 상태를 단독으로 소유한다. 렌더러를 알지 않으며, 규칙의 정답은 이 계층의 테스트다.

- `battle/` — 전투 경계의 공유 타입(`types.ts`), 서버와 주고받는 형태(`protocol.ts`), 브라우저 클라이언트(`client-api.ts`). **전투 엔진은 여기 없다. `src/server/battle/`에 있다**
- `save/` — 저장 슬롯, 덱, 장비, 성장
- `stage/` — 스테이지 정의, 진행도, 전투 결과와 보상
- `assets/` — manifest 해석
- `auth/` — 계정·세션

**View — `src/dom/screens/`**

DOM 엘리먼트를 만들고 뷰 모델을 받아 그린다. 규칙을 알지 않는다.

```ts
export function createXView(options: XViewOptions): XView;

export type XView = {
  element: HTMLElement;                    // 라우터가 오버레이에 붙인다
  render: (model: XViewModel) => void;     // 유일한 갱신 경로
};

export type XViewOptions = {
  onSomething: (payload: …) => void;       // 유일한 입력 경로
};
```

모든 화면이 이 형태다. 예외는 `TitleView`의 `clearPassword` / `focusId` / `focusPassword` 셋뿐이다.
이들은 **상태가 아니라 사건**이라 `render`로 표현하지 않는다 — 포커스는 한 번 일어나는 일이고,
입력값을 매 렌더마다 되돌리면 사용자가 타이핑할 수 없다.
`BattlefieldView`의 `effectsHost` / `getSlotCenter`는 갱신 API가 아니라 연출 캔버스가 붙을 지점과 좌표 조회다.

**Presenter — `src/pixi/scenes/*Scene.ts`**

화면 상태를 보유하고, 도메인을 호출하고, 결과를 뷰 모델로 조립해 밀어 넣는다. `Scene` 인터페이스를 구현해 `SceneRouter`가 lifecycle을 관리한다.

`BattlefieldScene`이 전형이다. 규칙 판단이 하나도 없다:

```ts
resolveTargets(source)  →  listPlaceActions/listMoveActions/listAttackActions 로 합법 수를 받아
                           슬롯 id 목록만 뷰에 넘긴다
onDrop(source, slotId)  →  그 목록에서 액션을 찾아 apply*Action 을 부른다
```

## 2. 화면 lifecycle

`SceneRouter`가 전환을 직렬화한다. 순서가 중요하다.

```
[이전 화면]  exit()
           → ticker.remove(update)
           → domLayer.unmount()
           → root.removeChild(view) → view.destroy({ children: true })

[다음 화면]  root.addChild(view)
           → domLayer.mount(element)
           → resize(layout)          ← enter() 보다 먼저다
           → await enter()
           → ticker.add(update)      ← enter() 가 resolve 된 뒤다
```

**주의: `enter()` 안에서 ticker 프레임을 기다리면 교착한다.**
`update` 콜백은 `enter()`가 resolve된 뒤에야 등록된다. `enter()`에서 프레임 기반 연출이나 대기를 `await` 하면 프레임이 영원히 오지 않는다. `BattlefieldScene.enter()`가 자동 턴 진행을 `void`로 띄우고 기다리지 않는 이유가 이것이다.

자동 정리는 없다. 등록한 ticker 콜백, 이벤트 리스너, 만든 캔버스는 `exit()`에서 직접 해제한다.

## 3. 좌표계 세 개

혼동이 잦은 지점이다. 세 좌표계가 있고 변환 지점이 정해져 있다.

| 좌표계 | 크기 | 소유자 |
| --- | --- | --- |
| **화면 좌표** | 실제 뷰포트 픽셀 | 브라우저. `clientX/Y`, `getBoundingClientRect()` |
| **논리 좌표** | 최소 1024x768, 그 이상은 뷰포트에 따라 확장 | `resolveViewportLayout` (`src/pixi/app/viewport.ts`) |
| **보드 좌표** | 카드 크기·간격에서 파생 | `resolveBattleBoardMetrics` (`src/dom/screens/battlefield-layout.ts`) |

- 캔버스는 루트 `Container`에 `scale`을 적용해 논리 좌표로 그린다.
- DOM 오버레이는 논리 크기 + `transform: scale(scale)`로 같은 좌표계를 쓴다. `scale = 1`에서는 no-op이라 평범한 반응형 CSS다.
- 화면 좌표 → 논리 좌표 변환은 `toLogicalPoint`(`src/dom/screens/battle-drag.ts`) **하나만** 쓴다. 드래그 고스트 위치와 연출 캔버스 좌표가 같은 함수를 거친다.

**스케일 계산은 `resolveViewportLayout`만 한다.** 화면이나 CSS에서 다시 계산하지 않는다.

## 4. 경계를 넘는 것들

### 뷰 모델

Presenter가 매 렌더마다 새로 조립한다. 도메인 객체를 그대로 넘기지 않는다 — 뷰가 도메인 타입을 알게 되면 규칙을 부르고 싶어진다.

전장 예시:

```ts
BattlefieldViewModel = {
  metrics,                  // 계산된 픽셀 치수
  slots: Record<BattleRowId, BattleSlotModel[]>,
  hand: BattleHandCardModel[],
  blockPrompt, result, log, canEndTurn, …
}

BattleSlotModel = {
  card: CardTile | null,    // 도메인 카드가 아니라 표시용 값
  dominance: number | null, // 빈 칸의 인접 지배력. 이미 계산된 결과
  ready: boolean | null,    // 행동이 남았는지. 왜 남았는지는 뷰가 모른다
  skills: BattleSkillBadgeModel[],
}
```

### 입력

뷰는 콜백으로만 되돌린다. 콜백 이름은 **사용자가 한 일**이지 도메인 액션이 아니다.

```ts
onDrop(source: BattleDragSource, slotId: BattleSlotId)   // "여기에 놓았다"
```

`BattleDragSource`가 `hand | card | skill` 셋을 구분하고, 어느 도메인 액션이 될지는 Presenter가 정한다.

### 테마 토큰

`src/theme.ts`가 색·텍스트·surface의 **유일한 원본**이다. 토큰은 두 표현을 함께 갖는다.

```
UI_THEME.colors.accent  →  { canvas: 0xbfeec5, css: '#bfeec5' }
                            └ Pixi                └ CSS
```

`src/dom/theme-css.ts`가 부팅 시 CSS 커스텀 속성으로 주입한다. 이름 규칙은 `--pf-<group>-<name>` (kebab-case).

```
UI_THEME.dom.battlefield.slotDropRing  →  --pf-battlefield-slot-drop-ring
UI_THEME.surfaces.modal                →  --pf-surface-modal  (rgba로 합침)
```

**CSS나 화면 코드에 raw hex를 적지 않는다.**

### 연출

`src/pixi/sequence/SequenceRunner`가 시간축을 소유한다. `Ticker` 위에서 step 시간표(`timer` / `duration` / `mode` / `playback` / `action`)를 재생한다.

`SequenceTarget`은 구조 타입(`{ x, y, destroyed, parent }`)이라 Pixi `Container`뿐 아니라 테스트 대역도 만족한다.

**runner는 전투 판정을 소유하지 않는다.** 화면이 확정된 좌표와 순서만 넘긴다.

## 5. 전장 상세

가장 복잡한 화면이라 별도로 적는다.

### 규칙은 서버 엔진이 전부 갖고 있다

전투 판정은 브라우저에 없다. `src/server/battle/battle-engine.ts`가 합법 수를 전부 계산하고 적용하며, 브라우저는 **행동 의도만 보낸다.**

```
Browser                          Server
BattlefieldScene                 battle-api.ts
  ↓ 행동 의도                     ↓
services.battle  ──POST /api/battles/:id/actions──▶  BattleSession
  ◀── events + 공개 상태 ─────────────────────────      battle-engine.ts
연출 · 기록 · 뷰 모델                                   ability-handlers.ts / AI / RNG
```

```
listPlaceActions / listMoveActions / listAttackActions
listActiveSkillActions / listBlockActions        → 합법 수 목록
apply*Action                                     → 적용
stepAutomatedTurn                                → 자동 진영의 한 수
applyAutoTurnEndIfStalled                        → 둘 수 없으면 턴 종료
```

`runAutomatedTurnUntilBlockDecision`은 `stepAutomatedTurn`을 반복하는 얇은 래퍼다. 연출이 한 수씩 보여줄 수 있도록 쪼갠 것이며, 둘이 갈라지지 않도록 위에 얹었다.

**서버가 유일한 판정자다.** 서버는 `BattleRuntimeState`를 소유하고, 요청이 올 때마다 지금 상태에서 합법성을 다시 계산한다. 클라이언트가 보낸 본문에서 읽는 값은 행동 종류·카드 id·칸 id뿐이라(`readBattleCommand`) HP·턴·필드를 실어 보내도 판정에 닿지 않는다.

브라우저가 받는 것은 런타임이 아니라 **공개 상태**(`BattlePublicState`)다. 적 손패와 양측 덱 내용은 빠지고, 서버가 이미 판정한 합법 수가 칸마다 붙어 온다. 그래서 화면은 규칙을 다시 세지 않는다.

| 명령 | 뜻 |
| --- | --- |
| `PLACE` / `MOVE` / `ATTACK` / `ACTIVE_SKILL` | 내가 시도한 수. 카드와 칸만 보낸다 |
| `END_TURN` | 내 턴을 넘긴다 |
| `ADVANCE` | 적 자동 턴을 한 수만 진행한다. 연출을 한 수씩 보여주려고 쪼갠다 |
| `RESOLVE_BLOCK` | 방어 선택을 마감한다 |

### 조작: 잡는 곳으로 모호성을 없앤다

드래그 앤 드롭에서 "적 카드에 놓았을 때 공격인가 스킬인가"는 **잡는 곳을 나눠서** 해결한다. 드롭 후 되묻는 팝업이 없다.

| 잡는 곳 | 대상 | 액션 |
| --- | --- | --- |
| 손패 카드 | 내 진영 빈 칸 | `PLACE` |
| 필드 카드 몸통 | 내 진영 빈 인접 칸 | `MOVE` |
| 필드 카드 몸통 | 적이 선 칸 | `ATTACK` |
| 스킬 배지 | 스킬 대상 칸 | `ACTIVE_SKILL` |

이동 대상은 빈 칸, 공격 대상은 점유 칸이라 몸통 드래그 안에서도 겹치지 않는다.

### 드래그 중에는 렌더하지 않는다

다시 그리면 잡고 있던 엘리먼트가 교체되면서 **포인터 캡처가 끊긴다.** 그래서 합법 칸 강조는 `render`를 거치지 않고 `battle-drag.ts`가 class만 켜고 끈다.

```ts
resolveTargets(source) → BattleSlotId[]   // 드래그 시작 시 한 번 물어본다
onDrop(source, slotId)                    // 드래그가 끝난 뒤에야 render 한다
```

칸 판정도 `document.elementFromPoint`가 아니라 **사각형 비교**다. 오버레이가 `pointer-events: none`이라 슬롯 div가 히트테스트에서 걸러지기 때문이다. 드래그 시작 시 합법 칸의 rect를 한 번 재서 쓴다.

카드 이미지에는 `draggable = false`가 필요하다. 켜 두면 브라우저 기본 드래그가 먼저 발동해 `pointercancel`로 포인터 시퀀스를 끊는다.

### 강조는 카드 위에 그린다

카드 타일이 칸을 꽉 채우므로 칸의 `border`·`background`로는 카드가 선 칸을 강조할 수 없다. `.pf-battlefield__slot::after` 오버레이(`z-index: 5`, `pointer-events: none`)에 `inset` 그림자로 그린다.

### 전투 결과도 서버가 적는다

승패·보상 추첨·참여 EXP는 서버가 정한다. **적는 것까지 서버가 한다.**

```text
전투 종료 → BattleSession이 결과를 만든다
          → battle-api가 저장 슬롯을 읽어 반영하고 쓴다
          → BattlePublicState.savedState로 브라우저에 내려간다
브라우저   → 결과를 그리고 Stage 화면에 넘긴다. 저장 API를 부르지 않는다
```

반영에 실패하면 요청 전체를 실패로 만들지 않고 `saveError`만 함께 내려보낸다.
전투 판정은 이미 끝나 있어 결과 화면은 보여 줘야 하고, 다음 요청에서 다시 시도한다.

### 저장 API는 사용자가 정하는 것만 받는다

`PUT /api/save-slots/:slotId`는 문서 전체를 받지만 **본문에서 읽는 필드가 정해져 있다.**

```
본문에서 읽는다     saveName · deck · equipment · lobby
                    stageProgress.lastSelectedStageId / stageBgmIds
디스크에서 가져온다  createdAt · exp · resources · stageProgress.clearedStageIds
```

허용 목록이라 저장 스키마에 필드를 더해도 기본값이 '서버 소유'다. 보호를 깜빡할 자리가 없다.

EXP는 `instanceId`별로 지킨다. 카드가 덱과 보유함을 오가도 EXP가 카드를 따라가고,
덱 편성은 그대로 저장된다.

**갖고 있는 카드도 바꿀 수 없다.** 브라우저가 할 수 있는 일은 카드를 덱과 보유함 사이로 옮기는 것뿐이라,
저장 요청 앞뒤로 `instanceId` 목록이 같아야 한다. 카드가 생기고 없어지는 것은 전투 보상과 재료 성장뿐이고
둘 다 서버가 쓴다. 여기서 막지 않으면 보유함에 강한 장비를 적어 넣을 수 있고, 장비는 전투 유닛에 붙어
전투에 들어간다.

덱 편성 규칙도 서버가 지킨다. 리더 자리는 LEADER 카드, 덱은 UNIT 카드만이다.

진행도를 늘리는 경로는 서버에만 있다.

| 무엇 | 어디서 |
| --- | --- |
| 전투 보상·참여 EXP·스테이지 클리어 | `battle-api`가 전투 종료 시 직접 쓴다 |
| 재료 성장 EXP | `POST /api/save-slots/:slotId/growth` |

성장 API도 결과가 아니라 '어느 카드에 어떤 재료를'만 받는다. 브라우저가 만든 성장 결과는
화면 미리보기일 뿐이고, 서버가 자기 저장본 위에서 같은 규칙을 다시 돌린다.

### 저장본은 서버가 되돌린다

전투 엔진이 서버에 있어도 **입력이 오염되면 소용없다.** 저장 슬롯 API는 브라우저가 보낸 본문을 받으므로,
공격력 9999짜리 카드를 저장해 두면 서버가 그 수치로 전투를 만든다.

그래서 `canonicalizeCardInstance`가 저장·조회 양쪽에서 카드 한 장을 카탈로그 기준으로 되돌린다.

```
소유자가 정하는 값   instanceId · owner · zone · exp
정의에서 나오는 값   name · type · traits · abilities · cost · growth · description · note
레벨에서 나오는 값   level(=EXP로 계산) · hp · attack · dominance · slot
```

거절하지 않고 다시 계산해 덮는다. 카드 데이터를 고치면 기존 저장본이 정당하게 어긋나는데
그때마다 저장을 막으면 판을 못 이어 가고, 이미 조작된 저장본도 다음 저장에서 저절로 제자리로 온다.
카탈로그에 없는 카드 id만 400으로 거절한다. 되돌릴 기준이 없어서다.

## 6. 알려진 부채

이 문서가 서술하는 규칙과 실제 코드가 어긋나는 지점이다.

(비어 있다.)


## 7. 테스트 경계

| 대상 | 위치 | 성격 |
| --- | --- | --- |
| 전투 규칙 | `src/server/battle/*.test.ts` | 게임 규칙의 정답 |
| 전투 서버 경계 | `src/server/battle/battle-session.test.ts`, `src/server/battle-api.test.ts` | 합법성 재계산과 조작 거절 |
| 판정의 클라이언트 유출 | `src/server/battle/client-boundary.test.ts` | 브라우저 코드가 서버 모듈을 부르지 않는지 |
| 저장·덱·장비·성장 | `src/game/save/*.test.ts` | 도메인 |
| 레이아웃 계산 | `src/dom/screens/battlefield-layout.test.ts` | 순수 함수 |
| 드래그 기하 | `src/dom/screens/battle-drag.test.ts` | 순수 함수. DOM 배선은 제외 |
| Presenter 동작 | `src/pixi/scenes/*Scene.test.ts` | 뷰 대역을 주입해 **뷰 모델을 검증한다** |
| 연출 | `src/pixi/sequence/*.test.ts` | 가짜 ticker |

**Presenter 테스트가 이 구조의 핵심 이득이다.** 뷰를 `{ element, render: vi.fn() }` 대역으로 바꾸면 브라우저 없이 화면 상태 전체를 검증할 수 있다. `BattlefieldScene`은 이 방식으로 배치·이동·공격·스킬·턴 진행·방어 선택·결과 저장을 전부 덮는다.

캔버스가 필요한 것은 인터페이스로 주입한다. `BattleEffects`가 그 예다 — 테스트는 "어떤 행동에 어떤 연출이 어느 칸에서 나가는가"를 검증하고, 그리는 방법 자체는 브라우저 확인 몫이다.

**렌더링 결과 판정은 사용자가 한다.** 에이전트는 `npm run check` 경계까지만 결론을 낸다.
