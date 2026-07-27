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
    description: '공격할 때 공격 대상에게 피해 3을 추가로 준다.',
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
