# Phase 1 구현 결과 — 카드, 인스턴스, 덱, Stage 데이터 계약

| 항목      | 결과                                         |
| --------- | -------------------------------------------- |
| 상태      | `COMPLETE`                                   |
| 완료일    | 2026-07-27                                   |
| 기준 문서 | [Plan.md](./Plan.md)                         |
| 구현 범위 | 직렬화 계약, JSON Schema, validator, factory |

## 1. 결과 요약

카드 정의, 표현 메타데이터, 소유 카드 인스턴스, 저장 덱, 적 덱 청사진, 전투 카드·덱, Stage와
세이브 슬롯을 서로 분리된 TypeScript 계약과 JSON Schema Draft 2020-12로 구현했다.

JSON Schema가 구조를 검사하고 TypeScript semantic validator가 정의 ID, 소유권, 카드 종류,
복사본 제한, 덱 장수와 Stage 보상 같은 참조 무결성을 검사한다. `BattleDeckFactory`는 합법적인
저장 덱 또는 적 청사진에서 새 전투 ID와 시드 기반 셔플을 사용해 원본과 독립된 전투 덱을
만든다.

Phaser, rexUI, Scene, Sprite와 DOM 객체는 새 데이터·simulation 계약에 포함하지 않았다.

## 2. 변경 파일

### 데이터 계약

| 파일                                                                 | 변경 내용                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| [`contracts.ts`](../../src/game/data/contracts.ts)                   | Phase 1 TypeScript 계약, Schema 버전과 코어 덱 상수    |
| [`game-data.schema.json`](../../src/game/data/game-data.schema.json) | Phase 1 데이터용 JSON Schema Draft 2020-12             |
| [`schemaValidation.ts`](../../src/game/data/schemaValidation.ts)     | 알 수 없는 JSON을 계약 타입으로 파싱하는 Ajv 검증 계층 |
| [`validation.ts`](../../src/game/data/validation.ts)                 | 소유권·정의 참조·덱·Stage·세이브 semantic validator    |
| [`index.ts`](../../src/game/data/index.ts)                           | 데이터 계약의 공개 export 경계                         |
| [`README.md`](../../src/game/data/README.md)                         | 구조 검증과 참조 무결성 검증의 사용 순서               |

### 전투 덱 생성과 테스트

| 파일                                                                               | 변경 내용                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`BattleDeckFactory.ts`](../../src/game/simulation/BattleDeckFactory.ts)           | 저장 덱·적 청사진에서 독립 전투 덱 생성과 결정적 셔플  |
| [`BattleDeckFactory.test.ts`](../../src/game/simulation/BattleDeckFactory.test.ts) | 새 ID, 원본 불변성, 시드 재현, 잘못된 입력 회귀 테스트 |
| [`schemaValidation.test.ts`](../../src/game/data/schemaValidation.test.ts)         | Schema 동기화, 유효·무효 구조와 JSON 왕복 테스트       |
| [`validation.test.ts`](../../src/game/data/validation.test.ts)                     | 덱·소유권·Stage·세이브 참조 무결성 테스트              |
| [`testFixtures.ts`](../../src/game/data/testFixtures.ts)                           | 유효한 30장 계약 테스트 fixture                        |

### 프로젝트 기록과 의존성

| 파일                                | 변경 내용                                                          |
| ----------------------------------- | ------------------------------------------------------------------ |
| [`Plan.md`](./Plan.md)              | 현재 기준 갱신, Phase 1 완료 상태와 결과 문서 연결                 |
| [`Phase_1.md`](./Phase_1.md)        | 구현 결과, 결정사항, 고려사항과 검증 증거 기록                     |
| `package.json`, `package-lock.json` | 기존 `ajv@8.20.0`을 런타임 의존성으로 이동하고 보안 패치 lock 갱신 |

## 3. 구현한 데이터 경계

