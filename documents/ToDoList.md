# ToDoList

아직 만들지 않은 것과 남은 부채다. 끝나면 여기서 지우고 [README.md](../README.md)의 해당 항목도 함께 지운다.

## 화면

- **로비 우상단 선물·공지·메뉴 버튼이 없다.**
  `documents/Lobby_UI_Target.png`에 있고 아이콘도 이미 뽑혀 있다(`src/assets/ui/icons/lobby/`).
- **재화 시작 지급량이 정해지지 않았다.** `createDefaultResourceState()`가 셋 다 0을 준다.
- **로비에 머문 채로는 재화가 갱신되지 않는다.**
  리소스 바는 로비에 들어올 때 한 번 그려지고 `setResources`가 없다.
  지금은 재화를 바꾸는 경로가 모두 로비를 떠났다 돌아오는 형태라 드러나지 않는다.
  로비 안에서 여는 상점이나 우편함 보상이 생기면 필요해진다.
- **카드 성장표(`growth.lv2~lv9`)를 어디에도 보여주지 않는다.** 카드 정보 패널에서 뺐다.

## 전투

- **방어 선택 UI가 실전에서 발동하지 않는다.**
  `guardian_block` 능력을 가진 카드가 `cards/deck_test.json`에만 있다.
  엔진과 UI는 준비돼 있고 카드 데이터 문제다.
- **행동 팝업 일부** — 피해·회복·강화만 연출한다. 배치·이동·방어에는 없다.
  `colors.popupPlace / popupMove / popupAttack / popupSkill / popupBlock` 5개가 이것 때문에 미사용이다.
- **영상 연출** — `SequenceRunner`의 `video` step은 재생기를 주입하지 않으면 건너뛴다.
  현재 주입하지 않는다.
