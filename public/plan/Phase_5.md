# Phase 5 구현 결과 — 전투 시뮬레이션과 규칙 기반 적 AI

| 항목      | 결과                                                                    |
| --------- | ----------------------------------------------------------------------- |
| 상태      | `COMPLETE`                                                              |
| 완료일    | 2026-07-28                                                              |
| 기준 문서 | [Plan.md](./Plan.md), `src/game/cards/GAME_DESIGN.md`                   |
| 구현 범위 | 전투 준비·다중 Action 턴·Skill/Effect·상태 확인·승패·결정적 Stage 01 AI |

## 1. 결과 요약

Phase 1의 양쪽 `BattleDeck`을 복사해 Phaser와 분리된 직렬화 가능 `BattleState`를 만들고,
시작 손 5장과 1회 교환, 리더 후열 중앙 배치, 턴 시작·종료, 의무 드로우와 손패 7장 제한을
구현했다. 모든 플레이어는 `getLegalBattleActions`가 만든 같은 `BattleAction`을 사용하며,
`BattleSession`은 각 Action과 Reactive Skill, 상태 확인을 동기식으로 해결한다. 합법 행동이
남으면 같은 플레이어가 계속 행동하고, 없으면 자동으로 턴 종료·다음 턴 자동 Draw까지 해결한다.
Active Skill은 다른 Action에 붙지 않는 독립 `ACTIVE` Action이다.

전투 결과는 최종 상태만 반환하지 않는다. `ActionResolution`에 Action 시작 상태, 최종 상태와
원자적 `ResolutionStep`을 순서대로 저장하고 각 단계는 `beforeState`, `afterState`와 의미 기반
`BattleEvent`를 가진다. 이 계약에는 Phaser, rexUI, Animation, Sound, Tween 정보가 없으므로
Phase 6 프레젠테이션 큐가 규칙 상태를 다시 계산하지 않고 동일 결과를 재생할 수 있다.

Stage 01 AI는 현재 상태의 모든 합법 Action을 같은 해결기로 한 수 시뮬레이션하고 게이트 D의
승인 점수만 합산한다. 같은 상태와 시드는 같은 Action과 최종 상태를 만들며, 실제 아군·적군
30장 덱의 AI 대전은 불법 행동이나 무한 턴 없이 종료된다.

## 2. 변경 파일

| 영역           | 파일                                                                                                                                                                                                                                                                                                                           | 결과                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 공개 전투 계약 | [`types.ts`](../../src/game/simulation/battle/types.ts)                                                                                                                                                                                                                                                                        | 상태, Action, Event, Resolution, 선택 정책 타입         |
| 상태·전장 계산 | [`state.ts`](../../src/game/simulation/battle/state.ts)                                                                                                                                                                                                                                                                        | 불변 snapshot, 위치, 인접, 유효 수치, 지배력, 공격 대상 |
| 합법 행동 규칙 | [`rules.ts`](../../src/game/simulation/battle/rules.ts)                                                                                                                                                                                                                                                                        | 현재 Action 생성·검사, 카드별 턴 사용·자동 종료 규칙    |
| 전투 해결기    | [`BattleSession.ts`](../../src/game/simulation/battle/BattleSession.ts)                                                                                                                                                                                                                                                        | 준비, 턴, Skill/Effect, Trigger 대기열, 상태 확인, 승패 |
| Stage 01 AI    | [`BattleAi.ts`](../../src/game/simulation/battle/BattleAi.ts)                                                                                                                                                                                                                                                                  | 승인 점수, 동점 규칙, 한 수 평가, AI 대전 runner        |
| 공개 export    | [`index.ts`](../../src/game/simulation/battle/index.ts)                                                                                                                                                                                                                                                                        | Phase 5 simulation 공개 경계                            |
| 테스트 fixture | [`battleTestFixtures.ts`](../../src/game/simulation/battle/battleTestFixtures.ts)                                                                                                                                                                                                                                              | 실제 양쪽 30장 덱과 직렬화 상태 편집 fixture            |
| 전투·AI 테스트 | [`BattleSession.test.ts`](../../src/game/simulation/battle/BattleSession.test.ts), [`BattleActions.test.ts`](../../src/game/simulation/battle/BattleActions.test.ts), [`BattleSkills.test.ts`](../../src/game/simulation/battle/BattleSkills.test.ts), [`BattleAi.test.ts`](../../src/game/simulation/battle/BattleAi.test.ts) | Phase 5 요구사항별 정상·실패·재현·종료 회귀 테스트      |
| 계획 기록      | [`Plan.md`](./Plan.md), [`Phase_5.md`](./Phase_5.md)                                                                                                                                                                                                                                                                           | Phase 5 완료 상태, 구현 결정과 후속 고려사항            |

