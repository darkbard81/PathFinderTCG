# Phase 6 구현 결과 — 전투 Effect, Animation, Sound, Tween 동기화

**상태:** `COMPLETE — 2026-07-28`

## 1. 구현 요약

Phase 5의 `ActionResolution`을 규칙 재계산 없이 순서대로 표시하는 전투 프레젠테이션 계층을
구현했다. 의미 기반 `BattleEvent`는 Phaser adapter에서 `ANIMATION`, `TWEEN`, `SOUND`,
`VISUAL_FX` cue로 변환되고, `BattlePresentationController`가 step barrier, 사용자·AI 잠금,
속도 캡처, Action 전체 Skip, cue·Action timeout과 cleanup을 소유한다.

각 `ResolutionStep`은 다음 순서로 표시된다.

```text
제거 예정 실제 GameObject 보존
  -> 같은 Effect의 cue batch 재생
  -> 모든 blocking cue 완료 또는 timeout
  -> step.afterState 화면 반영
  -> 보존 view·임시 FX 정리
```

규칙상 동시인 같은 step의 복수 `DAMAGE`와 `DESTROY` 대상만 하나의 병렬 batch로 시작한다.
그 외 Effect와 Trigger step은 `ActionResolution.steps`와 event 순서를 그대로 유지한다. Sound는
cue 시점에 시작하지만 barrier에 포함하지 않는다.

## 2. 변경 파일

| 영역                    | 파일                                                                                                                                                                                                                                                                                                                                                                                                     | 결과                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| SFX 공개 계약           | [`battleSfxAssets.ts`](../../src/game/assets/battleSfxAssets.ts)                                                                                                                                                                                                                                                                                                                                         | `sfx.battle.*` 12종 키와 OGG/MP3 fallback 경로              |
| 자산 매니페스트·로더    | [`manifest.ts`](../../src/game/assets/manifest.ts), [`BootScene.ts`](../../src/phaser/scenes/BootScene.ts)                                                                                                                                                                                                                                                                                               | audio 다중 source 계약과 안정 키 preload                    |
| 전투 cue adapter        | [`battlePresentationCueAdapter.ts`](../../src/phaser/adapters/battlePresentationCueAdapter.ts)                                                                                                                                                                                                                                                                                                           | Event→cue, 승인 시간·easing·timeout, 병렬 그룹              |
| Scene 통합 경계         | [`createBattlePresentationRuntime.ts`](../../src/phaser/adapters/createBattlePresentationRuntime.ts)                                                                                                                                                                                                                                                                                                     | controller·driver·SFX 설정·audio unlock과 shutdown 결합     |
| 프레젠테이션 controller | [`BattlePresentationController.ts`](../../src/phaser/ui/controllers/BattlePresentationController.ts)                                                                                                                                                                                                                                                                                                     | barrier, 잠금, 속도, Skip, timeout, 진단, snapshot 연속성   |
| 오디오 controller·설정  | [`BattleAudioUnlockController.ts`](../../src/phaser/ui/controllers/BattleAudioUnlockController.ts), [`BattleSfxSettingsStore.ts`](../../src/phaser/ui/controllers/BattleSfxSettingsStore.ts)                                                                                                                                                                                                             | 첫 제스처 unlock, 로컬 음량·음소거                          |
| Phaser cue player       | [`PhaserBattlePresentationDriver.ts`](../../src/phaser/view/battle/PhaserBattlePresentationDriver.ts)                                                                                                                                                                                                                                                                                                    | 실제 GameObject, Animation, Tween, Sound, FX와 effect layer |
| FX theme token          | [`pf2eElfTheme.ts`](../../src/phaser/ui/theme/pf2eElfTheme.ts)                                                                                                                                                                                                                                                                                                                                           | 접근·shake·pulse·popup·impact 시각값                        |
| 자체 제작 SFX           | [`public/assets/audio/battle/`](../assets/audio/battle/), [`LICENSE.md`](../assets/audio/battle/LICENSE.md)                                                                                                                                                                                                                                                                                              | 12종 × OGG/MP3, 제작 방식·출처·라이선스 기록                |
| 테스트                  | [`battleSfxAssets.test.ts`](../../src/game/assets/battleSfxAssets.test.ts), [`battlePresentationCueAdapter.test.ts`](../../src/phaser/adapters/battlePresentationCueAdapter.test.ts), [`BattlePresentationController.test.ts`](../../src/phaser/ui/controllers/BattlePresentationController.test.ts), [`BattleSfxSettingsStore.test.ts`](../../src/phaser/ui/controllers/BattleSfxSettingsStore.test.ts) | cue·순서·병렬·잠금·속도·Skip·실패·shutdown·설정 회귀 테스트 |
| 계획 기록               | [`Plan.md`](./Plan.md), [`Phase_6.md`](./Phase_6.md)                                                                                                                                                                                                                                                                                                                                                     | Phase 6 완료 상태, 결정과 후속 고려사항                     |

