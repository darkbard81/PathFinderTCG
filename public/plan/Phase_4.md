# Phase 4 구현 기록 — 카드 이미지 파이프라인과 카드 UI

## 1. 상태

`COMPLETE — 2026-07-27`

카드 UI, 자산 계약, 구조화 프롬프트, Sharp 변환과 Pillow 검증 파이프라인은 구현되었다. 4개
레어리티 프레임은 built-in `$imagegen`으로 생성하고 chroma 제거·시각 QA·Sharp 변환·Pillow
검사를 마쳤다. 카드 아트 32종도 모두 1024×1536 불투명 PNG 기술 등록과 768×1152 WebP
변환을 마쳤다.

`allied-grove-renewer`는 처음 승인된 3회가 모두 결과 파일 없이 도구에서 차단됐지만,
사용자가 동일 고정 프롬프트의 4차 1회를 명시적으로 승인했다. 기존 담당 subagent가 프롬프트를
수정하지 않고 built-in `$imagegen`을 정확히 한 번 호출해 성공했으며 추가 호출은 없었다.
실제 32개 아트를 사용하는 Pillow 완전성 검사와 가로·세로 브라우저 QA까지 통과했다. 카드
아트 내용 검수는 사용자 직접 확인 항목이며 자동 등록이나 Phase 완료를 막지 않는다.

## 2. 구현 범위

### 자산 계약과 매니페스트

- Phase 3의 32개 `CardPresentation.artAssetKey`를
  `/assets/cards/art/<card-definition-id>.webp`에 일대일로 연결했다.
- `COMMON`, `RARE`, `EPIC`, `LEGENDARY` 프레임에 각각 안정적인 키와
  `/assets/ui/cards/frame-<rarity>.webp` 경로를 부여했다.
- `BootScene`이 기존 `assetManifest` 순회로 카드 아트와 프레임을 로드하도록 별도 로더 분기를
  만들지 않았다.
- 생성 원본은 `assets-source/cards/`에 두고 기본 Git ignore 대상으로 추가했다. 사용자가
  원본 커밋을 명시적으로 요청하기 전에는 런타임 WebP만 버전 관리 대상이다.

### 이미지 생성과 검증 파이프라인

| 단계               | 도구                          | 구현                                                                                           |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| 구조화 프롬프트    | `$imagegen` 입력 생성기       | 카드 32개와 프레임 4개의 별도 프롬프트를 출력하며 고정된 인물·의상 문구를 사용한다.            |
| 원본 생성          | built-in `$imagegen`          | 프레임 4종과 카드 아트 32종이 성공했다. `allied-grove-renewer`는 사용자 승인 4차에서 성공했다. |
| 프레임 chroma 제거 | imagegen 설치 helper + Pillow | rarity와 충돌하지 않는 key를 alpha로 변환한 뒤 모서리, 중앙 투명도, visible chroma를 검사한다. |
| 런타임 변환        | Sharp `0.35.3`                | 아트 32종과 프레임 4종을 768×1152 WebP로 변환했다. 아트는 quality 88, 프레임은 lossless다.     |
| 최종 검사          | 시스템 Pillow `11.3.0`        | 32개 아트 source/runtime pair와 4개 프레임의 전체 기술 검사가 통과했다.                        |

프롬프트 버전은 카드 `phase-4-card-art-v2`, 프레임 `phase-4-card-frame-v1`이다. 생성 로그에는
자산 ID, 시도 번호, 실행 시각, 도구, 프롬프트 버전, 실패 기준 또는 오류 원문, 결과 경로와
`SUCCESS`/`RETRY`/`BLOCKED` 상태를 기록한다. 전체 실행 기록은
`Phase_4_generation_log.json`에 저장했다.

도구 오류로 이미지 파일이 생성되지 않은 시도는 `resultPath: null`로 기록하고 오류 원문을
보존한다. 성공 시도는 반드시 실제 결과 경로를 가진다.

