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
- **저장 슬롯 이름을 직접 지을 수 없다.**
  `createInitialSaveState`가 `Slot 1`처럼 자동으로 짓고, `save-slot-view.ts:165`는 그것을 읽어 보여만 준다.
  최초 생성 때 입력받고 나중에 고칠 수 있어야 한다. 저장 구조에는 이미 `saveName`이 있으므로
  스키마는 그대로고 화면과 검증만 필요하다. 서버 쪽 `saveName must be a non-empty string`
  규칙이 이미 있어서 빈 이름은 막히지만, 길이 상한과 화면에서 잘리는 처리는 정해야 한다.
- **로비 화면을 꾸밀 수 없다.**
  배경은 저장 구조에 `ownedBackgroundIds`와 `selectedBackgroundId`가 이미 있는데 **고르는 화면이 없다.**
  `LobbyScene`이 읽어서 그리기만 한다. standing은 위치와 크기가 `lobby.css`에 박혀 있어
  (`left: 56%`, `height: 100%`) 리더나 취향에 따라 옮기거나 키울 수 없다.
  옮길 값을 저장하려면 `LobbyState`에 필드가 늘어나므로 schemaVersion이 올라간다.
- **설정 다이얼로그에 뒤로·로그아웃뿐이다.**
  볼륨 같은 것을 넣으려면 **소리부터 있어야 한다.** 지금 프로젝트에 오디오가 전혀 없다
  (`Audio`, `volume` 어느 것도 쓰이지 않는다). 소리를 넣는 일이 선행 과제다.
  화면 관련 설정(standing 표시 토글 등)은 지금도 로비 본판에 흩어져 있어 이쪽으로 모을 수 있다.

## 전투

- **방어 선택 UI가 실전에서 발동하지 않는다.**
  `guardian_block` 능력을 가진 카드가 `cards/deck_test.json`에만 있다.
  엔진과 UI는 준비돼 있고 카드 데이터 문제다.
- **행동 팝업 일부** — 피해·회복·강화만 연출한다. 배치·이동·방어에는 없다.
  `colors.popupPlace / popupMove / popupAttack / popupSkill / popupBlock` 5개가 이것 때문에 미사용이다.
- **영상 연출** — `SequenceRunner`의 `video` step은 재생기를 주입하지 않으면 건너뛴다.
  현재 주입하지 않는다.
- **연출 배속을 조절할 수 없다.**
  `SequenceRunner`가 `ticker.deltaMS`를 그대로 더하고 step의 `durationMs`도 고정이라
  항상 같은 속도로 흐른다. 배속을 주려면 시간에 배율을 곱하는 자리를 만들고,
  전장 HUD에 그 값을 바꾸는 조작을 붙여야 한다. 배율은 저장 데이터가 아니라
  화면 임시 상태로 둘지, 판을 넘어 기억할지 정해야 한다.
