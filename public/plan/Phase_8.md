# Phase 8 구현 결과 — Stage 01과 확률적 카드 획득

**상태:** `COMPLETE — 2026-07-28`

## 1. 구현 요약

Phase 7의 로컬 훈련전을 데이터로 정의된 `stage-01`과 영구 Stage 실행으로 교체했다.

```text
Stage
  -> POST stage-runs
  -> 서버 실행 ID + uint32 시드
  -> 저장 덱과 독립된 플레이어/적 전투 덱
  -> Phase 5 simulation + Phase 6 presentation barrier
  -> POST stage-runs/:runId/complete
       WIN  -> 가중치 보상 1장 + 클리어 기록
       LOSS -> 무보상 완료 기록
       DRAW -> 무보상 완료 기록
  -> Result / Reward
```

Stage 화면, 전투 생성과 보상 후보는 Scene 상수가 아니라 Stage·카드 콘텐츠 데이터를
참조한다. 플레이어가 먼저 행동하고 적에게 추가 카드·지배력·수치·선행 배치 보정을 주지
않는다.

승리하면 Stage 01 적 덱의 16개 카드 정의 중 서버 실행 시드가 선택한 새 `CardInstance`
정확히 1장을 슬롯 컬렉션에 추가한다. 패배와 무승부는 완료 기록만 남긴다. 실행 완료,
보상 영수증, 컬렉션과 클리어 진행도는 하나의 SQLite 트랜잭션으로 저장한다.

## 2. 데이터와 서버

### Stage 01 콘텐츠

[`stageOne.ts`](../../src/game/content/stageOne.ts)에 다음 공개 경계를 추가했다.

- 고정 ID `stage-01`
- Phase 3의 `enemy-test-deck` 청사진
- Phase 5와 같은 `ai-stage-01` 프로필 ID
- Phase 3에서 승인한 `STAGE_ONE_REWARD_ENTRIES`
- Stage 화면용 이름, 설명과 보상 안내

보상표는 적 리더를 포함한 적 덱의 카드 정의 16개를 정확히 한 번씩 포함한다.

| 레어리티    | 정의별 가중치 |
| ----------- | ------------: |
| `COMMON`    |           100 |
| `RARE`      |            45 |
| `EPIC`      |            20 |
| `LEGENDARY` |            10 |

적 리더도 `LEGENDARY` 가중치 10으로 실제 획득 가능하다. 추첨은 실행 시드를 전체 양의 가중치
합의 반열린 구간에 대응시키며, 같은 실행은 항상 같은 후보를 선택한다.

### 세이브 콘텐츠 마이그레이션

서버 기본 콘텐츠를 `createPhaseEightGameContent()`로 전환했다.

- 새 슬롯은 아군 starter 컬렉션·덱과 함께 Stage 01이 해금된다.
- Phase 3 또는 Phase 7에서 만든 기존 슬롯은 처음 목록 조회 또는 열기 시 Stage 01을
  자동 해금한다.
- 기존 컬렉션, 덱, 선택 덱과 완료 기록은 교체하지 않는다.
- 이미 마이그레이션한 슬롯은 다시 수정하거나 수정 시각을 갱신하지 않는다.

### SQLite Schema v2

[`database.ts`](../../src/server/database.ts)에 `stage_runs`를 추가하고 DB Schema를 v2로
올렸다.

| 열·제약                       | 역할                                                      |
| ----------------------------- | --------------------------------------------------------- |
| 계정 + 슬롯 + 실행 ID 기본 키 | 다른 계정·슬롯 실행과 격리                                |
| Stage ID + uint32 시드        | 전투·AI·보상 재현 입력                                    |
| `PENDING` / `COMPLETED`       | 완료를 한 번만 전환                                       |
| `WIN` / `LOSS` / `DRAW`       | v1 클라이언트 결과                                        |
| 보상 카드 인스턴스 ID         | `WIN`이면 필수, 그 외 결과면 `NULL`                       |
| 부분 unique index             | 계정·슬롯·Stage마다 `PENDING` 실행을 하나만 허용          |
| 복합 foreign key + cascade    | 슬롯 삭제 시 해당 Stage 실행도 삭제                       |
| 상태·결과·보상 조합 `CHECK`   | 불완전하거나 결과와 보상이 어긋난 행을 DB 수준에서도 거부 |

v1 DB를 열면 기존 사용자·세션·슬롯 테이블을 유지한 채 v2 테이블과 index만 트랜잭션으로 추가한다.

