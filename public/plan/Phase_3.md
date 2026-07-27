# Phase 3 구현 결과 — 테스트 카드 풀과 아군·적군 30장 덱

| 항목      | 결과                                                    |
| --------- | ------------------------------------------------------- |
| 상태      | `COMPLETE`                                              |
| 완료일    | 2026-07-27                                              |
| 기준 문서 | [Plan.md](./Plan.md)                                    |
| 구현 범위 | 32종 카드 설계, 양쪽 30장 덱, starter 슬롯, 검증·테스트 |

## 1. 결과 요약

아군과 적군에 각각 리더 1종과 유닛 15종을 구현했다. 각 진영은 리더 1장, 유닛 14종 2장씩과
유닛 1종 1장으로 정확히 30장을 사용한다. 아군은 새 세이브 슬롯마다 고유 ID를 가진 소유 카드
인스턴스 30장과 선택된 starter 덱을 받으며, 적군은 전투마다 새 인스턴스를 만들 수 있는
`EnemyDeckBlueprint`를 사용한다.

카드 전투 규칙, 표현 메타데이터, 카드 풀 설계 메타데이터를 분리했다. Phase 4가 사용할 아트
자산 키와 카드별 장면·장비·색상·자세는 확정했지만 이미지 파일과 자산 매니페스트는 만들지
않았다.

## 2. 변경 파일

| 영역              | 파일                                                                                                     | 결과                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 카드 설계 계약    | [`cardDesign.ts`](../../src/game/content/cardDesign.ts)                                                  | 진영, 역할, 기대 Skill 이득, 아트 방향, 보상 가중치 메타데이터  |
| 아군 카드         | [`alliedCardDesigns.ts`](../../src/game/content/alliedCardDesigns.ts)                                    | 아군 리더 1종과 유닛 15종                                       |
| 적군 카드         | [`enemyCardDesigns.ts`](../../src/game/content/enemyCardDesigns.ts)                                      | 적군 리더 1종과 유닛 15종                                       |
| 덱·카탈로그       | [`testCardPool.ts`](../../src/game/content/testCardPool.ts)                                              | 32종 카탈로그, starter 생성, 적 청사진, Stage 01 보상 입력      |
| 카드 풀 validator | [`testCardPoolValidation.ts`](../../src/game/content/testCardPoolValidation.ts)                          | 승인 분포, ID, 예산, 코어 상태와 아트 입력 검증                 |
| 공개 경계·문서    | [`index.ts`](../../src/game/content/index.ts), [`README.md`](../../src/game/content/README.md)           | Phase 3 콘텐츠 export와 Phase 경계                              |
| 테스트            | [`testCardPool.test.ts`](../../src/game/content/testCardPool.test.ts)                                    | Schema, 분포, 예산, 덱 생성, 보상과 회귀 테스트                 |
| 서버 연결         | [`gameContent.ts`](../../src/server/gameContent.ts), [`app.ts`](../../src/server/app.ts)                 | 실제 카드 풀과 starter 덱을 기본 `ServerGameContent`에 연결     |
| 서버 테스트·문서  | [`gameContent.test.ts`](../../src/server/gameContent.test.ts), [`README.md`](../../src/server/README.md) | 새 슬롯의 30장 소유권, 새 ID, Schema·의미 검증과 현재 동작 기록 |
| 계획 기록         | [`Plan.md`](./Plan.md), [`Phase_3.md`](./Phase_3.md)                                                     | Phase 3 완료 상태, 전체 카드 설계, 결정사항과 후속 고려사항     |

## 3. 승인 분포 적용 결과

두 진영에 같은 구성 계약을 적용했다.

