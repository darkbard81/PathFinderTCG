# AGENTS.md

## 적용 범위

이 파일은 저장소 전체에 적용되는 작업 지침이다. 하위 디렉터리에 별도의 `AGENTS.md`가
생기면 그 파일은 해당 하위 트리에 대해 더 구체적인 규칙을 추가하거나 이 규칙을 대체한다.

작업을 시작하기 전에 현재 브랜치, `git status`, 관련 소스와 테스트를 먼저 확인한다. 과거
구현이나 일반적인 Phaser 관례보다 현재 체크아웃의 코드와 이 문서를 우선한다.

## 프로젝트 기준

Pathfinder TCG는 Phaser 4, rexUI, TypeScript, Vite로 만드는 반응형 브라우저 게임이다.

- Node.js: `.nvmrc` 및 `package.json#engines`
- Phaser: `4.2.1`
- rexUI: `phaser4-rex-plugins@4.2.0`
- TypeScript: strict 모드, emit 없음
- 화면 크기: `Phaser.Scale.RESIZE`
- 게임 상태: Phaser 객체와 분리된 `GameSession`이 소유

rexUI 구현의 첫 번째 기준은 공식 [UI Overview](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-overview/)다.
컴포넌트를 선택하거나 새 UI를 만들기 전에 Overview에서 가장 가까운 기존 rexUI 요소와 그
개별 문서의 생성, 상속, layout, input 규칙을 확인한다.

## 저장소 지도

- `src/game/assets/`: 런타임에서 사용하는 안정적인 자산 키와 매니페스트
- `src/game/input/`: 키보드, 포인터 같은 물리 입력을 의미 있는 게임 액션으로 변환
- `src/game/simulation/`: Phaser에 의존하지 않는 직렬화 가능한 상태와 게임 규칙
- `src/phaser/adapters/`: Scene과 simulation 사이의 연결 경계
- `src/phaser/boot/`: Phaser 게임 시작점
- `src/phaser/config/`: Phaser 설정과 rexUI Scene 플러그인 등록
- `src/phaser/scenes/`: 화면 수명주기와 상위 레이아웃을 조정하는 얇은 Scene
- `src/phaser/ui/components/`: 프로젝트용 rexUI 상속 컴포넌트. 새 UI부터 이 경로를 사용한다.
- `src/phaser/ui/theme/`: 테마 타입, 디자인 토큰, 기본 테마. 새 UI부터 이 경로를 사용한다.
- `src/types/rex-ui.d.ts`: `scene.rexUI` TypeScript 선언
- `src/ui/layout/`: viewport에서 반응형 레이아웃 값을 계산하는 순수 함수
- `public/assets/`: 런타임 자산. 경로 규칙은 `public/assets/README.md`를 따른다.

`src/phaser/ui/components/`와 `src/phaser/ui/theme/`가 아직 없으면 첫 관련 작업에서 만든다.
디렉터리가 없다는 이유로 Scene에 새 스타일과 재사용 UI를 인라인으로 추가하지 않는다.

## rexUI 컴포넌트 정책

프로젝트 의미를 가진 UI 요소는 가장 가까운 rexUI 클래스를 상속한 TypeScript 클래스로
구현한다. 반복되는 설정을 반환하는 Scene-local 함수나 임의의 Phaser Container를 기본
재사용 경계로 삼지 않는다.

| 목적                        | 우선 검토할 rexUI 기반 클래스           |
| --------------------------- | --------------------------------------- |
| 버튼, 칩, 아이콘+텍스트 행  | `Label`, `SimpleLabel`, `Buttons`       |
| 일반 패널과 행/열 레이아웃  | `Sizer`                                 |
| 표 형태 레이아웃            | `GridSizer`                             |
| 겹치는 레이어, 프레임, 배지 | `OverlapSizer`, `BadgeLabel`            |
| 자동 줄바꿈 흐름            | `FixWidthSizer`                         |
| 스크롤 목록                 | `ScrollablePanel`, `GridTable`          |
| 탭과 페이지                 | `Tabs`, `TabPages`, `Pages`             |
| 모달과 확인 UI              | `Dialog`, `ConfirmDialog`               |
| 진행도와 수치 입력          | `ExpBar`, `NumberBar`, `Slider`, `Knob` |
| 텍스트 입력과 긴 본문       | `TextAreaInput`, `TextArea`, `TextBox`  |

구현 순서는 다음과 같다.