32개 카드 프롬프트 manifest의 SHA-256은
`4fd65567930c1d531080d7f25a16ef4c3c14da38aedfd30afce6c622d4108e1c`이다. 모든 subagent는 이
동일 manifest의 자기 담당 prompt 문자열을 수정 없이 사용한다.

EPIC 1차는 `#FF00FF` despill이 보라색 강조를 제거해 시각 기준 실패로 기록했다. 2차에서
`#00FF00` key를 사용해 성공했다. 네 선택 결과 모두 기본 soft matte 뒤 얇은 색 fringe가 보여
스킬 지침에 따라 같은 생성물을 `--edge-contract 1`로 다시 처리했다. 이는 추가 이미지 생성
시도가 아니며 실패·중간 alpha 결과는 ignored source 경로에 보존했다.

### 카드 UI

- `PF2eCard`는 rexUI `OverlapSizer`를 상속한다.
- 카드 아트, 별도 레어리티 프레임, 이름·Skill 텍스트와 수치 배지를 독립 레이어로 조립한다.
- `PF2eCardStatBadge`는 rexUI `BadgeLabel`을 상속하며 Cost, 지배력, 공격력, HP만 표시한다.
- 기존 Cost, Attack, Health 자산을 재사용했다. 지배력은 `dominance` 전용 theme variant가
  generic 엘프 배지 자산을 사용하며 Defense 배지를 대신 사용하지 않는다.
- `setCard`는 아트·프레임·텍스트·수치를 함께 바꾸고, `setStats`는 네 수치 배지를 모두
  갱신한다.
- 기존 커스텀 클래스 쇼케이스에 `PF2eCard` 페이지를 추가했다. `다음 레어리티`로 네 프레임을
  순회하고 `네 수치 갱신`으로 Cost·지배력·공격력·HP 변경을 확인할 수 있다.
- `OverlapSizer`의 기본 `expand: true`가 고정 크기 콘텐츠와 배지를 카드 전체로 늘리지 않도록
  해당 레이어에 `expand: false`를 명시했다.
- 내용 패널의 반투명 배경을 이름·Skill 텍스트보다 먼저 생성해 Phaser display-list에서도
  텍스트가 배경 위에 렌더링되도록 했다.

### 브라우저 UI QA

`allied-grove-renewer` 생성 전에는 UI 결함을 먼저 찾기 위해 누락 경로에 명확한 임시 대역을
사용했고 QA 직후 삭제했다. 최종 QA는 대역 없이 실제 32개 런타임 아트로 다시 실행했다.

- 1280×720 landscape와 720×1280 portrait에서 카드·스크롤바·버튼의 clipping과 overlap을
  확인했다.
- 키보드로 `PF2eCard` 페이지에 진입하고 포인터·wheel로 스크롤과 버튼 입력을 실행했다.
- `COMMON → RARE → EPIC → LEGENDARY → COMMON` 순환과 카드 정의·프레임 변경을 dataset으로
  확인했다.
- 실제 EPIC `allied-grove-renewer`에서 Cost·지배력·공격력·HP가 `3,2,0,3`에서
  `4,3,1,4`로 각각 정확히 1 증가하는 것을 확인했다.
- 실제 아트 32개와 프레임 4개의 HTTP 응답은 모두 200이었고 console error, page error,
  request failure는 모두 0이었다.
- 스크린샷은 카드 레이어와 UI 정렬만 확인했으며 이미지 내용 판정은 사용자 검수 범위로
  유지했다.

## 3. 구현자 결정사항

승인된 규격을 바꾸지 않는 범위에서 다음 값을 선택했다.

1. 런타임 카드 아트 용량 상한은 파일당 1,500,000바이트로 검사한다.
2. 투명 lossless 프레임 용량 상한은 파일당 2,000,000바이트로 검사한다.
3. 수치 배치는 Cost 좌상단, 지배력 우상단, 공격력 좌하단, HP 우하단으로 정했다.
4. 지배력은 Defense 배지를 재사용하지 않고 generic 엘프 메달리온에 별도 색상·텍스트
   theme variant를 적용한다.