| 검증 항목              | 진영별 결과                                              |
| ---------------------- | -------------------------------------------------------- |
| 카드 정의              | 리더 1종 + 유닛 15종 = 16종                              |
| 덱                     | 리더 1장 + 유닛 29장 = 30장                              |
| 비용별 유닛 정의       | Cost 1/2/3/4/5/6/7 = `4/3/3/2/1/1/1`                     |
| 비용별 유닛 덱 장수    | Cost 1/2/3/4/5/6/7 = `8/6/6/4/2/2/1`                     |
| 주 역할                | 공격 4, 수비 3, 점유 3, 손패 2, 방해 2, 회수 1           |
| 유닛 Skill 구성        | Active만 4, Reactive만 4, Passive만 3, 두 종류 2, 없음 2 |
| 레어리티               | `COMMON 8`, `RARE 4`, `EPIC 3`, `LEGENDARY 1`            |
| 첫 배치 가능 비용 카드 | 리더 지배력 2 이하 유닛 14장                             |
| 리더                   | hp 20, dominance 2, attack 0, 공개 Skill 정확히 하나     |
| 유닛 1장 사용 정의     | 각 진영 Cost 7 대전사                                    |
| 카드·Skill ID          | 32개 카드 ID와 선언된 모든 Skill ID가 전역에서 고유      |
| 코어 상태              | Active `ATTACK`의 `ACTION_TARGET`에 주는 `EXILED`만 사용 |
| 금지된 상태 처리       | `REMOVE_STATUS`, `STATUS_REMOVED`, 임의 상태 추가 없음   |

## 4. 카드 데이터와 전투력 예산

표의 수치는 `Cost / dominance / hp / attack` 순서다. 역할은 `주 역할 / 보조 역할`이며 `-`는
보조 역할이나 Skill이 없음을 뜻한다. 예산은
`기본 수치 점수 + Skill 기대 이득 = 평가 총점 / 목표 총점`이다. 레어리티는 이 계산에 사용하지
않았다.

### 4.1 아군