## 3. cue 계약과 기본 연출

게이트 F의 승인값을 바꾸지 않고 다음 계약으로 고정했다.

| 규칙 결과                  | blocking cue                             | 비차단 SFX      | 1x 시간 |
| -------------------------- | ---------------------------------------- | --------------- | ------: |
| ATTACK 선언                | 공격자 접근                              | `attack`        |   160ms |
| ATTACK 전투 직전           | 대상 impact FX                           | `impact`        |   120ms |
| ATTACK 전투 뒤 생존 공격자 | 원래 또는 반응 후 실제 Field 위치로 복귀 | 없음            |   160ms |
| `DAMAGE`                   | hit Animation, shake, 피해 popup         | `damage`        |   180ms |
| `DESTROY`                  | death Animation과 fade                   | `destroy`       |   360ms |
| `HEAL`                     | pulse와 회복 popup                       | `heal`          |   300ms |
| `DRAW`                     | 카드별 Deck→Hand 진입 Tween              | `draw`          |   220ms |
| `MOVE`                     | 현재 view→`afterState` 위치 Tween        | `move`          |   260ms |
| `PLACE`                    | 등장 Animation과 진입 Tween              | `place`         |   300ms |
| `DISCARD`                  | 카드별 fade·scale Tween                  | `discard`       |   220ms |
| `STAT_MODIFIED`            | 수치 view pulse                          | `stat`          |   200ms |
| `STATUS_ADDED`             | 상태 추가 Animation, pulse, 강조 FX      | `status.add`    |   240ms |
| `STATUS_REMOVED`           | 상태 제거 Animation, pulse, 강조 FX      | `status.remove` |   240ms |

이동·접근은 `Cubic.Out`, 복귀는 `Cubic.InOut`, scale·alpha는 `Quad.Out`, shake는
`Sine.InOut`을 사용한다. cue timeout은 1x `1500ms`, Action 전체 timeout은 1x `15000ms`이며
Action 시작 시 캡처한 `1x`, `2x`, `4x`로 나눈다.

`ATTACK_DECLARED` step에서는 접근만 시작한다. 선언 반응 step을 모두 원래 순서로 표시한 뒤 실제
`action:ATTACK:combat` step 직전에 impact를 표시하고, 동시 DAMAGE를 재생한다. 바로 다음
`state:destroy`가 있으면 death batch가 끝난 뒤 생존 공격자만 복귀한다. 반응으로 공격자가
이동했으면 `afterState`의 새 Field 위치를 복귀점으로 갱신한다.

## 4. 상태 barrier와 입력 잠금

`presentAction()`은 시작 전에 snapshot 연속성을 확인한다.

1. 첫 `step.beforeState`와 `ActionResolution.beforeState`
2. 앞 step의 `afterState`와 다음 step의 `beforeState`
3. 마지막 `step.afterState`와 `ActionResolution.finalState`

연속성이 깨진 결과는 잠금이나 cue 재생 전에 거부한다. 정상 결과는 사용자 입력과 AI 다음
행동을 함께 잠그고 마지막 step이 반영된 뒤 한 번만 해제한다. 재생 중 두 번째
`presentAction()`은 `BattlePresentationBusyError`로 거부한다.

controller가 보존하는 권위 화면 상태는 마지막으로 반영한 `BattleState` 하나뿐이다. simulation
state를 변경하거나 Phaser 완료를 simulation에 전달하지 않는다.

## 5. 사망 view와 임시 객체 수명주기

`PhaserBattlePresentationViewCallbacks`는 Phase 7 전투 renderer에 다음 경계를 요구한다.

- `getCardView`: 인스턴스 ID로 실제 카드 GameObject 반환
- `detachCardView`: renderer registry에서 참조만 제거하고 GameObject는 파괴하지 않음
- `renderState`: 전달받은 snapshot을 keyed view로 반영
- 선택적 `getCardPosition`: MOVE·DRAW·PLACE 목적지 좌표 제공
- 선택적 `createTransientCardView`: 아직 화면 view가 없는 Deck/Hand 카드 연출용 객체 생성

Field를 떠나는 ID는 `beforeState`와 `afterState`에서 계산한다. controller가
`detachCardView` 후 실제 Container/Image/Sprite를 별도 effect layer로 옮기므로 renderer의
전체 갱신이 death 대상을 먼저 파괴하지 못한다. 동시 파괴 view를 모두 먼저 보존하고 같은
batch로 death·fade를 시작한 뒤, 모든 blocking cue가 끝났을 때 `afterState`를 한 번 반영하고
각 view를 정확히 한 번 제거한다.

