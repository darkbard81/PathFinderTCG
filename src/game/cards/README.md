# Card definitions

`card.d.ts`는 TypeScript 코드가 공유하는 선언 전용 계약이고, `card.schema.json`은 같은 구조의
JSON 카드 데이터를 검증하는 JSON Schema Draft 2020-12 계약이다. 둘 다 Phaser, Scene, UI,
저장 객체를 참조하지 않으며, 실제 카드 데이터와 simulation 규칙이 함께 사용할 수 있다.

## 경계

```text
플레이어 Action
  -> ActiveSkill
  -> Effect
  -> 게임 사건
  -> Trigger와 일치하는 ReactiveSkill
  -> Effect
```

- `Action`: 플레이어가 선택하는 행동이다. Active Skill은 독립 `ACTIVE` Action으로 실행한다.
  `ActiveSkill.action`은 대상 선택 범위와 Effect 문맥을 정하고 해당 기본 Action을 함께
  실행하지 않는다.
- `Trigger`: ReactiveSkill이 반응할 게임 사건의 조건이다. Action 선택 자체를 Trigger로
  사용하지 않는다.
- `ActiveSkill`, `ReactiveSkill`, `PassiveSkill`: 카드가 가진 실행 규칙이다. 카드에는
  각 종류를 하나씩 선택적으로 선언할 수 있다. 선언한 Skill은 사용자에게 표시할
  `description`을 반드시 가진다.
- `Effect`: 실제 상태 변경 결과다. 모든 Effect는 필요한 대상과 수치를 자신의 variant에
  직접 가진다.
- `CardDefinition.type`: 코어 카드의 종류를 `LEADER` 또는 `UNIT`으로 구분한다.

`ActiveSkill`은 `action`으로 대상 선택 범위와 Effect 문맥을 선언한다. `ReactiveSkill`은
`trigger`를 가진다. `PassiveSkill`은 사건을 기다리지 않고 카드가 유효한 동안 계속 적용된다.
모든 카드는 카드 자체를 설명하는 `description`을 반드시 가진다.

## JSON Schema

`card.schema.json`의 루트는 카드 한 장의 `CardDefinition`을 검증한다. 알 수 없는 필드를
허용하지 않고, 카드와 선언된 각 Skill의 `description`은 비어 있지 않은 문자열이어야 한다.
카드 `type`별 기본 수치 범위와 Action, Trigger, Effect의 enum 및 Effect별 필수 필드도
제한한다.

JSON Schema는 카드 한 장만으로 판정할 수 있는 선언 데이터의 구조를 검증한다. Passive Skill의
합법 Effect, Effect 대상의 현재 존처럼 게임 상태나 카드 간 관계가 필요한 규칙은 simulation
또는 카드 풀 검증 단계에서 별도로 확인한다.

## Effect 대상

- `SELF`, `OWNER`, `OPPONENT`, `ACTION_TARGET`은 Skill 출처와 현재 ACTIVE 또는 Trigger 문맥을
  기준으로 해석한다.
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
  description: '불꽃을 두른 검으로 적을 압박하고, 피해를 준 상대 카드에게 반격한다.',
  type: 'UNIT',
  cost: 3,
  dominance: 2,
  hp: 5,
  attack: 2,
  activeSkill: {
    id: 'flame-strike',
    description: 'Active 사용 시 공격 범위 안의 대상에게 피해 3을 준다.',
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
    description: '이 카드가 피해를 받으면 그 피해를 준 카드에게 피해 1을 준다.',
    type: 'REACTIVE',
    trigger: {
      type: 'DAMAGE_RECEIVED',
      subject: 'SELF',
    },
    effects: [
      {
        type: 'DAMAGE',
        target: 'TRIGGER_SOURCE',
        amount: 1,
      },
    ],
  },
};
```

## 확장 규칙

- 새 Active 대상 문맥은 `ActionType`에 추가하고 `ActiveSkill.action`에서 사용한다.
- 새 사건은 `TriggerType`에만 추가하고, Action과 동일시하지 않는다.
- 새 결과는 `Effect` union에 필요한 필드를 가진 새 variant로 추가한다. 범용 `options`,
  `payload`, `any` 객체를 두지 않는다.
- 카드 선언 구조를 바꿀 때는 `card.d.ts`와 `card.schema.json`을 함께 수정하고
  `card.schema.test.ts`로 유효/무효 예시를 검증한다.
- 실행 순서, 대상 탐색, 상태 변경은 이후 `src/game/simulation/`에 구현한다. 카드 정의는
  선언 데이터만 유지한다.