5. 카드 컴포넌트는 전투 상태나 입력 callback을 소유하지 않고 직렬화 가능한 표시 모델과
   표시 갱신 API만 받는다.

## 4. 사용자 결정사항

### 승인 완료 — 의상 성공 기준과 프롬프트 고정

2026-07-27 사용자는 `1B`를 선택해 게이트 C를 `명백한 성인 엘프 여성, H-Cup 체형,
Cut-Open Style 판타지 의상`으로 재승인했다. 이어 카드 아트 프롬프트에서 별도의 안전 용어를
제거하고, 이후 해당 문구를 사용자 지시 없이 임의로 수정하지 말 것을 명시했다. 카드 프롬프트
`phase-4-card-art-v2`는 이 고정 문구를 그대로 사용한다.

### 승인 완료 — 이미지 생성 subagent 분업

2026-07-27 사용자는 `2A(4 subagents)`를 선택했다. 동시 실행 슬롯은 메인 에이전트를 포함해
4개이므로 첫 세 subagent를 병렬 실행하고, 한 슬롯이 끝나면 네 번째 subagent를 실행한다.

1. subagent A: 아군 카드 아트 1~8번 생성과 기술 규격 확인
2. subagent B: 아군 카드 아트 9~16번 생성과 기술 규격 확인
3. subagent C: 적군 카드 아트 1~8번 생성과 기술 규격 확인
4. subagent D: 적군 카드 아트 9~16번 생성과 기술 규격 확인
5. 메인 에이전트: 고정 프롬프트·기본 3회 및 승인된 단일 4차 시도 감사, Pillow/Sharp 검증,
   매니페스트·UI 통합, 브라우저 가로·세로 QA와 최종 기록

각 subagent는 서로 다른 8개 최종 경로만 소유하고 자산당 별도 built-in `$imagegen` 요청을
사용한다. 프레임 4종은 의상 결정과 무관해 메인 에이전트가 먼저 완료했다.

최초 실행 결과는 네 subagent 합계 카드 성공 31개, `RETRY` 16회, `BLOCKED` 1개였다. 이후
사용자가 `allied-grove-renewer`의 동일 프롬프트 4차 1회를 승인해 기존 담당 subagent가
성공했다. 프레임을 포함한 총 54개 시도를 `Phase_4_generation_log.json`에 합쳤고 프롬프트
버전, 도구, 순서, 기본 3회 상한과 단일 사용자 승인 예외, 결과 경로를 감사한다.

### 승인 완료 — 카드 아트 등록과 이미지 검수

2026-07-27 사용자는 이미지 내용을 직접 검수하므로 생성 도구가 정상 완료되고 1024×1536
불투명 PNG 기술 규격을 통과하면 곧바로 자산으로 등록하라고 지시했다. 따라서 카드 아트
내용을 이유로 자동 거절하거나 재시도하지 않는다. 이 지시 전에 내용 기준으로 2차 생성이 이미
끝나고 3차 호출도 완료된 `allied-gleam-lancer`와 `allied-sunroot-pathfinder`는 감사 순서를
보존해 3차 정상 생성본을 채택한다. 이후부터 모든 카드에 첫 기술 성공본을 적용한다.

### 승인 완료 — `allied-grove-renewer` 4차 1회

`allied-grove-renewer`는 built-in `$imagegen`이 3회 모두 결과 파일 없이 도구 오류를 반환했다.
`phase-4-card-art-v2` 프롬프트는 한 글자도 수정하지 않았고 승인된 3회 상한에서 멈췄다.
2026-07-27 사용자는 `allied-grove-renewer 동일 고정 프롬프트 4차 1회 승인`이라고 명시했다.
기존 담당 subagent는 같은 prompt 문자열로 built-in `$imagegen`을 한 번 호출했고
`2026-07-27T17:51:48.021+09:00`에 성공했다. 결과는 PNG 1024×1536, RGB, 불투명 기술 검사를
통과해 곧바로 등록했다. 프롬프트 변경과 5차 호출은 없었다.