공격자 view도 선언부터 전투·반응·복귀까지 같은 객체를 effect layer에 고정한다. 중간 snapshot
렌더가 같은 카드의 중복 view를 만들면 임시 중복만 제거하고, 복귀가 끝난 snapshot에서 정상
renderer view로 다시 인계한다.

## 6. 속도, Skip, timeout과 실패 복구

- 속도 변경은 다음 Action부터 적용하며 진행 중인 Action의 cue context는 바뀌지 않는다.
- Animation과 Tween의 시간만 캡처 속도로 나누고 Sound rate는 항상 `1`이다.
- Skip은 진행 중인 Tween·Animation과 임시 Sound를 즉시 제거하고 현재 step부터 남은 모든
  `afterState`를 순서대로 정확히 한 번 반영한다.
- cue 하나가 reject, throw 또는 timeout이어도 진단을 기록하고 해당 cue만 완료 처리한다.
- Action timeout은 남은 Action 전체를 Skip 처리해 교착을 막는다.
- 누락 Sound/Animation/view는 `MISSING_ASSET`, 잠긴 AudioContext는 `AUDIO_BLOCKED`로
  기록하고 조용히 계속한다.
- Scene shutdown은 화면이 사라지는 중이므로 남은 snapshot을 렌더링하지 않고 결과를
  `CANCELLED`로 끝낸다. simulation은 이미 최종 권위 상태를 가지며 다음 Scene 진입에서 그
  상태를 새로 렌더링한다.

Skip 취소는 Phaser Tween의 다음 frame 제거를 기다리지 않고 `remove()`와 `destroy()`를
호출한다. runtime `destroy()`는 Scene shutdown listener, 첫 제스처 listener, Animation
listener, timer, Tween, Sound, 보존 view, 임시 popup·impact와 effect layer를 모두 정리한다.

## 7. 전투 SFX와 로컬 설정

12종 SFX는 외부 샘플을 사용하지 않고 FFmpeg 7.1.1의 `sine` source로 직접 합성했다. 각 자산은
44.1kHz mono OGG/Vorbis와 MP3 두 형식을 제공하며 Boot loader가 같은 안정 키의 fallback
목록으로 등록한다. 자세한 제작 기록은
[`public/assets/audio/battle/LICENSE.md`](../assets/audio/battle/LICENSE.md)에 있다.

`BattleSfxSettingsStore`의 기본값은 음량 `0.8`, 음소거 `false`다. 값은
`pathfinder-tcg:battle-sfx:v1` localStorage에 저장하고 `BattleState`나 세이브 슬롯 규칙
상태에는 넣지 않는다. storage가 없거나 JSON이 잘못됐거나 쓰기가 거부되어도 메모리 기본값으로
계속한다.

`BattleAudioUnlockController`는 Scene의 첫 pointer 또는 keyboard 입력에서 WebAudio context
resume과 Phaser unlock을 시도한다. 브라우저가 거부해도 전투는 계속되고 runtime 진단 목록에
상태가 남는다.

## 8. 구현자 결정사항

승인된 시간·순서·오디오 범위를 바꾸지 않는 범위에서 다음을 정했다.

1. 서로 결합된 한 규칙 결과의 Animation·Tween·FX와 비차단 Sound는 같은 batch에서 시작한다.
   복수 규칙 대상을 한 batch에 넣는 것은 같은 step의 `DAMAGE`와 `DESTROY`뿐이다.
2. 복수 DRAW와 DISCARD 카드는 event의 카드 ID 배열 순서대로 별도 batch로 표시한다.
3. `STATUS_ADDED(EXILED)`가 승인된 240ms 상태 연출을 담당하고 바로 뒤 `state:exile`에는 새
   미승인 시간을 만들지 않는다. Exile 이동 snapshot은 보존 view를 안전하게 제거한 뒤 반영한다.
4. 카드 Animation은 안정적인 `animation.battle.card.*` 키를 사용한다. 해당 Sprite Animation이
   아직 등록되지 않았으면 같은 cue batch의 Tween·FX fallback은 유지하고 누락만 기록한다.
5. Scene shutdown은 Skip과 구분한다. Skip은 같은 Scene에서 최종 상태를 표시하지만 shutdown은
   view를 모두 취소하고 다음 Scene의 권위 상태 재렌더에 맡긴다.
6. 프레젠테이션 진단은 simulation event가 아니며 `BattleState` 직렬화 계약에 넣지 않는다.

## 9. 사용자 결정사항

이번 Phase에서 새 사용자 승인이 필요한 값은 없다. 다음 기존 결정을 그대로 적용했다.

- 게이트 F의 12개 연출 시간, easing, 병렬 범위, cue·Action timeout
- `1x`, `2x`, `4x`와 현재 Action 전체 Skip
- SFX 기본 음량 `0.8`, 초기 음소거 `false`, `sfx.battle.*` 12종
- OGG/MP3 fallback, 자체 제작 또는 CC0 출처만 허용, BGM·음성 제외
- 원자적 Effect 연출 뒤 해당 `afterState`를 반영하는 화면 계약