## 3. 전투 상태와 생성 흐름

```text
SavedDeck / EnemyDeckBlueprint
  -> BattleDeckFactory
  -> 서로 겹치지 않는 BattleCardInstance 30장씩
  -> 시작 Hand 5장
  -> 선택한 카드를 제외한 뒤 같은 수를 먼저 보충
  -> 제외 카드를 Deck에 돌리고 전투 seed로 재셔플
  -> 리더 BACK_CENTER, 나머지 Field/Drop/Exile 초기화
  -> TURN_STARTED, 첫 게임 턴을 포함한 자동 DRAW 1장
  -> BattleSession ACTION phase
```

카드별 턴 사용 표시를 추가한 현재 계약은 `BattleState.schemaVersion = 2`다. `BattleState`는
다음 정보만 가진다.

- 양쪽 Deck, Hand, 6칸 Field, Drop, Exile의 전투 카드 ID
- 카드 정의 ID, 소유자, 원본 출처, 피해, `EXILED`, 등장 대기, MOVE/ATTACK/ACTIVE 턴 사용 표시,
  비영구 수치 변경
- 활성 플레이어, 개별 플레이어 턴 번호, Action 수, 마지막 Action, 전투 seed와 승패
- 리더 ID와 원본 `BattleDeck` ID

Scene, Sprite, rexUI, DOM 객체와 선택 callback은 상태에 저장하지 않는다. 상태 복원 시 모든
카드가 정확히 한 존에 있고 그 존과 소유자가 일치하는지, 양쪽 리더와 `phase/result`가 유효한지
다시 검사한다. 소스 `BattleDeck`, `SavedDeck`, `CardInstance`는 전투 중 변경하지 않는다.

## 4. 코어 규칙 구현 결과