| ID                          | 이름                 | 종류   | 수치       | 역할      | Skill ID와 선언 효과                                                                                                                                     | 레어리티  | 수량 | 예산             |
| --------------------------- | -------------------- | ------ | ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---: | ---------------- |
| `allied-leader-aelira`      | 태양잎 여왕 아엘리라 | LEADER | `0/2/20/0` | 손패/점유 | A `allied-leader-aelira-sunlit-command`: `DRAW → DRAW OWNER 1`                                                                                           | LEGENDARY |    1 | 리더 기본 합 2   |
| `allied-sunroot-pathfinder` | 태양뿌리 길잡이      | UNIT   | `1/1/2/0`  | 점유/-    | P `allied-sunroot-pathfinder-deep-routes`: `MODIFY_STAT SELF DOMINANCE +1`                                                                               | COMMON    |    2 | `2.5+1.5=4/4`    |
| `allied-dawn-scribe`        | 새벽 기록관          | UNIT   | `1/1/1/0`  | 손패/-    | A `allied-dawn-scribe-living-chronicle`: `DRAW → DRAW OWNER 1`                                                                                           | COMMON    |    2 | `2+2=4/4`        |
| `allied-mossguard`          | 이끼방패 수호자      | UNIT   | `1/1/2/0`  | 수비/-    | R `allied-mossguard-renewing-moss`: `DAMAGE_RECEIVED SELF → HEAL SELF 1`                                                                                 | COMMON    |    2 | `2.5+1.5=4/4`    |
| `allied-amber-duelist`      | 호박빛 결투가        | UNIT   | `1/1/1/2`  | 공격/-    | -                                                                                                                                                        | COMMON    |    2 | `4+0=4/4`        |
| `allied-pollen-saboteur`    | 꽃가루 교란자        | UNIT   | `2/1/3/1`  | 방해/손패 | A `allied-pollen-saboteur-blinding-cloud`: `DISCARD → DISCARD OPPONENT 1`                                                                                | COMMON    |    2 | `4+2=6/6`        |
| `allied-vine-cartographer`  | 덩굴 지도사          | UNIT   | `2/1/4/1`  | 점유/-    | P `allied-vine-cartographer-living-map`: `MODIFY_STAT SELF DOMINANCE +1`                                                                                 | COMMON    |    2 | `4.5+1.5=6/6`    |
| `allied-seed-oracle`        | 씨앗 예언가          | UNIT   | `2/1/4/0`  | 손패/-    | R `allied-seed-oracle-second-omen`: `CARD_DISCARDED OWNER → DRAW OWNER 1`                                                                                | RARE      |    2 | `3.5+2.5=6/6`    |
| `allied-gleam-lancer`       | 햇살 창기병          | UNIT   | `3/1/5/3`  | 공격/-    | A `allied-gleam-lancer-piercing-ray`: `ATTACK → DAMAGE ACTION_TARGET 1`                                                                                  | COMMON    |    2 | `7+1=8/8`        |
| `allied-bark-shield`        | 껍질방패 파수꾼      | UNIT   | `3/2/5/1`  | 수비/-    | R `allied-bark-shield-seal-the-wound`: `DAMAGE_RECEIVED SELF → HEAL SELF 1`                                                                              | RARE      |    2 | `6.5+1.5=8/8`    |
| `allied-grove-renewer`      | 숲의 되살림사        | UNIT   | `3/2/3/0`  | 회수/수비 | R `allied-grove-renewer-return-to-light`: `CARD_DESTROYED OWNER → PLACE TRIGGER_SUBJECT`; P `allied-grove-renewer-ancient-vitality`: `HEALTH +1 SELF`    | EPIC      |    2 | `4.5+3.5=8/8`    |
| `allied-solar-blade`        | 태양검 선봉장        | UNIT   | `4/2/4/3`  | 공격/-    | A `allied-solar-blade-corona-cut`: `ATTACK → DAMAGE ACTION_TARGET 2`                                                                                     | RARE      |    2 | `8+2=10/10`      |
| `allied-canopy-warden`      | 수관 감시자          | UNIT   | `4/3/6/1`  | 수비/방해 | R `allied-canopy-warden-breaking-warning`: `ATTACK_DECLARED OPPONENT → ATTACK -1 TRIGGER_SOURCE`                                                         | COMMON    |    2 | `8.5+1.5=10/10`  |
| `allied-worldtree-anchor`   | 세계수 닻지기        | UNIT   | `5/3/8/2`  | 점유/수비 | P `allied-worldtree-anchor-rooted-domain`: `MODIFY_STAT SELF DOMINANCE +1`                                                                               | EPIC      |    2 | `10.5+1.5=12/12` |
| `allied-twilight-exiler`    | 황혼 추방자          | UNIT   | `6/2/7/2`  | 방해/공격 | A `allied-twilight-exiler-sever-from-dawn`: `ATTACK → ADD_STATUS ACTION_TARGET EXILED`; R `allied-twilight-exiler-last-light`: `DAMAGE TRIGGER_SOURCE 1` | EPIC      |    2 | `8.5+5.5=14/14`  |
| `allied-golden-champion`    | 황금숲 대전사        | UNIT   | `7/3/9/7`  | 공격/수비 | -                                                                                                                                                        | RARE      |    1 | `16+0=16/16`     |

### 4.2 적군

