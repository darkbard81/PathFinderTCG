import type { CardDefinition } from './card.d';
import { TriggerType } from './card.d';

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
            type: TriggerType.DAMAGE_RECEIVED,
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