| 계약                 | 구현 결과                                                                        |
| -------------------- | -------------------------------------------------------------------------------- |
| `CardDefinition`     | 기존 전투 규칙 선언을 그대로 사용하고 표현·저장·Phaser 필드를 추가하지 않음      |
| `CardPresentation`   | 카드 정의 ID, 레어리티, 카드 아트 자산 키와 레어리티 프레임 variant 분리         |
| `CardInstance`       | 고유 소유 인스턴스 ID와 불변 카드 정의 ID만 저장                                 |
| `OwnedCollection`    | 세이브 슬롯이 소유한 카드 인스턴스 목록                                          |
| `SavedDeck`          | nullable 리더와 소유 유닛 인스턴스 최대 29장을 참조하는 편집 가능한 원본 덱      |
| `EnemyDeckBlueprint` | 리더 정의 ID와 유닛 정의별 수량으로 전투마다 새 인스턴스를 만들 수 있는 청사진   |
| `BattleCardInstance` | 새 전투 ID, 원본 출처, 존, 위치, 피해, `EXILED`, 등장 대기를 가진 직렬화 상태    |
| `BattleDeck`         | 카드 객체는 한 번만 저장하고 리더 및 Deck·Hand·Field·Drop·Exile은 전투 ID로 참조 |
| `StageDefinition`    | Stage ID, 적 덱 ID, AI 설정 ID와 양의 보상 가중치                                |
| `SaveSlotState`      | Schema 버전, 슬롯 1~3, 컬렉션, 덱, 선택 덱, 진행도, 완료 실행과 UTC 수정 시각    |

## 4. 검증 계층

```text
unknown JSON
  -> parse*() JSON Schema 구조 검증
  -> validate*() 참조·소유권·게임 데이터 합법성 검증
  -> 저장 또는 BattleDeckFactory 입력
```

JSON Schema와 TypeScript 상수의 핵심 숫자는 테스트로 동기화한다.

- 총 전투 카드 30장
- 유닛 29장
- 같은 유닛 정의 최대 2장
- Schema 버전 1
- 슬롯 ID 1~3

JSON Schema만으로 다른 배열의 ID 존재 여부를 확인할 수 없으므로 다음 항목은 semantic
validator가 담당한다.

- 카드 인스턴스가 실제 카드 정의를 참조하는지
- 저장 덱의 모든 인스턴스를 해당 컬렉션이 소유하는지
- 리더 영역과 유닛 영역의 카드 종류가 올바른지
- 같은 유닛 정의를 3장 이상 참조하지 않는지
- Stage 보상이 해당 적 덱의 카드 정의만 참조하고 적 리더를 포함하는지
- 선택 덱, Stage 진행도, 완료 실행과 보상 인스턴스가 세이브 내부에 존재하는지

## 5. 저장 덱과 Stage 진입 덱

덱 구성 화면은 30장 미만의 작업 중 덱을 저장할 수 있으므로 두 검증을 구분했다.

| 검증                          | 허용·검사 범위                                                             |
| ----------------------------- | -------------------------------------------------------------------------- |
| `parseSavedDeck`              | nullable 리더와 유닛 0~29장의 저장 가능한 JSON 구조                        |
| `parsePlayableSavedDeck`      | 리더 ID와 유닛 ID 정확히 29개인 Stage 진입 JSON 구조                       |
| `validateSavedDeckForStorage` | 소유권, 카드 종류, 중복 인스턴스와 복사본 검사                             |
| `validatePlayableSavedDeck`   | 총 30장, 최대 2복사본과 저비용 유닛 최소 8장을 포함한 Stage 진입 의미 검사 |

이에 따라 미완성 덱은 저장할 수 있지만 리더 누락, 유닛 부족, 31장, 리더 복수, 유닛 3복사본,
미소유 인스턴스 또는 존재하지 않는 카드 정의가 있으면 Stage에 진입할 수 없다.

## 6. BattleDeckFactory

`BattleDeckFactory`는 다음 순서를 보장한다.

1. 저장 덱 또는 적 청사진의 semantic validation을 먼저 실행한다.
2. 호출자가 제공한 `BattleIdFactory`로 전투 덱과 카드마다 새 ID를 만든다.
3. 리더를 `FIELD / BACK_CENTER`에 피해 0, 상태 없음, 등장 대기 없음으로 배치한다.
4. 유닛 29장을 `DECK`에 놓고 명시적인 unsigned 32-bit 시드로 Fisher–Yates 셔플한다.
5. 생성 결과를 다시 `validateBattleDeck`으로 검사하고 불변 객체로 반환한다.