| ID                          | 이름             | 종류   | 수치       | 역할      | Skill ID와 선언 효과                                                                                                                                            | 레어리티  | 수량 | 예산             |
| --------------------------- | ---------------- | ------ | ---------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---: | ---------------- |
| `enemy-leader-velsara`      | 월식 여왕 벨사라 | LEADER | `0/2/20/0` | 방해/수비 | R `enemy-leader-velsara-eclipse-reprisal`: `DAMAGE_RECEIVED SELF → DAMAGE TRIGGER_SOURCE 1`                                                                     | LEGENDARY |    1 | 리더 기본 합 2   |
| `enemy-nightroot-scout`     | 밤뿌리 척후병    | UNIT   | `1/1/2/0`  | 점유/-    | P `enemy-nightroot-scout-hidden-routes`: `MODIFY_STAT SELF DOMINANCE +1`                                                                                        | COMMON    |    2 | `2.5+1.5=4/4`    |
| `enemy-gloam-whisperer`     | 땅거미 속삭임꾼  | UNIT   | `1/1/1/0`  | 손패/방해 | A `enemy-gloam-whisperer-unravel-thought`: `DRAW → DISCARD OPPONENT 1`                                                                                          | COMMON    |    2 | `2+2=4/4`        |
| `enemy-obsidian-guard`      | 흑요석 근위대    | UNIT   | `1/1/2/0`  | 수비/방해 | R `enemy-obsidian-guard-dulling-ward`: `ATTACK_DECLARED OPPONENT → ATTACK -1 TRIGGER_SOURCE`                                                                    | COMMON    |    2 | `2.5+1.5=4/4`    |
| `enemy-crimson-duelist`     | 진홍 결투가      | UNIT   | `1/1/1/2`  | 공격/-    | -                                                                                                                                                               | COMMON    |    2 | `4+0=4/4`        |
| `enemy-hex-weaver`          | 가시주문 직조사  | UNIT   | `2/1/3/1`  | 방해/수비 | A `enemy-hex-weaver-thorn-bind`: `ATTACK → ATTACK -1 ACTION_TARGET`                                                                                             | COMMON    |    2 | `4+2=6/6`        |
| `enemy-shadow-cartographer` | 그림자 지도사    | UNIT   | `2/1/4/1`  | 점유/-    | P `enemy-shadow-cartographer-inked-domain`: `MODIFY_STAT SELF DOMINANCE +1`                                                                                     | COMMON    |    2 | `4.5+1.5=6/6`    |
| `enemy-raven-oracle`        | 까마귀 예언가    | UNIT   | `2/1/4/0`  | 손패/-    | R `enemy-raven-oracle-stolen-vision`: `CARD_DRAWN OPPONENT → DRAW OWNER 1`                                                                                      | RARE      |    2 | `3.5+2.5=6/6`    |
| `enemy-moonfang-raider`     | 월아 습격자      | UNIT   | `3/1/5/2`  | 공격/-    | A `enemy-moonfang-raider-lunar-gouge`: `ATTACK → DAMAGE ACTION_TARGET 2`                                                                                        | COMMON    |    2 | `6+2=8/8`        |
| `enemy-frostveil-sentinel`  | 서리장막 파수꾼  | UNIT   | `3/2/5/1`  | 수비/방해 | R `enemy-frostveil-sentinel-cold-arrival`: `CARD_PLACED OPPONENT → ATTACK -1 TRIGGER_SUBJECT`                                                                   | RARE      |    2 | `6.5+1.5=8/8`    |
| `enemy-gravebloom-revenant` | 무덤꽃 귀환자    | UNIT   | `3/2/2/0`  | 회수/수비 | R `enemy-gravebloom-revenant-return-in-bloom`: `CARD_DESTROYED SELF → PLACE SELF`; P `enemy-gravebloom-revenant-deathless-vigor`: `HEALTH +1 SELF`              | EPIC      |    2 | `4+4=8/8`        |
| `enemy-bloodmoon-blade`     | 혈월 검무사      | UNIT   | `4/2/4/3`  | 공격/-    | A `enemy-bloodmoon-blade-red-arc`: `ATTACK → DAMAGE ACTION_TARGET 2`                                                                                            | RARE      |    2 | `8+2=10/10`      |
| `enemy-nightwall-warden`    | 밤장벽 감시자    | UNIT   | `4/3/5/1`  | 수비/-    | R `enemy-nightwall-warden-shadow-mend`: `DAMAGE_RECEIVED OWNER → HEAL TRIGGER_SUBJECT 1`                                                                        | COMMON    |    2 | `8+2=10/10`      |
| `enemy-blackthorn-anchor`   | 검은가시 닻지기  | UNIT   | `5/3/8/2`  | 점유/수비 | P `enemy-blackthorn-anchor-grasping-domain`: `MODIFY_STAT SELF DOMINANCE +1`                                                                                    | EPIC      |    2 | `10.5+1.5=12/12` |
| `enemy-void-exiler`         | 공허 추방자      | UNIT   | `6/2/7/1`  | 방해/손패 | A `enemy-void-exiler-cast-beyond`: `ATTACK → ADD_STATUS ACTION_TARGET EXILED`; R `enemy-void-exiler-harvest-the-fall`: `CARD_DESTROYED OPPONENT → DRAW OWNER 1` | EPIC      |    2 | `7.5+6.5=14/14`  |
| `enemy-obsidian-champion`   | 흑요석 대전사    | UNIT   | `7/3/9/7`  | 공격/수비 | -                                                                                                                                                               | RARE      |    1 | `16+0=16/16`     |