| 규칙 영역               | 구현 결과                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 턴                      | `TURN_STARTED` → 자동 DRAW → 합법 Action 반복 → 행동 없음/수동 종료 → `TURN_ENDED` → 손패 제한 → 상대 턴                 |
| 첫 턴                   | Stage 01 기본값으로 `PLAYER`가 먼저 행동하고 PLACE와 MOVE만 허용                                                         |
| 등장 대기               | 새 Field 카드는 MOVE, ATTACK, 반격, Active를 사용할 수 없고 처음 오는 소유자 턴 시작에 해제                              |
| 지배력                  | 같은 진영의 상하좌우 인접 카드 유효 dominance를 빈 칸별로 합산하며 소비하지 않음                                         |
| DRAW                    | 모든 턴 시작에 자동 1장, 빈 Deck이면 패배                                                                                |
| PLACE                   | Hand 유닛, 빈 Field, 선언 시 유효 cost 이하 지배력을 검사                                                                |
| MOVE                    | 카드별 턴당 1회, ATTACK 전까지만 자기 진영의 인접 빈 칸으로 이동                                                         |
| ATTACK                  | 첫 턴 금지, 카드별 턴당 1회, 해결 뒤 같은 카드의 MOVE/ACTIVE 차단, 기존 사거리·반격 유지                                 |
| ACTIVE                  | 첫 턴·등장 대기·ATTACK 후 금지, 카드별 턴당 1회, 필요하면 선언 전에 대상 고정                                            |
| END_TURN                | 항상 합법인 수동 제어이며 PLACE/MOVE/ATTACK/ACTIVE가 없으면 자동 실행                                                    |
| 전투 피해               | 공격자와 합법 방어자의 유효 attack을 동시에 적용하고 한 상태 확인에서 동시 파괴·동시 리더 패배를 처리                    |
| Passive                 | Field의 ATTACK/HEALTH/DOMINANCE, Hand의 COST `MODIFY_STAT SELF`만 동적으로 적용                                          |
| Reactive                | 턴 플레이어 stack 뒤에 상대 stack을 올려 LIFO 해결하고 같은 Skill 인스턴스는 최상위 연쇄마다 한 번만 대기                |
| Effect                  | 10종 handler와 대상 참조 6종을 구현하고, 한 Effect 실패 후에도 뒤 Effect를 계속 해결                                     |
| 상태 확인               | Passive/하한 → `EXILED` 동시 Exile → 치명 피해 동시 Drop → 승패 → 새 Reactive 순서                                       |
| Drop/Exile              | 사망만 Drop, DISCARD·손패 제한·`EXILED`만 Exile, 존 변경 시 피해·상태·등장 대기·비영구 변경 초기화, Exile 복귀 금지      |
| 승패                    | 리더가 Field를 떠나거나 필수 DRAW가 실패하면 패배하고 같은 상태 확인에서 양쪽 리더가 떠나면 무승부                       |
| `TRIGGER_SOURCE`        | 기본 전투의 `DAMAGE_RECEIVED`는 피해를 준 공격/방어 카드 ID를 유지하며 상대 리더로 바꾸지 않음                           |
| 복합 `TRIGGER_SUBJECT`  | 한 Effect의 복수 DISCARD와 동시 파괴에 주체가 둘 이상이면 임의 대상을 고르지 않고 해당 Effect만 실패                     |
| `CARD_DESTROYED + SELF` | 출처 자신이 Drop으로 이동한 직후에도 한 번 대기할 수 있으며 지배력 조건을 만족하면 같은 카드를 새 Field 객체 상태로 반환 |

`REMOVE_STATUS`와 `STATUS_REMOVED` handler도 계약에 포함했지만 닫힌 코어의 `EXILED`는 상태 확인에서
즉시 Exile 이동하므로 현재 카드 풀에는 성공 가능한 사용 카드가 없다. 테스트는 상태가 없는 대상에서
해당 Effect만 실패하고 뒤 Effect가 계속되는 계약을 확인한다.

## 5. ActionResolution과 선택 경계

각 `ResolutionStep`은 고유 step ID와 원자적 Effect ID를 가진다. 기본 Action 단계, Skill Effect,
동시 전투 피해, 상태 기반 Exile/파괴, 턴 시작·종료와 승패가 각각 독립 snapshot으로 기록된다.
앞 단계의 `afterState`와 다음 단계의 `beforeState`가 같고 마지막 `afterState`는
`ActionResolution.finalState`와 같다.

해결 중 다음 선택은 `BattleDecisionProvider`가 선택권을 가진 플레이어 ID와 합법 후보만 받아
결정한다.

1. 같은 플레이어의 동시 Reactive Skill stack 순서
2. MOVE/PLACE Effect의 합법 목적지
3. DISCARD Effect 대상 플레이어의 Hand와 손패 제한 카드

잘못된 수, 중복 ID, Hand 밖 카드, 합법 후보 밖 Field를 반환하면 Action 전체를 거부하며
`BattleSession`의 기존 상태를 변경하지 않는다. AI와 자동 테스트는 같은 인터페이스의 결정적
기본 정책을 사용한다.

## 6. Stage 01 AI

| 평가 항목             | 구현 점수              |
| --------------------- | ---------------------- |
| 상대 리더 즉시 패배   | `+100000`              |
| 자기 리더 즉시 패배   | `-100000`              |
| 상대 유닛 파괴        | 고유 대상당 `+5000`    |
| 상대 리더 유효 피해   | 순피해 1당 `+1000`     |
| 상대 유닛 유효 피해   | 순피해 1당 `+250`      |
| 합법 PLACE            | `+400`                 |
| PLACE 후 지배력 증가  | 투사 지배력 1당 `+100` |
| 배치 카드 Cost        | Cost 1당 `+50`         |
| 다음 경로를 여는 MOVE | `+300`                 |
| ACTIVE                | `+200`                 |
| END_TURN              | `0`                    |