1. UI Overview와 해당 컴포넌트 문서를 확인해 가장 좁고 의미가 맞는 기반 클래스를 고른다.
2. `phaser4-rex-plugins/templates/ui/ui-components.js`에서 클래스를 import한다.
3. `src/phaser/ui/components/`에 목적이 드러나는 이름의 클래스를 만들고 해당 클래스를 상속한다.
4. 생성자에서 `super(scene, config)`를 호출한 뒤 `scene.add.existing(this)`로 정확히 한 번 등록한다.
5. 외부에는 typed config, 의미 있는 상태 변경 메서드, typed event 또는 callback만 노출한다.
6. 부모가 자식 구성을 마친 뒤 `.layout()`을 호출한다. Sizer 자식의 좌표를 수동 배치하지 않는다.

공식 custom class 패턴은 [Label](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-label/),
[Sizer](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-sizer/),
[ScrollablePanel](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-scrollablepanel/) 문서를 따른다.

Scene에서 `this.rexUI.add.*`를 직접 사용하는 것은 다음 범위로 제한한다.

- 재사용되지 않는 최상위 화면 배치용 root sizer
- 상속 컴포넌트 내부에서 배경, 텍스트, 아이콘 같은 자식을 조립하는 경우
- 빠른 진단용 코드로 시작했더라도 최종 변경 전에 프로젝트 컴포넌트로 추출할 경우

이름, 상태, 상호작용 또는 고유 스타일을 가진 요소는 one-off가 아니다. 예를 들어
`PrimaryButton`, `CardPanel`, `DeckList`, `ConfirmDialog`는 Scene 함수가 아니라 각각 알맞은
rexUI 클래스를 상속한 컴포넌트여야 한다.

## 테마 정책

색상, 폰트, 여백, 크기, 테두리, 모서리 반경과 상태별 스타일은 Scene이나 컴포넌트에 직접
흩어 놓지 않고 `src/phaser/ui/theme/`에서 관리한다.

권장 구조는 다음과 같다.

```text
src/phaser/ui/theme/
  types.ts          # UiTheme와 variant/state 타입
  defaultTheme.ts   # 기본 디자인 토큰과 컴포넌트 variant
  index.ts          # 외부 공개 경계
```

테마에는 최소한 다음 의미 토큰을 둔다.

- `colors`: background, surface, border, text, accent, danger 등 역할 기반 색상
- `typography`: font family, size, weight, line spacing
- `spacing`: xs/sm/md/lg/xl 같은 일관된 간격 단계
- `radii`: control, panel, modal 등 모서리 반경
- `strokes`: 테두리 두께와 alpha
- `sizes`: control 높이, icon 크기, 최소 touch target
- `components`: button, panel, dialog 등의 variant와 상태별 조합

상태 키는 `idle`, `hover`, `pressed`, `focused`, `selected`, `disabled`처럼 의미로 이름 짓는다.
파괴적인 동작은 색상값을 직접 넘기지 말고 `danger` 같은 variant로 요청한다.

- Phaser fill/stroke 색은 숫자(`0xRRGGBB`), 텍스트 색은 CSS 문자열(`#rrggbb`) 타입을
  구분한다.
- 테마 객체는 immutable data로 취급한다. 런타임에 공유 테마를 직접 수정하지 않는다.
- 테마는 시각 정보만 가진다. 게임 규칙, callback, Scene 참조, 세션 상태를 넣지 않는다.
- 컴포넌트는 테마 또는 theme slice와 variant를 받아 자신의 rexUI config를 만든다.
- 새 색상과 크기를 추가하기 전에 기존 의미 토큰으로 표현할 수 있는지 먼저 확인한다.
- Scene 안의 `COLORS`, 반복되는 text style, round-rectangle config를 새로 만들지 않는다.

현재 `StarterScene.ts`의 인라인 `COLORS`와 Scene-local UI 생성 함수는 초기 starter 코드다.
새 구현에 이 패턴을 복제하지 않는다. 해당 UI를 기능적으로 수정하는 작업에서는 관련 부분을
상속 컴포넌트와 테마로 함께 이동하되, 요청 범위 밖의 전체 리팩터링은 하지 않는다.

## Scene, UI, 게임 상태 경계

- Scene은 화면 수명주기, 상위 컴포넌트 조합, resize 대응, 게임 액션 전달만 담당한다.
- UI 컴포넌트는 표시와 사용자 의도를 담당하며 `GameSession`을 직접 읽거나 수정하지 않는다.
- 컴포넌트는 `confirm`, `cancel`, `cardSelected` 같은 의미 있는 event/callback을 내보내고,
  Scene 또는 adapter가 이를 `GameAction`으로 변환한다.