## 5. 카드 아트 정체성과 Stage 01 보상

아래 입력은 `phase-3-card-identity-v1`로 고정했다. 게이트 C의 현재 공통 프롬프트는
`명백한 성인 엘프 여성, H-Cup 체형, 비노출·비성적 판타지 의상, 2.5D TCG Asset, No Frame,
No Text`다.

현재 `Plan.md`의 게이트 C·확정 제품 기준은 위 비노출·비성적 조건을 유지하지만, Phase 4 이미지
성공 기준 한 줄은 별도 작업트리 변경으로 `Cut-Open Style 의상`을 요구하고 있어 서로
일치하지 않는다. Phase 3의 카드별 아트 방향에는 의상 노출 정도를 넣지 않았으며, Phase 4
이미지 생성 전에 어느 기준을 적용할지 사용자 결정과 게이트 C 재승인 여부 확인이 필요하다.

### 5.1 아군 아트 방향

| 카드 ID                     | 장면                           | 장비                             | 색상                    | 자세                                 | 보상 |
| --------------------------- | ------------------------------ | -------------------------------- | ----------------------- | ------------------------------------ | ---: |
| `allied-leader-aelira`      | 세계수 뿌리의 햇빛 왕좌        | 잎 지팡이, 의식 망토             | 금색·에메랄드·아이보리  | 지팡이를 들고 정면 지휘              |    - |
| `allied-sunroot-pathfinder` | 빛나는 거대 뿌리길             | 잎맥 나침반, 짧은 창             | 초록·꿀빛 금색·갈색     | 무릎을 굽혀 길을 가리킴              |    - |
| `allied-dawn-scribe`        | 일출의 야외 기록보관소         | 빛 두루마리, 수정 첨필           | 연금색·하늘색·크림색    | 글자의 빛을 두른 측면 자세           |    - |
| `allied-mossguard`          | 비 내리는 살아 있는 숲문       | 이끼 대형 방패, 단검             | 이끼색·청동·회색        | 방패 뒤에 낮게 버팀                  |    - |
| `allied-amber-duelist`      | 호박잎 결투장                  | 잎 모양 세이버                   | 호박색·적갈색·초록      | 낮고 빠른 찌르기                     |    - |
| `allied-pollen-saboteur`    | 꽃가루 낀 숲의 협로            | 씨앗탄, 갈고리 칼                | 노랑·세이지·보라        | 몸을 틀어 꽃가루 구름을 던짐         |    - |
| `allied-vine-cartographer`  | 수관 위 측량대                 | 살아 있는 덩굴 지도, 측량 지팡이 | 짙은 초록·황동·흰색     | 지도를 펼쳐 경로를 표시              |    - |
| `allied-seed-oracle`        | 떠다니는 씨앗의 달샘 정원      | 씨앗 성물함, 초승달 낫           | 민트·진주색·청록        | 발아하는 씨앗의 환영을 바라봄        |    - |
| `allied-gleam-lancer`       | 햇살이 가르는 양치식물 전장    | 수정 장창, 비늘 갑옷             | 금색·초록·은색          | 장창을 수평으로 들고 돌진            |    - |
| `allied-bark-shield`        | 가지가 얽힌 요새화 숲문        | 수피 탑방패, 중형 철퇴           | 삼나무색·짙은 초록·구리 | 방패를 땅에 박고 정면 방어           |    - |
| `allied-grove-renewer`      | 낙엽이 빛으로 오르는 고요한 숲 | 뿌리 치유 지팡이, 약초 주머니    | 비취·흰색·로즈골드      | 무릎을 꿇고 잎을 일으킴              |    - |
| `allied-solar-blade`        | 햇빛 기둥이 내린 금빛 공터     | 태양강 대검, 잎 판금             | 백금·주황·짙은 초록     | 대검을 대각선으로 휘두름             |    - |
| `allied-canopy-warden`      | 높은 수관의 밧줄다리           | 장궁, 수피 견갑                  | 소나무색·가죽색·금색    | 높은 곳에서 아래로 활을 당김         |    - |
| `allied-worldtree-anchor`   | 세계수 밑동의 방어전           | 뿌리 닻망치, 목재 중갑           | 고목색·에메랄드·청동    | 닻망치를 양손으로 땅에 박음          |    - |
| `allied-twilight-exiler`    | 석양과 별빛이 나뉜 숲 경계     | 초승달 대검, 사냥 망토           | 보라·주황·짙은 청록     | 칼날 뒤 균열을 열며 방어 자세        |    - |
| `allied-golden-champion`    | 폭풍 뒤 황금숲 전장            | 양손 글레이브, 의식 판금         | 금색·짙은 갈색·진홍     | 넓게 버티며 글레이브를 대각선으로 듦 |    - |

