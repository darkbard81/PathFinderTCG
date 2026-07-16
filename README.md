# Pathfinder TCG

Phaser 4, rexUI, TypeScript, Vite로 구성한 반응형 브라우저 게임 스타터입니다.

## 환경

- Node.js `20.19.5` 이상
- Phaser `4.2.1`
- phaser4-rex-plugins `4.2.0`
- Vite `8.1.5`
- TypeScript `6.0.3`

## 시작하기

```bash
npm install
npm run dev
```

개발 서버는 기본적으로 `http://127.0.0.1:5173`에서 실행됩니다.

## 품질 명령

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

## 구조

```text
src/
  game/
    assets/       # 안정적인 자산 키와 매니페스트
    input/        # 물리 입력을 게임 액션으로 변환
    simulation/   # Phaser 밖의 게임 상태와 규칙
  phaser/
    adapters/     # Scene과 simulation 사이의 연결 경계
    boot/         # Phaser 게임 시작점
    config/       # Phaser 및 rexUI 플러그인 설정
    scenes/       # 얇은 Scene 오케스트레이션
  ui/
    layout/       # 화면 크기에서 레이아웃 값을 계산하는 순수 함수
```

## 반응형 레이아웃

- Canvas는 `Phaser.Scale.RESIZE`를 사용해 부모 영역을 채웁니다.
- `width >= height`이면 가로 레이아웃, 아니면 세로 레이아웃을 사용합니다.
- 방향이 변경되면 Scene의 rexUI Sizer 트리를 다시 구성합니다.
- 여백은 짧은 변의 4%를 `16~48px`로 제한합니다.
- 간격은 짧은 변의 2.5%를 `12~32px`로 제한합니다.

## 상태 경계

`GameSession`이 직렬화 가능한 게임 상태를 소유합니다. Phaser Scene은 레지스트리 어댑터로
세션을 읽고 액션을 전달하며, Sprite나 rexUI 객체를 게임 상태로 저장하지 않습니다.

키보드의 `Enter`와 `Escape`, 또는 화면 버튼으로 기본 액션 연결을 확인할 수 있습니다.
