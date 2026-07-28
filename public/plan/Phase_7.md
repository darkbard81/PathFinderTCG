# Phase 7 구현 결과 — 로그인, 슬롯, Stage, 덱 구성, 전투 화면

**상태:** `COMPLETE — 2026-07-28`

> 이 문서는 Phase 7 완료 시점의 경계를 기록한다. 당시의 로컬 전투 미리보기는 Phase 8의
> 서버 Stage 실행으로 교체되었고 임시 `phaseSevenPreview.ts`는 제거했다.

## 1. 구현 요약

UI showcase로 시작하던 기본 진입점을 실제 사용자 흐름으로 교체했다.

```text
Boot
  -> Login
  -> Save Slot
  -> Stage
       -> Deck Builder
       -> Battle
            -> Result
            -> Stage / Rematch / Save Slot
```

`BootScene`은 HttpOnly 쿠키 세션 복원을 먼저 시도하고, 인증 상태에 따라 `LoginScene` 또는
`SaveSlotScene`으로 이동한다. 로그인·가입, 고정 세이브 슬롯 3개 조회·생성·열기·초기화, 덱
편집과 저장, 합법 덱 전투 진입, 전투 결과 확인까지 한 Phaser 수명주기 안에서 연결했다.

전투 화면은 Phase 5 simulation이 만든 `ActionResolution`을 Phase 6
`BattlePresentationController`에 전달하는 경로만 사용한다. 사용자 입력과 적 AI는 blocking
연출 동안 잠기며, 마지막 프레젠테이션 barrier가 끝난 뒤에만 다음 Action 또는 Result Scene으로
진행한다.

## 2. 변경 파일