동일한 원본 순서, ID factory 결과와 시드는 같은 `drawPileIds` 순서를 만든다. 저장 덱,
`CardInstance`와 적 청사진은 변경하지 않으며 전투 ID는 소유 카드 인스턴스 ID와 다르다.

## 7. 사용자 결정사항

기존 승인 내용과 Phase 1 구현에서 확정한 적용 방식은 다음과 같다.

1. 총 30장 계약은 리더 1장과 유닛 29장이다.
2. 미완성 덱 저장은 허용하지만 Stage 진입은 `validatePlayableSavedDeck`을 반드시 통과해야 한다.
3. `CardDefinition`은 전투 규칙만 유지하고 이미지·레어리티는 `CardPresentation`으로 분리한다.
4. 코어 `statusId`는 `EXILED` 하나만 허용한다.
5. Stage 보상은 적 덱에 포함된 카드만 참조하며 적 리더도 양의 가중치 후보에 포함한다.
6. 세이브 Schema 버전은 `1`, 슬롯 ID는 `1 | 2 | 3`, 저장 시각은 UTC 문자열을 사용한다.
7. 전투 ID 생성 방식은 서버 또는 실행 환경이 주입하고, factory는 중복 ID를 거부한다.

현재 승인 범위 안에서 Phase 2를 시작하기 위해 추가로 필요한 사용자 결정은 없다.

## 8. 고려해야 할 점

### ID 발급

Phase 1은 ID 형식과 중복 검사를 정의하지만 계정·Stage 실행 전체에서 전역 고유한 ID를
발급하는 주체는 Phase 2 서버와 Phase 5 전투 실행 계층이다. UUID 또는 서버 실행 ID 기반
factory를 연결해야 하며 배열 순번만으로 영구 ID를 만들면 안 된다.

### 새 게임 초기화

계약과 validator는 준비됐지만 실제 아군 카드 30장과 starter 덱 생성은 Phase 3 카드 풀이
확정된 뒤 Phase 2의 슬롯 생성 흐름에 연결한다. Phase 1 테스트 fixture를 실제 카드 데이터로
사용하지 않는다.

### 자산 매니페스트

`CardPresentation.artAssetKey`는 안정적인 키 형식을 검증한다. 해당 키의 실제 파일 존재 여부와
`src/game/assets/manifest.ts` 등록은 Phase 4 자산 생성 시 함께 검증한다.

### 세이브 마이그레이션

Phase 2는 DB에 `schemaVersion`을 보존하고 알 수 없는 미래 버전을 거부하거나 명시적인
마이그레이션을 거쳐야 한다. `BattleDeck`은 저장 슬롯에 기록하지 않고 전투 종료 후 폐기한다.

### 의존성

Ajv는 이제 production 데이터 파서가 사용하므로 기존 `devDependencies`에서 `dependencies`로
이동했다. 설치 과정에서 확인된 ESLint 전이 의존성 `brace-expansion`은 호환 보안 패치
`5.0.7 → 5.0.8`만 적용했으며 `npm audit` 결과는 0건이다.

## 9. 검증 결과

| 검증                                                | 결과                               |
| --------------------------------------------------- | ---------------------------------- |
| Phase 1 targeted 테스트                             | `PASS` — 3 files, 19 tests         |
| `npm run typecheck`                                 | `PASS`                             |
| `npm run lint`                                      | `PASS`                             |
| `npm run format:check`                              | `PASS`                             |
| `npm test`                                          | `PASS` — 12 files, 53 tests        |
| `npm run build`                                     | `PASS` — Vite production build     |
| `npm audit --audit-level=high`                      | `PASS` — 0 vulnerabilities         |
| `git diff --check`                                  | `PASS`                             |
| Phaser·rexUI·Scene·DOM 객체의 데이터 계약 유입 검색 | `PASS` — 런타임 import 없음        |
| 저장 슬롯과 전투 덱 JSON serialize/parse 왕복       | `PASS` — 데이터 손실 없음          |
| 빌드 생성물 정리                                    | `PASS` — `dist/`를 휴지통으로 이동 |

데이터·simulation 변경이며 렌더링 또는 레이아웃 변경이 없으므로 브라우저 시각 검증 대상은 없다.