## 5. 고려해야 할 점

- 현재 `BootScene`은 매니페스트 전체를 선로딩하므로 Phase 4 완료 후 카드 아트 32개도 초기
  로딩 대상이 된다. Phase 7에서 화면별 로딩 또는 지연 로딩이 필요해지면 로딩 성능을 측정한
  뒤 별도 범위로 결정해야 한다.
- built-in `$imagegen` 결과가 1024×1536 PNG 규격이나 2:3 구도를 지키지 못하면 해당 시도는
  실패로 기록한다. 다른 CLI/API로 바꾸거나 크기·스타일 조건을 약화하지 않는다.
- 자동 픽셀 검사는 이미지 내용을 판정하지 않는다. 카드 아트 내용 검수는 사용자 직접 확인
  항목이며 Phase 4 자동 등록과 완료를 막지 않는다.
- 카드 프레임은 아트와 합성해 저장하지 않는다. Phaser에서 별도 오버레이로 유지해야 향후
  레어리티 변경과 카드 수치 갱신이 자산 재생성 없이 가능하다.

## 6. 현재 검증 결과

| 검증                            | 결과                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| 카드 아트 키·경로               | `PASS` — 32개, 중복 없음                                     |
| 프레임 키·경로                  | `PASS` — 4개 variant                                         |
| 카드 표시 모델                  | `PASS` — 32개 정의, 이름·Skill·네 수치                       |
| theme variant                   | `PASS` — dominance 및 4개 frame variant                      |
| 프레임 `$imagegen`              | `PASS` — COMMON 1회, RARE 1회, EPIC 2회, LEGENDARY 1회       |
| 프레임 Sharp 변환               | `PASS` — 4개 768×1152 transparent lossless WebP              |
| 프레임 Pillow 검사              | `PASS` — 4개, 중앙 투명도 100%, visible chroma 0             |
| 프레임 시각 QA                  | `PASS` — PF2e 엘프 조각, 레어리티 색, No Text, 투명 오버레이 |
| 생성 로그 감사                  | `PASS` — 성공 36개, blocked 0, pending 0, complete audit     |
| 카드 아트 built-in `$imagegen`  | `PASS` — 32개 성공, `allied-grove-renewer` 승인 4차 성공     |
| 카드 프롬프트 고정 검사         | `PASS` — 32개, v2, SHA-256 일치                              |
| targeted 테스트                 | `PASS` — 4 files, 16 tests                                   |
| 전체 `npm test`                 | `PASS` — 19 files, 79 tests                                  |
| `npm run typecheck`             | `PASS`                                                       |
| `npm run lint`                  | `PASS`                                                       |
| `npm run format:check`          | `PASS`                                                       |
| `npm run build`                 | `PASS`                                                       |
| `git diff --check`              | `PASS`                                                       |
| Pillow 검증기 단위 테스트       | `PASS` — 5 tests                                             |
| 생성된 카드 아트 기술 검사      | `PASS` — 32개 1024×1536 RGB 불투명 PNG                       |
| 성공 카드 source/runtime pair   | `PASS` — 32개, 768×1152 WebP, 용량 상한 이내                 |
| 실제 32개 카드 아트 Pillow 검사 | `PASS` — art 32, frame 4                                     |
| 카드 아트 내용 검수             | `USER REVIEW` — 사용자가 직접 수행                           |
| 카드 UI 가로·세로 시각 QA       | `PASS` — 1280×720, 720×1280, 실제 자산 사용                  |
| 레어리티·네 수치 브라우저 입력  | `PASS` — 4 variant 순환, +1·복원, 브라우저 오류 0            |
| 실제 32개 자산 브라우저 로딩    | `PASS` — 아트 32·프레임 4 HTTP 200, 요청 실패 0              |