| 영역                | 파일                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 결과                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 브라우저 API client | [`PathfinderApiClient.ts`](../../src/game/client/PathfinderApiClient.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 인증, 고정 슬롯 3개, 덱 저장과 슬롯 초기화의 typed same-origin client |
| 클라이언트 세션     | [`GameSession.ts`](../../src/game/simulation/GameSession.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 인증·활성 슬롯·저장 덱·로컬 전투·마지막 결과를 Phaser 밖에서 소유     |
| 기본 진입점         | [`BootScene.ts`](../../src/phaser/scenes/BootScene.ts), [`game-config.ts`](../../src/phaser/config/game-config.ts)                                                                                                                                                                                                                                                                                                                                                                                                                 | 세션 복원 후 실제 Scene 흐름 시작, starter 예제 제거                  |
| 사용자 Scene        | [`LoginScene.ts`](../../src/phaser/scenes/LoginScene.ts), [`SaveSlotScene.ts`](../../src/phaser/scenes/SaveSlotScene.ts), [`StageScene.ts`](../../src/phaser/scenes/StageScene.ts), [`DeckBuilderScene.ts`](../../src/phaser/scenes/DeckBuilderScene.ts)                                                                                                                                                                                                                                                                           | 로그인부터 합법 덱 전투 진입까지 연결                                 |
| 전투 Scene          | [`BattleScene.ts`](../../src/phaser/scenes/BattleScene.ts), [`BattleResultScene.ts`](../../src/phaser/scenes/BattleResultScene.ts)                                                                                                                                                                                                                                                                                                                                                                                                 | 전투 renderer·HUD·결정 UI·Phase 6 연출·최종 결과 연결                 |
| 공통 화면 컴포넌트  | [`PF2eScreenPanel.ts`](../../src/phaser/ui/components/PF2eScreenPanel.ts), [`PF2eAuthPanel.ts`](../../src/phaser/ui/components/PF2eAuthPanel.ts), [`PF2eFormField.ts`](../../src/phaser/ui/components/PF2eFormField.ts), [`PF2eTextInput.ts`](../../src/phaser/ui/components/PF2eTextInput.ts)                                                                                                                                                                                                                                     | theme 기반 화면 프레임, 폼과 입력                                     |
| 흐름별 패널         | [`PF2eSaveSlotPanel.ts`](../../src/phaser/ui/components/PF2eSaveSlotPanel.ts), [`PF2eStagePanel.ts`](../../src/phaser/ui/components/PF2eStagePanel.ts), [`PF2eDeckBuilderPanel.ts`](../../src/phaser/ui/components/PF2eDeckBuilderPanel.ts), [`PF2eBattleResultPanel.ts`](../../src/phaser/ui/components/PF2eBattleResultPanel.ts)                                                                                                                                                                                                 | Scene에서 재사용 UI 구성과 표시 상태 분리                             |
| 전투 renderer       | [`PF2eBattleBoard.ts`](../../src/phaser/ui/components/PF2eBattleBoard.ts), [`PF2eBattleSlot.ts`](../../src/phaser/ui/components/PF2eBattleSlot.ts), [`PF2eBattleCard.ts`](../../src/phaser/ui/components/PF2eBattleCard.ts), [`PF2eBattleHud.ts`](../../src/phaser/ui/components/PF2eBattleHud.ts)                                                                                                                                                                                                                                 | 12칸 Field, 실제 카드 view registry, Action 목록과 연출 설정          |
| 사용자 결정 UI      | [`PF2eBattleChoicePanel.ts`](../../src/phaser/ui/components/PF2eBattleChoicePanel.ts), [`BattleDecisionCoordinator.ts`](../../src/phaser/ui/controllers/BattleDecisionCoordinator.ts), [`BattleDecisionPromptController.ts`](../../src/phaser/ui/controllers/BattleDecisionPromptController.ts)                                                                                                                                                                                                                                    | 반응 순서, 배치·이동 위치와 버릴 카드 선택 후 Action을 한 번만 확정   |
| 덱 편집 controller  | [`DeckDraftController.ts`](../../src/phaser/ui/controllers/DeckDraftController.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 30장 상한, 인스턴스 중복, 같은 유닛 정의 복사본과 리더 타입 검증      |
| 반응형 layout·theme | [`phaseSevenLayout.ts`](../../src/ui/layout/phaseSevenLayout.ts), [`pf2eElfTheme.ts`](../../src/phaser/ui/theme/pf2eElfTheme.ts)                                                                                                                                                                                                                                                                                                                                                                                                   | 가로·세로 순수 layout metrics와 Phase 7 의미 토큰                     |
| 기존 UI 보강        | [`PF2eGridTable.ts`](../../src/phaser/ui/components/PF2eGridTable.ts), [`PF2eConfirmDialogController.ts`](../../src/phaser/ui/controllers/PF2eConfirmDialogController.ts), [`PhaserBattlePresentationDriver.ts`](../../src/phaser/view/battle/PhaserBattlePresentationDriver.ts)                                                                                                                                                                                                                                                   | 목록 갱신, modal layer, rexUI 카드 view의 effect layer 이동           |
| 테스트              | [`PathfinderApiClient.test.ts`](../../src/game/client/PathfinderApiClient.test.ts), [`GameSession.test.ts`](../../src/game/simulation/GameSession.test.ts), [`DeckDraftController.test.ts`](../../src/phaser/ui/controllers/DeckDraftController.test.ts), [`BattleDecisionCoordinator.test.ts`](../../src/phaser/ui/controllers/BattleDecisionCoordinator.test.ts), [`battleUiModels.test.ts`](../../src/phaser/ui/controllers/battleUiModels.test.ts), [`phaseSevenLayout.test.ts`](../../src/ui/layout/phaseSevenLayout.test.ts) | API, 세션, 편집 제한, 결정 재생, view model과 layout 회귀 검증        |

## 3. 사용자 실행 방법

Vite와 API가 결합된 개발 서버를 실행한다.

```bash
npm run dev
```

브라우저에서 `http://127.0.0.1:3010`을 열면 Login 화면이 나타난다. Vite가 Fastify 라우터를
같은 3010 HTTP 서버에 마운트하므로 인증·세이브 동작을 위한 별도 API 프로세스나 포트는
필요하지 않다. UI showcase Scene은 개발 참고용으로 등록만 유지하고 기본 진입점으로 사용하지
않는다.

## 4. 로그인과 세이브 슬롯

- 가입은 계정을 만든 뒤 같은 자격 증명으로 로그인한다.
- 새로고침하면 `GET /api/auth/session`으로 쿠키 세션을 복원한다.
- 슬롯 목록은 서버 계약대로 항상 1~3번 세 칸을 표시한다.
- 빈 슬롯은 starter 컬렉션과 덱으로 새 게임을 만들고, 사용 중인 슬롯은 전체 상태를 연다.
- 슬롯 초기화와 덱 덮어쓰기는 프로젝트 `PF2eConfirmDialog`와 controller를 거친다.
- 로그아웃은 서버 세션과 클라이언트 `GameSession`을 함께 비운 뒤 Login으로 돌아간다.

## 5. 덱 구성과 Stage 진입 제한

`DeckDraftController`는 저장 가능한 상태와 전투 가능한 상태를 분리한다.

| 조작·상태                     | 처리                                                  |
| ----------------------------- | ----------------------------------------------------- |
| 총 31번째 카드 추가           | UI 조작 시 즉시 거부                                  |
| 같은 인스턴스 재추가          | 즉시 거부                                             |
| 같은 유닛 정의 세 번째 복사본 | 즉시 거부                                             |
| 유닛을 리더로 지정            | 즉시 거부                                             |
| 리더 교체                     | 새 리더 인스턴스만 선택하고 이전 리더는 컬렉션에 유지 |
| 리더 누락 또는 총 30장 미만   | 서버 저장 허용, `전투 시작 불가` 표시                 |
| 합법적인 리더 1장과 유닛 29장 | 저장 후 Stage와 Deck Builder에서 전투 시작 허용       |

Stage와 Battle은 Scene 표시만 신뢰하지 않고 현재 활성 슬롯의 저장 덱을
`validatePlayableSavedDeck`으로 다시 검사한다. 편집 중인 저장 전 상태나 미완성 저장 덱으로
Battle Scene을 직접 열어도 Stage로 돌아간다.

## 6. 전투 화면과 Phase 6 통합

전투 HUD는 현재 상태에서 simulation이 반환한 모든 합법 Action을 `GridTable` 목록으로
표시한다. 기존 규칙에 없는 drag·drop 입력을 새로 만들지 않고, 항목 선택 후 `Action 실행`으로
확정한다.

사용자 결정이 필요한 Action은 다음 순서로 처리한다.

```text
simulation dry-run
  -> 반응 Skill 순서 / Effect Field / 버릴 카드 prompt
  -> 같은 결정을 사용해 Action을 정확히 한 번 resolve
  -> BattlePresentationController.presentAction()
  -> 사용자·AI 잠금
  -> 최종 상태 반영
  -> 적 AI Action 또는 다음 사용자 입력
```

적 결정은 Phase 5의 결정적 provider를 사용한다. 사용자 prompt는 실제 선택을 기다리며, 같은
Action의 dry-run과 최종 resolve 사이에 선택을 재사용한다.

HUD에는 `1x`, `2x`, `4x`, 현재 Action 전체 `연출 Skip`, 음량 감소·증가와 음소거를 제공한다.
Skip은 규칙 처리를 생략하지 않고 Phase 6 controller가 남은 snapshot을 순서대로 반영한다.
전투 결과 Scene은 마지막 연출 완료 후에만 열린다.

## 7. 반응형 UI와 수명주기

새 화면은 rexUI의 `Sizer`, `Label`, `GridTable`, `ConfirmDialog` 계열을 상속한 프로젝트
컴포넌트로 구성했다. 선택과 callback은 controller가 소유하고, 색상·폰트·간격·크기는
`PF2E_ELF_THEME`의 의미 토큰을 사용한다.

`calculatePhaseSevenLayout()`은 viewport만 입력받아 root, 패널, 목록, 전장, HUD와 결정
modal 크기를 계산한다. 가로 화면은 전장과 HUD를 좌우로, 세로 화면은 위아래로 배치한다.
방향이 바뀌면 root rexUI 트리를 재구성하고, 각 Scene shutdown에서 resize·선택·버튼·설정
listener와 Phase 6 runtime을 정리한다.

rexUI 배경과 겹침 UI는 표시 순서를 명시했다. 전투 카드의 art·frame·수치층은
`OverlapSizer`에서 불필요하게 확장하지 않고, modal은 cover와 dialog를 전용 Phaser Layer에
같이 넣는다. `GridTable` 입력 callback 중 화면을 즉시 파괴하지 않고 짧게 지연해 rexUI tap
preUpdate가 제거된 table을 다시 참조하지 않도록 했다.

## 8. 구현자 결정사항

승인된 Phase 경계를 바꾸지 않는 범위에서 다음을 결정했다.

1. Phase 7 전투는 Phase 3의 적 테스트 덱 청사진을 사용하는 `검은가시 훈련전` 로컬
   미리보기로 둔다. Phase 8의 `StageDefinition`, stage-run ID, 서버 시드와 보상 API를 미리
   구현하지 않는다.
2. 전투 입력은 simulation이 반환한 합법 Action 전체 목록으로 제공한다. 새 drag 규칙이나
   Scene-local Action 해석을 추가하지 않는다.
3. 플레이어의 반응 순서, Field와 버리기 결정은 화면에서 직접 받는다. 적의 동일 결정은
   재현 가능한 기존 결정적 정책을 사용한다.
4. 미완성 덱 저장은 허용하되 Stage 진입과 Battle 직접 진입에서 모두 다시 차단한다.
5. Result 화면은 승패와 종료 사유를 표시하지만 영구 보상을 만들지 않는다. 보상 영역에는
   Phase 8에서 연결된다는 사실을 명시한다.
6. UI example용 `StarterScene`은 제거하고 실제 Scene 흐름을 기본으로 삼는다. 기존 custom
   class showcase는 회귀 참고를 위해 등록 상태만 유지한다.

## 9. 사용자 결정사항

사용자는 `npm run dev`에서 UI example이 아니라 실제 사용자가 확인할 화면을 원했고, Phase 7을
계획대로 구현해 결과 문서와 함께 완료하도록 요청했다. 이에 따라 다음처럼 적용했다.

- Phase 9까지 기다리지 않고 Phase 7 시점부터 로그인·슬롯·덱·로컬 전투·결과 흐름을 기본
  화면으로 확인할 수 있게 했다.
- 실제 Stage 01 실행과 영구 카드 보상은 승인된 Plan대로 Phase 8에 남겼다.
- 새 카드 규칙, Action, Stage, PvP 또는 서버 권위 전투는 추가하지 않았다.

이번 Phase에서 새로운 게임 규칙값이나 시각 생성 승인값을 요청할 필요는 없었다. 기존
30장 덱 계약, Phase 5 simulation, 게이트 F의 연출·오디오 설정과 Phase 8 경계를 그대로
적용했다.

## 10. 고려해야 할 점과 Phase 8 경계

### 영구 Stage 실행과 보상

현재 Battle은 브라우저 `GameSession` 안의 로컬 미리보기다. 승패는 세이브 진행도에 기록되지
않고 컬렉션 카드도 지급하지 않는다. Phase 8에서 다음을 연결해야 한다.

- 서버 `stage-runs` 시작과 완료 API
- 서버 발급 실행 ID와 시드
- `StageDefinition` 기반 적 덱과 보상 후보
- 승리 보상 1장 지급, 패배·무승부 무보상
- 완료 멱등성과 SQLite 트랜잭션
- 보상 뒤 활성 슬롯과 화면 컬렉션 갱신

### 번들 크기

production build는 성공하지만 단일 JavaScript chunk가 약 `2,674 kB`로 Vite의 `2,500 kB`
경고 기준을 넘는다. Phaser와 rexUI를 포함한 현재 단일 진입 번들이므로 동작 실패는 아니지만,
Phase 9 배포 준비에서 Scene·도구 화면의 code splitting 가능성과 실제 압축 전송 크기를
측정해야 한다. 경고 기준만 높여 숨기지 않았다.

## 11. 검증 결과

| 검증                                               | 결과                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| Phase 7 targeted 테스트                            | `PASS` — 6 files, 20 tests                             |
| 전체 Vitest                                        | `PASS` — 32 files, 149 tests                           |
| 가입·로그인·고정 슬롯 3개·빈 슬롯 생성·열기        | `PASS` — 실제 Chromium과 API                           |
| 슬롯 초기화 확인 후 삭제·나머지 슬롯 격리          | `PASS` — 슬롯 2만 `EMPTY`, 슬롯 1은 `OCCUPIED` 유지    |
| 31번째 카드·중복 인스턴스·세 번째 복사본 거부      | `PASS` — unit                                          |
| 리더 교체 시 이전 리더 컬렉션 유지                 | `PASS` — unit                                          |
| 29장 미완성 덱 저장                                | `PASS` — ConfirmDialog와 실제 API                      |
| 미완성 덱 Stage 전투 차단                          | `PASS` — 화면 유지, `deckPlayable=false`               |
| 리더 복구·30장 저장·전투 재허용                    | `PASS` — 실제 API 왕복                                 |
| 가로 전체 전투                                     | `PASS` — 1280×720, 24 Actions, 사용자 결정 prompt 포함 |
| 세로 전체 전투                                     | `PASS` — 390×844, 18 Actions, 사용자 결정 prompt 15회  |
| 연출 중 입력·AI 잠금과 Skip                        | `PASS` — 잠금 전후와 최종 상태 확인                    |
| `1x`, `2x`, `4x`, 음량 감소·증가, 음소거           | `PASS` — 실제 Chromium 입력·표시 상태                  |
| Login·Save Slot·Stage·Deck·Battle·Result 가로·세로 | `PASS` — clipping·overlap 수동 화면 확인               |
| 최종 Chromium page error                           | `PASS` — 0                                             |
| `npm run typecheck`                                | `PASS`                                                 |
| `npm run lint`                                     | `PASS`                                                 |
| `npm run format:check`                             | `PASS`                                                 |
| `npm test`                                         | `PASS` — 32 files, 149 tests                           |
| `npm run build`                                    | `PASS` — 1973 modules, chunk-size warning 1건          |
| `git diff --check`                                 | `PASS`                                                 |

최종 명령을 병렬 실행했을 때 기존 Phase 5 AI 전체 전투 테스트 1개가 `5056ms`로 Vitest의
`5000ms` 제한을 한 번 넘었다. 같은 테스트를 단독 실행하면 `2.45s`, 이어서 전체 suite를 단독
실행하면 `3.71s`에 모두 통과했다. 테스트 timeout이나 규칙 코드는 변경하지 않았으며, 병렬
build·test CPU 경합으로 판단했다.

브라우저 QA 스크린샷과 임시 자동화 스크립트는 `/tmp`에서만 사용했고 저장소 산출물로 남기지
않았다. 남은 실패나 미실시 Phase 7 수동 화면은 없다. 남은 warning은 위 번들 크기 1건이었다.
Stage 01과 영구 보상은 이 기록 시점에는 Phase 8 경계였으며 이후 Phase 8 결과 문서가
후속 상태를 기록한다.