점수 동률은 Action 문자열, Field index, 카드 정의 ID 오름차순으로 정렬한다. 같은 정의의 복사본이
세 키까지 완전히 같을 때만 전투 인스턴스 ID를 마지막 안정화 키로 사용한다. AI 평가는 자기 Hand와
공개 Field/Drop/Exile 및 해결 결과만 점수에 사용하며 상대 Hand 내용이나 Deck 순서로 점수를
바꾸지 않는다.

## 7. 구현자 결정사항

승인된 규칙과 점수를 바꾸지 않는 범위에서 다음 해석을 고정했다.

1. `turnNumber`는 양쪽을 합친 개별 플레이어 턴을 1부터 센다.
2. Stage 01 생성 기본값은 게이트 D대로 `PLAYER` 선공이다. 첫 턴 교체 대전 테스트를 위해
   `firstPlayerId`를 명시적으로 주입할 수 있다.
3. 시작 손 교환 수가 0이어도 준비 순서의 마지막 재셔플을 전투 seed로 실행한다.
4. 기본 자동 선택은 Field 고정 index, 현재 Hand 순서, Skill ID와 출처 카드 ID 오름차순의
   stack 순서를 사용한다. 실제 사용자 선택은 `BattleDecisionProvider`로 교체한다.
5. AI의 “PLACE 후 예상 지배력 증가”는 플레이어의 여섯 Field가 받는 투사 지배력 합의 순증가로
   계산한다. 지배력을 플레이어 자원처럼 저장하지 않는다.
6. “다음 경로를 여는 MOVE”는 이동 전 없던 합법 ATTACK 대상이 생기거나, 다음 PLACE의
   `Hand 카드 × 합법 Field` 조합 수가 증가한 경우로 판정한다.
7. 유효 피해는 Action 전후 Field에 남은 누적 피해의 순증가다. 파괴된 유닛은 피해 점수 대신
   파괴 점수만 받는다.
8. 한 Action 뒤 합법 행동이 남으면 활성 플레이어를 유지한다. 하나도 없거나 `END_TURN`이면 손패
   조정, 상대 `TURN_STARTED`와 자동 DRAW까지 진행한다.

## 8. 사용자 결정사항

이번 Phase에서 새 사용자 승인이 필요한 값은 없다. 다음 기존 결정을 그대로 적용했다.

- 게이트 D: Stage ID와 `ai-stage-01`, PLAYER 선공, AI 점수와 동점 규칙
- 게이트 E의 기존 동결보다 사용자의 2026-07-28 전투 흐름 변경을 우선해 독립 `ACTIVE`와 카드별
  턴 사용 상태를 추가했다. Trigger, Effect, 존, 카드 종류와 Stage 범위는 늘리지 않았다.
- `GAME_DESIGN.md` 22.1: 피격 반응 DAMAGE의 `TRIGGER_SOURCE`는 피해를 준 공격 카드

점수, 동점 키, 선공 보정이나 카드 수치를 변경하지 않았다. 아래 플레이 시간·종료 원인 관찰을
근거로 해당 값을 바꾸려면 게이트 B 또는 D 재승인이 필요하다.

## 9. 고려해야 할 점

### AI 종료 검증과 밸런스 검증은 다르다

자동 테스트는 동일 seed 전체 대전을 두 번 재현하고 128 Action 상한 안에서 같은 결과로
끝나는지 확인한다. 현재 다중 Action 흐름의 별도 진단으로 seed 1–12를 실행했을 때 모두
15–25턴, 64–125 Action에 종료됐고 PLAYER 2승, ENEMY 10승이었으며 종료 원인은 모두 Deck
소진이었다.

이는 불법 행동과 무한 턴이 없다는 Phase 5 완료 증거지만 `GAME_DESIGN.md` 21장의 4개 덱 성향,
조합별 선공 교체 20게임, Wilson 구간과 실제 15–25분 플레이를 대신하지 않는다. 목표 12–20턴을
넘긴 seed가 9개이고 리더 전투 패배가 없었던 점은 실제 대전 로그에서 다시 확인해야 한다. 카드
수치나 AI 점수를 즉시 임의 조정하지 않는다.

