# ToDoList

아직 만들지 않은 것과 남은 부채다. 끝나면 여기서 지우고 [README.md](../README.md)의 해당 항목도 함께 지운다.

## 카드 정보 패널

**지금 카드 능력을 읽을 방법이 없다.** 카드 타일은 코스트·지배력·공격·체력 네 수치만 보여준다.
`abilities`, `description`, `traits`는 어느 화면에서도 표시되지 않는다.

`cards/deck_*.json` 100장 중 **89장이 능력을 갖고 있다.** 활성 스킬 13장, 나머지 76장은 패시브뿐이다.

활성 스킬은 그나마 전장에서 배지로 드러난다. **패시브 76장은 어디에도 드러나지 않는다.**
그 카드를 왜 뽑았는지, 왜 그 자리에 놓아야 하는지 알 방법이 지금 없다.

### 쓰이는 곳 — 네 화면

| 화면 | 필요한 이유 |
| --- | --- |
| 전장 | 손패에서 무엇을 낼지, 필드에서 무엇을 쓸지 판단하려면 능력을 봐야 한다 |
| 덱 구성 | 덱에 넣을 카드를 능력으로 고른다 |
| 장비 | 장비 효과를 보고 어느 유닛에 붙일지 정한다 |
| 성장 | 성장 대상의 현재 능력을 확인한다 |

**한 번 만들어 네 화면이 공유한다.** 카드 타일(`src/dom/screens/card-tile.ts`)이 이미 그렇게 쓰이고 있다.

### 표시할 것

`CardDefinition`에서 타일이 쓰지 않는 필드다.

```
name · type
traits[]        canonical trait ID 배열 (SIZE / RARITY / TYPE / ANCESTRY / ELEMENT / SPECIAL)
abilities[]     name + text (category: ACTION / GLOBAL / …)
description, note
```

특성 표시 이름과 설명은 `cards/traits/trait-catalog.json`에 있다.
`src/game/cards/trait-catalog.ts`의 `readTraitsByCategory`로 분류별로 묶어 보여준다.

### 준비돼 있는 것

`src/theme.ts`에 토큰이 이미 있다. 새로 만들지 말고 이것을 쓴다.

```
text.cardInfoTitle / cardInfoSubtitle / cardInfoLabel / cardInfoValue
surfaces.cardInfo
```

### 정해야 할 것

- **띄우는 방법** — 호버(지연 후 자동)인지 클릭인지. 전장은 드래그가 주 조작이라 호버가 드래그를 방해할 수 있다.
- **놓는 자리** — 전장은 좌우 레일이 이미 차 있다. 카드 옆에 띄울지 레일에 넣을지.
- **레이아웃 확정 이후에 만든다.** 자리를 먼저 정하지 않으면 두 번 만들게 된다.

## 그 밖

- **방어 선택 UI가 실전에서 발동하지 않는다.** `guardian_block` 능력을 가진 카드가 `cards/deck_test.json`에만 있다. 엔진과 UI는 준비돼 있고 카드 데이터 문제다.
- **행동 팝업 일부** — 피해·회복·강화만 연출한다. 배치·이동·방어에는 없다. `colors.popup*` 토큰 5개가 미사용이다.
- **영상 연출** — `SequenceRunner`의 `video` step은 재생기를 주입하지 않으면 건너뛴다. 현재 주입하지 않는다.
- **`assets.json` 생성기** — `sharp` 의존이 필요하다. 현재는 준비된 자산 트리의 결과를 그대로 쓴다.