- `src/game/simulation/`에는 Phaser Scene, Sprite, rexUI 객체, DOM 객체를 저장하지 않는다.
- 직렬화 가능한 상태와 렌더링 전용 상태를 분리한다.
- Scene shutdown 시 Scene이 등록한 scale, keyboard, session listener를 정리한다.

## 반응형 레이아웃

- viewport 수치는 `src/ui/layout/`의 순수 함수에서 계산한다.
- Scene은 계산된 layout metrics를 컴포넌트에 전달한다. 테마 토큰과 viewport 수치를 섞지 않는다.
- 가로/세로 구조가 달라지면 root rexUI 트리를 재구성할 수 있다.
- 단순 크기 변경은 가능하면 컴포넌트의 명시적 resize/update API와 `.layout()`으로 반영한다.
- Sizer가 관리하는 자식에 고정 화면 좌표를 넣거나 수동 center 계산을 중복하지 않는다.
- 새로운 UI는 최소한 가로와 세로 viewport에서 clipping, overlap, touch target을 확인한다.

## 자산 규칙

- 런타임 자산은 `public/assets/`의 분류된 디렉터리에 둔다.
- 게임 코드에서 파일 경로를 여러 곳에 하드코딩하지 않는다.
- 안정적인 자산 키와 실제 경로의 연결은 `src/game/assets/manifest.ts`에서 관리한다.
- UI 컴포넌트는 가능한 한 자산 키를 입력받고 로딩 정책을 소유하지 않는다.
- 원본 자산이나 대용량 생성물을 명시적 요청 없이 덮어쓰거나 커밋하지 않는다.

## TypeScript와 코드 규칙

- strict TypeScript를 유지하고 `any`, 무근거 type assertion, `@ts-ignore`로 rexUI 타입 오류를
  숨기지 않는다.
- 타입 전용 import에는 `import type`을 사용한다.
- ESM import에서 현재 프로젝트가 사용하는 `.js` suffix 규칙을 유지한다.
- `scene.rexUI` 타입은 `src/types/rex-ui.d.ts`, 플러그인 등록은
  `src/phaser/config/game-config.ts`에서 유지한다.
- `node_modules`의 rexUI 소스를 직접 수정하지 않는다. 필요한 동작은 프로젝트 subclass,
  adapter 또는 명시적인 dependency 변경으로 구현한다.
- 관련 없는 파일을 일괄 포맷하거나 요청 범위 밖의 구조를 동시에 바꾸지 않는다.
- dead code, 사용하지 않는 theme token, 임시 진단 코드는 완료 전에 제거한다.

## 실행과 검증

```bash
npm ci
npm run dev
```

기본 품질 명령은 다음과 같다.

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

작업 범위에 맞는 가장 좁은 테스트를 먼저 실행하고, 완료 전에 전체 품질 명령을 실행한다.
문서만 변경했다면 최소한 `npm run format:check`와 `git diff --check`를 실행한다. 시각 변경은
자동 검증과 별도로 개발 서버에서 관련 화면의 가로/세로 레이아웃을 실제로 확인하며, 확인하지
않았다면 확인했다고 보고하지 않는다.

## 금지 사항

- rexUI에 해당 목적의 기반 클래스가 있는데 plain Phaser Container로 재구현하지 않는다.
- Scene마다 버튼, 패널, 모달 스타일과 pointer 상태 처리를 복사하지 않는다.
- theme token을 우회해 raw color, font, padding, radius 값을 반복하지 않는다.
- UI 컴포넌트에 게임 규칙이나 save/load 책임을 넣지 않는다.
- layout 문제를 임시 좌표 보정만으로 덮지 않는다. 먼저 sizer 구성, proportion, expand, align,
  padding과 `.layout()` 호출 경계를 확인한다.
- `dist/`, `artifacts/`, `node_modules/`를 커밋하지 않는다.
- 실패한 테스트나 build warning을 숨기지 않는다.

## 완료 기준

- 요구한 동작이 구현되고 변경 범위가 요청 안에 머문다.
- 새 프로젝트 UI가 알맞은 rexUI 클래스를 상속한다.
- 새 디자인 값이 theme token 또는 component variant로 정의된다.
- Scene은 컴포넌트 조합과 액션 전달에 집중한다.
- 가로/세로 레이아웃과 입력 상태가 필요한 수준으로 검증된다.
- 관련 테스트와 `typecheck`, `lint`, `format:check`, `build`가 통과한다.
- `git diff --check`가 통과하고 임시 파일 및 생성물이 남지 않는다.
- 최종 보고에 변경 파일, 검증 명령, 남은 warning 또는 수동 확인 항목을 명시한다.
