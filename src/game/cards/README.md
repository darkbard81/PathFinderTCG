# Card definitions

`card.d.ts`는 카드 데이터가 공유하는 선언 전용 스키마입니다. Phaser, Scene, UI, 저장 객체를
참조하지 않으며, 실제 카드 데이터와 simulation 규칙이 함께 사용할 수 있다.

## 경계

```text
플레이어 Action
  -> ActiveSkill
  -> Effect
  -> 게임 사건
  -> Trigger와 일치하는 ReactiveSkill
  -> Effect
```

- `Action`: 플레이어가 선택하는 행동이다. `ActiveSkill.action`으로 그 Skill이 실행될
  행동을 정한다.
- `Trigger`: ReactiveSkill이 반응할 게임 사건의 조건이다. Action 선택 자체를 Trigger로
  사용하지 않는다.
- `ActiveSkill`, `ReactiveSkill`, `PassiveSkill`: 카드가 가진 실행 규칙이다. 카드에는
  각 종류를 하나씩 선택적으로 선언할 수 있다.
- `Effect`: 실제 상태 변경 결과다. 모든 Effect는 필요한 대상과 수치를 자신의 variant에
  직접 가진다.

`ActiveSkill`은 `action`으로 플레이어 선택과 연결된다. `ReactiveSkill`은 `trigger`를
가진다. `PassiveSkill`은 사건을 기다리지 않고 카드가 유효한 동안 계속 적용된다.

## Effect 대상

- `SELF`, `OWNER`, `OPPONENT`, `ACTION_TARGET`은 Skill 출처와 연결 Action을 기준으로 해석한다.
- `TRIGGER_SOURCE`는 사건을 일으킨 원인, `TRIGGER_SUBJECT`는 사건이 발생한 주체를 가리킨다.
- `TRIGGER_SUBJECT`는 서로 다른 사건 주체가 하나일 때만 해석한다. 복합 사건에 서로 다른 주체가
  둘 이상이면 그 Effect는 실패하며, 임의 대상 선택이나 일괄 적용으로 확장하지 않는다.
- `PLACE` Effect는 대상 참조가 이미 식별한 Drop의 유닛만 사용한다. Hand/Drop 검색이나 선택은
  simulation에 암묵적으로 추가하지 않는다.

## 예시

```ts
import type { CardDefinition } from './card.js';

export const flameKnight: CardDefinition = {
  id: 'flame-knight',
  name: '화염 기사',
  cost: 3,
  dominance: 2,
  hp: 5,
  attack: 2,
  activeSkill: {
    id: 'flame-strike',
    type: 'ACTIVE',
    action: 'ATTACK',
    effects: [
      {
        type: 'DAMAGE',
        target: 'ACTION_TARGET',
        amount: 3,
      },
    ],
  },
  reactiveSkill: {
    id: 'flame-retaliation',
    type: 'REACTIVE',
    trigger: {
      type: 'DAMAGE_RECEIVED',
      subject: 'SELF',
    },
    effects: [
      {
        type: 'DAMAGE',
        target: 'OPPONENT',
        amount: 1,
      },
    ],
  },
};
```

## 확장 규칙

- 새 플레이어 행동은 `ActionType`에 추가하고 `ActiveSkill.action`에서 사용한다.
- 새 사건은 `TriggerType`에만 추가하고, Action과 동일시하지 않는다.
- 새 결과는 `Effect` union에 필요한 필드를 가진 새 variant로 추가한다. 범용 `options`,
  `payload`, `any` 객체를 두지 않는다.
- 실행 순서, 대상 탐색, 상태 변경은 이후 `src/game/simulation/`에 구현한다. 카드 정의는
  선언 데이터만 유지한다.