### 5.2 적군 아트 방향과 보상

| 카드 ID                     | 장면                            | 장비                            | 색상                | 자세                             | 가중치 |
| --------------------------- | ------------------------------- | ------------------------------- | ------------------- | -------------------------------- | -----: |
| `enemy-leader-velsara`      | 개기월식 아래 흑요석 왕좌       | 검은가시 왕관 지팡이, 전투 망토 | 흑보라·은색·진홍    | 측면에서 적을 향해 지팡이를 겨눔 |     10 |
| `enemy-nightroot-scout`     | 보라 균류가 빛나는 뿌리 동굴    | 갈고리 창, 흑유리 나침반        | 남색·숯색·보라      | 낮게 웅크려 숨은 길을 표시       |    100 |
| `enemy-gloam-whisperer`     | 검은 꽃잎의 황혼 회랑           | 까마귀 깃 부채, 의식 단검       | 보라·검정·장미색    | 부채에서 속삭임을 흘려보냄       |    100 |
| `enemy-obsidian-guard`      | 연마된 흑석 협문                | 흑요석 방패, 초승달 검          | 검정·강철색·보라    | 방패를 높이고 검을 숨김          |    100 |
| `enemy-crimson-duelist`     | 붉은 등불의 젖은 안뜰           | 쌍 세이버, 암색 가죽갑옷        | 진홍·검정·은색      | 교차 보법으로 쌍검 공격          |    100 |
| `enemy-hex-weaver`          | 검은 가시가 덮은 폐허 신전      | 가시실 물레, 곡선 단검          | 흑녹·보라·구리      | 양손 사이 가시 마법실을 당김     |    100 |
| `enemy-shadow-cartographer` | 검은 비단막사의 전쟁 탁자       | 그림자 지도, 은제 컴퍼스        | 남색·검정·은색      | 떠 있는 지도에 경로를 고정       |    100 |
| `enemy-raven-oracle`        | 까마귀가 모인 죽은 은빛 나무    | 까마귀뼈 초점구, 초승달 지팡이  | 청흑·은색·자수정    | 팔에 앉은 까마귀와 환영을 공유   |     45 |
| `enemy-moonfang-raider`     | 안개 낀 달빛 협곡               | 월아창, 암색 비늘 코트          | 은색·남색·검정      | 언덕 위로 월아창을 휘두르며 돌진 |    100 |
| `enemy-frostveil-sentinel`  | 겨울달 아래 얼어붙은 가시벽     | 서리 탑방패, 직선 창            | 서리색·숯색·은백    | 방패 뒤에서 전방으로 서리를 보냄 |     45 |
| `enemy-gravebloom-revenant` | 검은 꽃이 핀 고대 묘원          | 무덤나무 지팡이, 꽃잎 갑옷      | 버건디·흑녹·백골색  | 뿌리에 감겨 한쪽 무릎에서 일어남 |     20 |
| `enemy-bloodmoon-blade`     | 붉은 달 아래 흑석 테라스        | 혈강 곡도, 분절 전투복          | 혈색·검정·은색      | 붉은 궤적의 수평 베기            |     45 |
| `enemy-nightwall-warden`    | 그림자에 감긴 요새 성벽         | 검은 등불 지팡이, 중갑 망토     | 남색·연회색·보라    | 등불을 들어 아군을 그림자로 감쌈 |    100 |
| `enemy-blackthorn-anchor`   | 검은 뿌리가 붙든 황폐한 숲      | 가시 닻망치, 암색 중갑          | 흑녹·철색·짙은 보라 | 닻망치를 내려쳐 뿌리를 퍼뜨림    |     20 |
| `enemy-void-exiler`         | 별 없는 공허로 열린 부서진 월문 | 공허 대검, 룬 집행자 망토       | 검정·자외선색·청백  | 대검 가장자리에 공허 균열을 엶   |     20 |
| `enemy-obsidian-champion`   | 폭풍 아래 부서진 흑석 둑길      | 흑요석 할버드, 암색 판금        | 검정·폭풍색·진홍    | 할버드를 낮춰 정면을 겨눔        |     45 |