cue 순서, 시간, easing, 오디오 범위 또는 출처 정책을 변경하지 않았다.

## 10. 고려해야 할 점

### Phase 7 카드 renderer와 Animation 등록

이번 Phase는 전투 화면 자체를 만들지 않는다. Phase 7의 전투 renderer는
`PhaserBattlePresentationViewCallbacks`를 구현하고 `detachCardView`에서 실제 GameObject를
파괴하지 않아야 한다. 카드 spritesheet/atlas를 선택하면 hit, death, place와 상태 Animation을
`BATTLE_CARD_ANIMATION_KEYS`에 등록한다. 등록 전에도 Tween·FX fallback과 최종 상태는
정상이며 `MISSING_ASSET` 진단이 남는다.

### 전체 snapshot 비용

Phase 5에서 남긴 측정 항목을 seed `1` AI 전투로 확인했다.

| 항목                                      | 측정값                    |
| ----------------------------------------- | ------------------------- |
| 전체 Action 수                            | 32                        |
| 평균 `ActionResolution` JSON 크기         | 408,350 bytes             |
| 최대 `ActionResolution`                   | 590,663 bytes             |
| 최대 결과                                 | ATTACK, 10 steps, 25 cues |
| 해당 최종 `BattleState` JSON 크기         | 26,618 bytes              |
| 32개 결과를 모두 보존할 때의 단순 JSON 합 | 13,067,188 bytes          |

controller와 cue plan은 snapshot을 복제하지 않고 현재 Action의 기존 객체를 참조하며, 완료 후에는
마지막 `BattleState` 하나만 남긴다. 따라서 현재 한 Action barrier에는 문제가 없었다. Phase 7/8
로그가 모든 `ActionResolution`을 누적 보존하면 약 13MB 이상의 비용이 생길 수 있으므로, 전투
로그는 Action·Event 요약을 저장하고 전체 snapshot은 디버그 opt-in으로 제한해야 한다.
patch/delta 계약 변경은 재현성과 오류 복구 검증을 먼저 마련한 뒤 별도로 판단한다.

### SFX 음색과 화면 반응형 검증

현재 SFX는 출처와 fallback 계약을 검증하기 위한 짧은 합성 톤이다. 안정 키·시간·출처 정책을
유지하는 범위에서 후속 자체 제작 음색으로 교체할 수 있다.

Phase 6에는 사용자용 전투 화면이나 HUD를 추가하지 않았으므로 가로·세로 layout 검증 대상은
Phase 7이다. 이번 브라우저 스모크는 960×720 임시 전장 하네스에서 실제 card Sprite, Animation,
Tween, Sound와 effect layer 수명주기를 확인했으며 하네스는 제품 코드에 남기지 않았다.

## 11. 검증 결과

| 검증                                                | 결과                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Phase 6 targeted 테스트                             | `PASS` — 5 files, 27 tests                                             |
| 승인 시간·easing·timeout·SFX 키                     | `PASS`                                                                 |
| 10 Effect 결과 cue 매핑                             | `PASS`                                                                 |
| Effect·Trigger 순서와 동시 DAMAGE/DESTROY 병렬 범위 | `PASS`                                                                 |
| 차단 cue 전 상태 미반영과 사용자·AI 잠금            | `PASS`                                                                 |
| `1x`, `2x`, `4x`, Skip 최종 상태 동일               | `PASS` — unit 및 실제 Chromium                                         |
| 치명 카드 보존·동시 death·동시 제거                 | `PASS` — death 시작 차이 약 0.2ms, 상태 반영 시 두 실제 view 모두 생존 |
| 음소거·오디오 잠금·누락 Animation 복구              | `PASS` — 모두 `COMPLETED`, 최종 상태 일치                              |
| cue timeout·Action timeout·player throw 복구        | `PASS`                                                                 |
| Scene shutdown 취소와 중복 잠금 callback 방지       | `PASS` — `CANCELLED`, lock/unlock 각 1회                               |
| Skip·shutdown 뒤 Tween·Sound·임시 effect layer view | `PASS` — 각 0                                                          |
| SFX 파일 형식                                       | `PASS` — 24 files, Vorbis/MP3, 44.1kHz mono                            |
| Chromium console 오류                               | `PASS` — 0                                                             |
| `npm run typecheck`                                 | `PASS`                                                                 |
| `npm run lint`                                      | `PASS`                                                                 |
| `npm run format:check`                              | `PASS`                                                                 |
| `npm test`                                          | `PASS` — 27 files, 132 tests                                           |
| `npm run build`                                     | `PASS` — 1840 modules, bundle warning 없음                             |
| `git diff --check`                                  | `PASS`                                                                 |