### Stage 실행 서비스와 API

[`stageRuns.ts`](../../src/server/stageRuns.ts)가 실행 시작, 결과 완료와 보상 지급을 소유한다.

| Method | Route                                                | 성공 결과                                                      |
| ------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| `POST` | `/api/save-slots/:slotId/stage-runs`                 | 새 실행은 `201`, 기존 `PENDING` 재사용은 `200`, `{ stageRun }` |
| `POST` | `/api/save-slots/:slotId/stage-runs/:runId/complete` | `200 { stageRun, saveSlot }`                                   |

시작 요청은 인증 계정, 슬롯 소유권, Stage 해금, 선택 덱과 30장 플레이 가능 계약을 다시 검증한다.
브라우저나 API 서버가 재시작돼도 같은 슬롯·Stage의 `PENDING` 실행 ID와 시드를 반환한다.

완료 요청은 다음을 하나의 SQLite 트랜잭션에서 처리한다.

1. 인증 계정·슬롯에 속한 실행 ID를 조회한다.
2. 이미 `COMPLETED`이면 최초 영수증과 현재 세이브를 그대로 반환한다.
3. `WIN`이면 Stage 보상표에서 정확히 한 정의를 선택하고 새 인스턴스 ID를 만든다.
4. 컬렉션, Stage 클리어, `completedStageRuns`와 수정 시각을 갱신한다.
5. `stage_runs`를 `PENDING`에서 `COMPLETED`로 조건부 전환한다.
6. 어느 쓰기라도 실패하면 세이브와 실행 완료를 모두 롤백한다.

반복 완료 요청이 최초 요청과 다른 결과를 보내도 서버는 첫 결과와 보상을 바꾸지 않는다.

## 3. 클라이언트와 화면

### typed API와 `GameSession`

[`PathfinderApiClient.ts`](../../src/game/client/PathfinderApiClient.ts)는 Stage 시작·완료 응답을
런타임 검증한다. 완료 영수증은 반환된 세이브의 동일 `completedStageRuns` 기록과 일치해야
하며, 요청한 실행 ID와 결과도 일치해야 한다.

[`GameSession.ts`](../../src/game/simulation/GameSession.ts)는 Phaser 객체와 분리해 다음 상태를
소유한다.

- 현재 `StartedStageRun`
- 서버 시드로 만든 로컬 `BattleSession`
- 서버 완료 영수증과 갱신된 활성 슬롯
- 결과 화면에 표시할 Stage와 획득 카드 `CardDisplayModel`

플레이어 덱은 저장 덱과 컬렉션에서 새 전투 인스턴스로 만들고, 적 덱은 Stage가 참조하는
청사진에서 별도로 만든다. 두 덱과 저장 카드 인스턴스 ID는 공유하지 않는다. Stage 시드는
플레이어 전투와 전체 simulation에 사용하며 적 셔플은 같은 실행 시드에서 결정적으로 파생한다.

### Stage, Battle, Result

- `StageScene`은 Stage 콘텐츠, 클리어 여부, 완료 횟수, 승리 횟수와 컬렉션 수를 표시한다.
- Stage와 Deck Builder의 전투 시작은 서버 실행 ID·시드 발급이 성공한 뒤에만 Battle로 간다.
- `BattleScene`은 실행 ID·Stage ID·시드를 현재 전투에 연결한다.
- 마지막 승패 Action의 `presentAction()` Promise가 끝난 뒤에만 완료 API를 호출한다.
- 완료 저장이 실패하면 최종 전투 상태를 유지하고 화면 클릭으로 같은 결과를 재시도한다.
- 전투 나가기는 확인 뒤 실행을 `LOSS`·무보상으로 완료해 `PENDING`을 남기지 않는다.
- `BattleResultScene`은 서버 결과, 실행 ID, 컬렉션 수와 실제 획득 카드를 표시한다.
- 다시 전투는 새 실행을 발급한 뒤 같은 Stage를 시작한다.

가로 결과 화면은 요약과 획득 카드를 나란히 배치한다. 세로 결과 화면은 compact 카드 variant와
고정된 결과 콘텐츠 높이를 사용해 390×844에서도 제목, 영수증, 카드와 세 버튼이 모두 보인다.
이 compact 값은 theme token으로 관리하며 일반 카드의 최소 너비는 바꾸지 않았다.

## 4. 멱등성, 저장과 복사본 제한

