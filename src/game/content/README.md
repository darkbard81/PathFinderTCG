# Test game content

이 디렉터리는 Phase 3에서 확정한 아군·적군 테스트 카드 풀과 덱 구성을 보관한다. 카드 전투
규칙은 `CardDefinition`, 표현 정보는 `CardPresentation`, 카드 풀 설계 검증에만 필요한 역할,
Skill 기대 이득과 아트 방향은 `CardDesignRecord`로 분리한다.

## 공개 경계

- `ALLIED_CARD_DESIGNS`, `ENEMY_CARD_DESIGNS`: 진영별 리더 1종과 유닛 15종
- `TEST_CARD_CATALOG`: 32종 카드 정의와 Phase 4가 채울 안정적인 아트 자산 키
- `createAlliedStarterDeckContent`: 호출자가 주입한 ID factory로 소유 인스턴스 30장과 starter
  `SavedDeck` 생성
- `ENEMY_TEST_DECK_BLUEPRINT`: 적 리더 1장과 유닛 29장의 수량 청사진
- `STAGE_ONE_REWARD_ENTRIES`: Stage 01에 연결된 적 카드 레어리티별 보상 가중치
- `STAGE_ONE_DEFINITION`, `STAGE_CATALOG`: Stage 01 규칙 데이터와 사용자 표시 메타데이터
- `validateTestCardPool`: 비용·역할·Skill·레어리티·예산·상태 규칙·아트 입력 분포 검증

서버는 `createPhaseEightGameContent`를 기본 콘텐츠로 사용한다. 새 슬롯마다 새 소유 인스턴스와
덱 ID를 발급하고 Stage 01을 해금하며, Phase 1 fixture를 런타임 데이터로 사용하지 않는다.

## Phase 경계

`artAssetKey`는 Phase 4 파일이 연결될 안정적인 키다. Phase 3은 카드별 장면, 장비, 색상과
자세까지만 확정하며 이미지 파일이나 자산 매니페스트 항목은 만들지 않는다.

`STAGE_ONE_REWARD_ENTRIES`는 승인된 가중치 데이터이며 Stage 01의 적 덱 정의 전체와 적
리더를 포함한다. Stage 실행, 서버 시드 기반 보상 추첨과 멱등 지급은 Phase 8에서 연결되었다.