### Phase 6 snapshot 비용

현재 `ResolutionStep`은 안전한 재생 계약을 위해 매 원자 단계의 전체 `BattleState` snapshot을
보존한다. 60장 기준 자동 테스트와 build에는 문제가 없지만 Phase 6 연출 큐에서 메모리와
직렬화 비용을 측정해야 한다. 측정 없이 patch/delta 계약으로 바꾸면 프레젠테이션 재현성이
약해질 수 있다.

### Phase 7 사용자 선택 UI

기본 결정 정책은 AI와 테스트용이다. 실제 전투 화면은 Reactive 순서, Effect 목적지, 강제
DISCARD와 손패 제한 선택을 해당 플레이어에게 받아 `BattleDecisionProvider`로 전달해야 한다.
동기식 Action 해결 전에 필요한 결정을 수집하는 controller 또는 pending-decision adapter가
필요하며 이 기능을 Phaser Scene이나 `BattleState`에 넣지 않는다.

### 외부 매치 제어와 서버 seed

항복과 토너먼트 시간 종료 판정은 카드 Action이 아닌 외부 매치 제어이므로 이번
`BattleAction` union에 추가하지 않았다. Phase 7/9에서 UI 명령과 종료 보고 경계를 연결해야
한다. Stage 실행 seed 발급, 실행 ID, 결과 멱등 처리와 보상 지급은 Phase 8 서버 범위다.

## 10. 검증 결과

| 검증                                      | 결과                                                |
| ----------------------------------------- | --------------------------------------------------- |
| Phase 5 targeted 테스트                   | `PASS` — 5 files, 35 tests                          |
| 시작 Hand·교환·첫 턴 재현                 | `PASS`                                              |
| 현재 Action 합법·불법·카드별 사용 제한    | `PASS`                                              |
| 지배력·Passive·PLACE                      | `PASS`                                              |
| MOVE 인접·ATTACK 범위·전열 보호           | `PASS`                                              |
| 동시 피해·동시 파괴·동시 리더 패배        | `PASS`                                              |
| Reactive stack·1회 제한·선택권            | `PASS`                                              |
| 10 Effect handler·실패 후 계속            | `PASS`                                              |
| Drop 부활·Exile 비가역성                  | `PASS`                                              |
| Deck 소진·리더 패배·무승부                | `PASS`                                              |
| 원본 `BattleDeck` 불변                    | `PASS`                                              |
| 같은 seed 설정·AI Action·최종 상태 재현   | `PASS`                                              |
| 상대 비공개 순서 변경에 대한 AI 결정 불변 | `PASS`                                              |
| 실제 양쪽 30장 AI 대전 종료               | `PASS` — 불법 Action 0, 128 Action 상한 미도달      |
| `npm run typecheck`                       | `PASS`                                              |
| `npm run lint`                            | `PASS`                                              |
| 추적 파일 전체 Prettier 검사              | `PASS`                                              |
| `npm run format:check`                    | `WARN` — 미추적 사용자 파일 `Test.ts.md`만 실패     |
| `npm test`                                | `PASS` — 40 files, 184 tests                        |
| `npm run build`                           | `PASS`                                              |
| `git diff --check`                        | `PASS`                                              |
| 브라우저 첫 턴 제한·AI 자동 종료          | `PASS` — 1024×768, 첫 턴 Active 차단 후 Turn 3 복귀 |
| 브라우저 Active 유지 입력                 | `PASS` — 850ms 미실행, 1초 초과 후 Action 실행      |
| 브라우저 가로·세로 전투 화면              | `PASS` — 1024×768, 768×1024, 문서 스크롤 없음       |

2026-07-28 전투 흐름 변경은 simulation과 함께 Phaser/rexUI 전투 화면도 갱신했다. 별도 자동
검증과 가로·세로 브라우저 시각 검증으로 Direct Action 입력, Drop/Exile, 지배력 표시와 제거된
전장 텍스트를 확인한다.