## 6. 덱, 새 슬롯과 후속 Phase 연결

### 아군 starter

`createAlliedStarterDeckContent`는 호출자가 주입한 ID factory로 다음 객체를 새로 만든다.

1. 아군 리더 인스턴스 1장
2. 아군 유닛 인스턴스 29장
3. 이 30장만 참조하는 `SavedDeck`

서버 기본 ID factory는 `node:crypto.randomUUID()`다. 같은 서버에서 여러 슬롯을 생성해도 카드
인스턴스와 덱 ID가 겹치지 않는다. `createPhaseThreeGameContent`는 이 starter를 새 슬롯의
컬렉션, 덱 목록과 `selectedDeckId`에 연결한다.

### 적군 덱과 보상 입력

`ENEMY_TEST_DECK_BLUEPRINT`는 적 리더 정의와 15종 유닛 수량만 저장한다.
`BattleDeckFactory`가 전투마다 새 전투 ID와 시드 기반 순서를 만든다.
`STAGE_ONE_REWARD_ENTRIES`는 적군 16종을 모두 포함하며 `COMMON 100`, `RARE 45`, `EPIC 20`,
`LEGENDARY 10`을 적용한다.

Stage 01 `StageDefinition`, 실행 ID, 보상 추첨과 멱등 지급은 Phase 8 범위이므로 이번 Phase에서
서버 실행 API를 추가하지 않았다.

## 7. 사용자 결정사항

게이트 B·C의 위임 범위 안에서 다음 세부값을 확정했다.

1. 아군은 태양숲·세계수 원정대, 적군은 월식·검은가시 군단의 시각 정체성을 사용한다.
2. 양쪽 리더는 dominance 2, attack 0으로 시작해 공개 Skill의 기대 이득만큼 기본 합을
   리더 상한 4보다 낮췄다.
3. Cost 7 무Skill 대전사를 각 진영의 1장 사용 정의로 선택했다.
4. `EXILED`는 Cost 6 방해 유닛의 `ATTACK` Active가 `ACTION_TARGET`에 적용하는 방식으로만
   사용한다. 사거리와 무관한 리더 즉시 제거를 만들지 않는다.
5. 아군 카드는 Stage 01 보상 후보가 아니므로 가중치를 `null`로, 적군 16종은 승인된 레어리티
   가중치로 기록했다.
