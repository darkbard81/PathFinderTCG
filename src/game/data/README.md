# Game data contracts

이 디렉터리는 Phaser와 분리된 직렬화 가능 데이터의 공개 경계다.

- `contracts.ts`: TypeScript의 불변 데이터 계약과 코어 덱 상수
- `game-data.schema.json`: JSON Schema Draft 2020-12 구조 검증
- `schemaValidation.ts`: 알 수 없는 JSON 값을 계약 타입으로 파싱
- `validation.ts`: 카드 정의, 소유권, 복사본 제한처럼 JSON Schema만으로 판정할 수 없는
  참조 무결성 검증

검증은 다음 두 층을 순서대로 사용한다.

```text
unknown JSON
  -> parse*() 구조 검증
  -> validate*() 참조·소유권·덱 합법성 검증
  -> 저장 또는 전투 생성
```

`SavedDeck`은 덱 구성 화면의 임시 저장을 위해 리더가 없거나 유닛이 29장 미만인 상태를
구조적으로 허용한다. `parsePlayableSavedDeck`은 Stage 진입에 필요한 리더와 유닛 29장의
구조를 먼저 검사한다. `validateSavedDeckForStorage`는 소유권과 카드 종류를 검사하고,
`validatePlayableSavedDeck`은 복사본 제한과 저비용 유닛 조건까지 검사한다.

`BattleDeckFactory`는 `src/game/simulation/`에 있으며 저장 카드 인스턴스를 직접 수정하지
않는다. 호출자가 제공한 새 전투 ID와 명시적 시드로 독립 `BattleDeck`을 만든다.