- 각 `WIN`은 새 카드 인스턴스 ID 하나를 만들므로 같은 정의를 여러 번 소유할 수 있다.
- 컬렉션에는 같은 카드 정의의 소유 수량 상한을 두지 않는다.
- Stage 클리어 ID는 첫 승리에 한 번만 추가하며 반복 승리는 실행 기록과 보상을 계속 남긴다.
- 덱의 같은 유닛 정의 최대 2장 제한은 기존 validator가 계속 적용한다.
- 테스트에서 같은 적 유닛 정의를 세 번 보상으로 소유한 뒤 그 세 인스턴스를 덱에 넣는 요청은
  `COPY_LIMIT_EXCEEDED`로 거부됐다.
- 서버 재시작과 새 브라우저 세션 뒤에도 컬렉션, 완료 기록과 클리어 상태가 복원됐다.

## 5. 구현자 결정사항

승인된 게이트 D·E를 바꾸지 않는 범위에서 다음을 결정했다.

1. 계정·슬롯·Stage마다 완료되지 않은 실행은 하나만 유지한다. 새로고침은 새 보상 기회를
   만들지 않고 같은 실행 ID·시드로 전투를 처음부터 재구성한다.
2. 중간 Action 상태는 서버에 저장하지 않는다. Phase 6의 Scene 재진입 원칙에 따라
   `PENDING` 실행의 결정적 초기 전투를 다시 만든다.
3. 사용자가 전투에서 나가면 실행을 `LOSS`로 완료한다. 단순 Scene 종료로 `PENDING` 실행을
   누적하지 않는다.
4. 서버의 멱등 영수증을 권위 결과로 사용한다. 같은 실행에 상충하는 완료 요청이 와도 최초
   결과와 보상을 유지한다.
5. 기존 Phase 3/7 슬롯은 데이터 삭제나 새 슬롯 생성 없이 Stage 01을 자동 해금한다.
6. 결과 저장 실패 시 Result로 이동하지 않고 완료된 로컬 전투를 유지해 안전하게 재시도한다.
7. 세로 보상 화면의 카드만 160px compact theme variant를 사용한다. 일반 카드의 200px 최소
   너비와 카드 자산은 변경하지 않는다.

## 6. 사용자 결정사항

사용자는 `public/plan/Plan.md`의 Phase 8을 구현하고 결과를 이 문서에 기록하며, 사용자
결정사항 또는 고려할 점도 함께 남기도록 요청했다.

이번 Phase에서는 이미 승인된 값을 그대로 적용했다.

- Stage ID `stage-01`
- 플레이어 선공, 적 보정 없음
- Phase 5의 결정적 AI
- `COMMON 100 / RARE 45 / EPIC 20 / LEGENDARY 10`
- 적 리더를 보상 후보에 포함
- 승리마다 정확히 1장, 패배·무승부 무보상
- v1의 인증된 클라이언트 승패 신뢰
- Phase 9 완료 전 추가 Stage·규칙·PvP·서버 권위 전투 금지

따라서 새로운 게임 규칙값이나 범위 확장 승인을 요청하지 않았다.

## 7. 고려해야 할 점과 Phase 9 경계

### v1 결과 신뢰

서버는 실행 소유권과 멱등성은 검증하지만 전투 Action 전체를 재연산하지 않고 클라이언트가 보낸
`WIN`·`LOSS`·`DRAW`를 신뢰한다. 이는 승인된 v1 경계이며 부정 결과 방지나 PvP 권위 모델은
이번 범위에 포함하지 않았다.

### 새로고침 중간 상태

Stage 실행 ID와 시드는 복원하지만 전투 중간 Action 상태는 저장하지 않는다. 새로고침하면 같은
시드의 초기 전투부터 다시 시작한다. Phase 9의 전체 사용자 시나리오에서는 이 동작이 안내 없이도
충분히 명확한지 확인해야 한다.

### 콘텐츠 확장

Stage와 클라이언트 표시 데이터, 서버 콘텐츠 주입 경계는 배열 기반으로 분리했지만 현재 UI는
승인된 Stage 01 하나를 표시한다. 추가 Stage와 Deck을 실제로 넣는 것은 Phase 9 이후 별도 승인
범위다.

### production bundle

production build는 성공했지만 단일 JavaScript chunk가 `2,685.78 kB`
(`gzip 689.91 kB`)로 Vite의 `2,500 kB` 경고 기준을 넘는다. Phaser와 rexUI를 포함한 현재
단일 진입 번들이며 기능 실패는 아니다. Phase 9에서 Scene·개발 도구의 code splitting과 실제
압축 전송 크기를 검토해야 하며 경고 기준만 높여 숨기지 않았다.

