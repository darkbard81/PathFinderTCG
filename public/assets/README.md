# Runtime assets

게임에서 직접 로드할 정적 자산을 두는 위치입니다.

- `characters/`: 캐릭터 및 몬스터
- `environment/`: 배경, 타일, 전장
- `ui/`: UI 이미지와 아이콘
- `fx/`: 이펙트와 파티클
- `audio/`: 음악과 효과음
- `data/`: 런타임 JSON 데이터

게임 코드는 파일 경로를 직접 공유하지 않고 `src/game/assets/manifest.ts`의 안정적인 키를
통해 자산을 참조합니다.
