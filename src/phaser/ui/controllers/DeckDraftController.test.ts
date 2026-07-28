import { describe, expect, it } from 'vitest';

import type { CardDefinition } from '../../../game/cards/card.js';
import { createPhaseOneFixtures } from '../../../game/data/testFixtures.js';
import { DeckDraftController } from './DeckDraftController.js';

describe('DeckDraftController', () => {
  it('allows an incomplete deck draft and reports it as not playable', () => {
    const fixture = createPhaseOneFixtures();
    const controller = new DeckDraftController(
      fixture.deck,
      fixture.collection,
      fixture.cardCatalog.cardDefinitions,
    );

    for (const instanceId of fixture.deck.unitInstanceIds.slice(0, 5)) {
      controller.removeUnit(instanceId);
    }
    controller.clearLeader();

    expect(controller.value.unitInstanceIds).toHaveLength(24);
    expect(controller.value.leaderInstanceId).toBeNull();
    expect(controller.getStorageIssues()).toEqual([]);
    expect(controller.getPlayableIssues()).not.toEqual([]);
  });

  it('rejects the thirty-first total card immediately', () => {
    const fixture = createPhaseOneFixtures();
    const extraDefinition = fixture.unitDefinitions[0];

    if (extraDefinition === undefined) {
      throw new Error('테스트 유닛 정의가 필요합니다.');
    }

    const extraInstance = {
      id: 'extra-unit-instance',
      cardDefinitionId: extraDefinition.id,
    };
    const controller = new DeckDraftController(
      fixture.deck,
      {
        cardInstances: [...fixture.collection.cardInstances, extraInstance],
      },
      fixture.cardCatalog.cardDefinitions,
    );

    expect(controller.addUnit(extraInstance.id)).toMatchObject({
      changed: false,
      code: 'DECK_TOO_LARGE',
    });
    expect(controller.value.unitInstanceIds).toHaveLength(29);
  });

  it('replaces the leader without removing the former leader from the collection', () => {
    const fixture = createPhaseOneFixtures();
    const alternateLeader: CardDefinition = {
      ...fixture.leaderDefinition,
      id: 'alternate-leader',
      name: '대체 리더',
    };
    const alternateInstance = {
      id: 'owned-alternate-leader',
      cardDefinitionId: alternateLeader.id,
    };
    const collection = {
      cardInstances: [...fixture.collection.cardInstances, alternateInstance],
    };
    const controller = new DeckDraftController(fixture.deck, collection, [
      ...fixture.cardCatalog.cardDefinitions,
      alternateLeader,
    ]);

    expect(controller.setLeader(alternateInstance.id)).toMatchObject({
      changed: true,
      code: 'UPDATED',
    });
    expect(controller.value.leaderInstanceId).toBe(alternateInstance.id);
    expect(collection.cardInstances).toContainEqual({
      id: fixture.deck.leaderInstanceId,
      cardDefinitionId: fixture.leaderDefinition.id,
    });
  });

  it('rejects duplicate instances and a third copy of one unit definition', () => {
    const fixture = createPhaseOneFixtures();
    const firstId = fixture.deck.unitInstanceIds[0];
    const firstInstance = fixture.collection.cardInstances.find(
      (instance) => instance.id === firstId,
    );

    if (firstId === undefined || firstInstance === undefined) {
      throw new Error('테스트 유닛 인스턴스가 필요합니다.');
    }

    const thirdCopy = {
      id: 'owned-third-copy',
      cardDefinitionId: firstInstance.cardDefinitionId,
    };
    const removableIds = fixture.deck.unitInstanceIds.filter((instanceId) => {
      const instance = fixture.collection.cardInstances.find(
        (candidate) => candidate.id === instanceId,
      );
      return instance?.cardDefinitionId !== firstInstance.cardDefinitionId;
    });
    const removedIds = new Set(removableIds.slice(0, 2));
    const withCapacity = {
      ...fixture.deck,
      unitInstanceIds: fixture.deck.unitInstanceIds.filter(
        (instanceId) => !removedIds.has(instanceId),
      ),
    };
    const controller = new DeckDraftController(
      withCapacity,
      {
        cardInstances: [...fixture.collection.cardInstances, thirdCopy],
      },
      fixture.cardCatalog.cardDefinitions,
    );

    expect(controller.addUnit(firstId).code).toBe('CARD_ALREADY_IN_DECK');
    expect(controller.addUnit(thirdCopy.id).code).toBe('COPY_LIMIT_REACHED');
  });
});