## 8. 검증 결과

### 자동 검증

| 검증 항목                                          | 결과                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| Phase 8 집중 테스트                                | `PASS` — 7 files, 31 tests                             |
| Stage 데이터·적 덱 전체 후보·리더·가중치           | `PASS`                                                 |
| 새 슬롯 해금·기존 Phase 3 슬롯 영구 마이그레이션   | `PASS`                                                 |
| DB v1→v2 migration                                 | `PASS`                                                 |
| 실행 시작·`PENDING` 재사용·계정/슬롯 격리          | `PASS`                                                 |
| `WIN` 1장·`LOSS`/`DRAW` 0장                        | `PASS`                                                 |
| 모든 양의 가중치 후보 선택 가능·적 리더 실제 지급  | `PASS`                                                 |
| 반복 승리·동일 정의 중복 소유·덱 2장 제한          | `PASS`                                                 |
| 중복 완료 최초 영수증 반환·서버 재시작 복원        | `PASS`                                                 |
| 강제 Stage 완료 쓰기 실패 시 세이브 갱신 동시 롤백 | `PASS` — trigger 실패 뒤 `PENDING` 유지 및 정상 재시도 |
| 서버 시드 독립 전투 덱·결과 저장·전투 포기         | `PASS`                                                 |
| 전체 Vitest                                        | `PASS` — 35 files, 169 tests                           |
| `npm run typecheck`                                | `PASS`                                                 |
| `npm run lint`                                     | `PASS`                                                 |
| `npm run format:check`                             | `PASS`                                                 |
| `npm run build`                                    | `PASS` — 1973 modules, chunk-size warning 1건          |
| `git diff --check`                                 | `PASS`                                                 |

### 실제 Chromium QA

폐기 가능한 별도 SQLite DB에서 API와 Vite를 함께 실행했다.

| 시나리오                      | 결과                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| 신규 계정·슬롯·Stage 01 진입  | `PASS` — 초기 컬렉션 30장, 합법 덱, `stage-01` 해금                          |
| 서버 실행 ID·시드 발급        | `PASS` — Battle dataset와 DB 실행 행 일치                                    |
| 가로 전체 전투 1280×720       | `PASS` — 사용자 결정 prompt, 4x, Action Skip, 자연 승리                      |
| 첫 승리 결과                  | `PASS` — 컬렉션 30→31, 적 COMMON 카드 1장, 클리어 저장                       |
| 세로 전체 전투 390×844        | `PASS` — 자연 패배, 무보상, 컬렉션 31 유지                                   |
| 상충하는 중복 완료 `WIN` 요청 | `PASS` — 최초 `LOSS` 영수증, 보상 `null`, 컬렉션 31 유지                     |
| 새 브라우저·새로고침 복원     | `PASS` — 클리어 `true`, 컬렉션 31, 완료·승리 횟수 표시                       |
| 반복 Stage 실행               | `PASS` — QA 종료 시 7회 완료, 5승/2패, 승리 보상 5장, 컬렉션 35장            |
| 가로 승리 보상 결과           | `PASS` — 요약·실행 ID·카드·세 버튼 clipping/overlap 없음                     |
| 세로 패배 결과                | `PASS` — 무보상 안내·세 버튼 clipping/overlap 없음                           |
| 세로 승리 보상 결과           | `PASS` — compact 카드 포함 전체 패널이 `top 192 / bottom 818`로 화면 내 위치 |
| Chromium page error           | `PASS` — 0건                                                                 |

세로 보상 결과를 반복 검증할 때만 폐기 가능한 QA DB의 새 `PENDING` 실행 시드를 첫 자연 승리에서
관측한 유효한 시드로 고정해 동일 결과를 재현했다. 제품 코드, 보상표와 실제 사용자 데이터는
수정하지 않았다. 이 과정에서 발견한 세로 결과 패널 overflow와 미사용 텍스트 잔존을 수정한 뒤
다시 전체 화면을 확인했다.

QA 서버, 임시 DB, storage state, 스크린샷과 자동화 산출물은 모두 종료·삭제했으며 저장소에
남기지 않았다. 미실시 Phase 8 수동 화면이나 숨긴 실패는 없다. 남은 항목은 production bundle
경고 1건과 위에 명시한 승인된 Phase 9 경계다.