6. 카드별 장면·장비·색상·자세는 Phase 4 이미지 생성의 입력으로 확정했다.

현재 Phase 3 완료를 위해 추가로 필요한 사용자 결정은 없다. 다만 Phase 4 이미지 생성 전에는
게이트 C의 비노출·비성적 조건과 별도 변경된 `Cut-Open Style` 성공 기준 중 어느 쪽을 적용할지
결정해야 한다.

## 8. 고려해야 할 점

### 전투 데이터 기반 재평가

`expectedSkillValue`는 `GAME_DESIGN.md` 19.2의 최초 환산값이다. 선언 데이터는 모두 목표 총점의
±1 안에 있지만, 자동 대전과 실제 승률은 Phase 5에서 측정해야 한다. 카드 수, 비용·역할·Skill
구성 또는 레어리티 분포를 바꿔야 할 정도의 조정은 게이트 B 재승인 대상이다.

### 기존 Phase 2 개발 슬롯

Phase 3 이전에 DB에 생성된 빈 슬롯은 Schema상 계속 유효하므로 자동으로 starter 카드를 받지
않는다. 현재 개발 데이터는 해당 슬롯을 삭제하고 다시 만들면 새 starter를 받는다. 실제 사용자
데이터를 보존한 채 자동 주입해야 한다면 별도 세이브 migration 정책을 결정해야 한다.

### Phase 4 자산

32개 `artAssetKey`는 안정적인 참조만 선언했다. 실제 1024×1536 원본, 768×1152 WebP, 네
레어리티 프레임, 파일 디코딩·투명도·시각 QA와 `assetManifest` 등록은 아직 실행하지 않았다.
또한 현재 계획 문서의 의상 조건 충돌은 게이트 C의 프롬프트·스타일 변경 재승인 조건에
해당할 수 있으므로 이를 해결하기 전에는 이미지 생성을 시작하지 않는다.

### Phase 5·8 런타임

이번 구현은 선언 카드와 덱 생성까지다. Skill 해결, Trigger 대기열, 전투 AI와 실제 첫 행동은
Phase 5, Stage 실행과 보상 지급은 Phase 8에서 구현한다. 따라서 현재 테스트는 승인된 저비용
구성 14장과 `BattleDeckFactory` 생성 가능성을 증명하며 실제 Action 시뮬레이션을 앞당겨
구현하지 않는다.

## 9. 검증 결과

| 검증                                                 | 결과                                                   |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Phase 3 targeted 테스트                              | `PASS` — 4 files, 21 tests                             |
| 카드 풀 전용 validator                               | `PASS` — 분포·ID·예산·상태·아트 입력                   |
| 32종 `CardDefinition`과 `CardPresentation` Schema    | `PASS`                                                 |
| 아군 `SavedDeck`·적군 `EnemyDeckBlueprint` 의미 검증 | `PASS`                                                 |
| 양쪽 `BattleDeckFactory` 생성                        | `PASS` — 각 30장, draw pile 29장                       |
| 새 슬롯 Schema·의미 검증과 서로 다른 슬롯 ID         | `PASS`                                                 |
| 중간 품질 검사 회귀                                  | `FIXED` — `SaveSlotId` 타입 import와 결과 표 포맷 복구 |
| `npm run typecheck`                                  | `PASS`                                                 |
| 변경 범위 ESLint                                     | `PASS`                                                 |
| `npm run lint`                                       | `PASS`                                                 |
| `npm run format:check`                               | `PASS`                                                 |
| `npm test`                                           | `PASS` — 17 files, 72 tests                            |
| `npm run build`                                      | `PASS` — Vite production build                         |
| `git diff --check`                                   | `PASS`                                                 |

데이터·서버 초기 상태 변경이며 Phaser/rexUI 화면이나 자산 파일을 변경하지 않았으므로 브라우저
가로·세로 시각 검증 대상은 아니다.
