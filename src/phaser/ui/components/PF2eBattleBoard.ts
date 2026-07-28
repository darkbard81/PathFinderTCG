import type * as Phaser from 'phaser';
import { GridSizer, Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { CardDefinition } from '../../../game/cards/card.js';
import { TEST_CARD_CATALOG } from '../../../game/content/index.js';
import type { BattleFieldPosition, CardPresentation, StableId } from '../../../game/data/index.js';
import {
  BATTLE_FIELD_POSITIONS,
  locateBattleCard,
  type BattlePlayerId,
  type BattleState,
} from '../../../game/simulation/battle/index.js';
import type { BattleCuePlaybackContext } from '../controllers/BattlePresentationController.js';
import type { BattlePresentationCue } from '../../adapters/battlePresentationCueAdapter.js';
import type {
  PhaserBattleCardView,
  PhaserBattlePoint,
  PhaserBattlePresentationViewCallbacks,
} from '../../view/battle/PhaserBattlePresentationDriver.js';
import { createBattleCardViewModel } from '../controllers/battleUiModels.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eBattleCard } from './PF2eBattleCard.js';
import { PF2eBattleSlot } from './PF2eBattleSlot.js';
import { PF2eNinePatch2 } from './PF2eNinePatch2.js';

export interface PF2eBattleBoardConfig {
  readonly width: number;
  readonly height: number;
  readonly cardWidth: number;
  readonly initialState: BattleState;
  readonly cardDefinitions: readonly CardDefinition[];
  readonly cardPresentations?: readonly CardPresentation[];
}

const PLAYER_FIELD_ORDER: readonly BattleFieldPosition[] = Object.freeze([
  'FRONT_LEFT',
  'FRONT_CENTER',
  'FRONT_RIGHT',
  'BACK_LEFT',
  'BACK_CENTER',
  'BACK_RIGHT',
]);

const ENEMY_FIELD_ORDER: readonly BattleFieldPosition[] = Object.freeze([
  'BACK_LEFT',
  'BACK_CENTER',
  'BACK_RIGHT',
  'FRONT_LEFT',
  'FRONT_CENTER',
  'FRONT_RIGHT',
]);

function fieldAbbreviation(position: BattleFieldPosition): string {
  const row = position.startsWith('FRONT') ? '전' : '후';
  const column = position.endsWith('LEFT') ? '좌' : position.endsWith('CENTER') ? '중' : '우';
  return `${row}·${column}`;
}

function playerSummary(state: BattleState, playerId: BattlePlayerId): string {
  const player = state.players[playerId];
  const label = playerId === 'PLAYER' ? '아군' : '적군';
  return `${label} · 손 ${player.handIds.length} · 덱 ${player.drawPileIds.length} · Drop ${player.dropIds.length} · Exile ${player.exileIds.length}`;
}

function createSummaryText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, text, {
    color: PF2E_ELF_THEME.colors.accentText,
    fontFamily: PF2E_ELF_THEME.typography.body,
    fontSize: `${PF2E_ELF_THEME.components.battleBoard.headerFontSize}px`,
    fontStyle: 'bold',
    align: 'center',
  });
}

function createFieldGrid(
  scene: Phaser.Scene,
  playerId: BattlePlayerId,
  order: readonly BattleFieldPosition[],
  cardWidth: number,
  slotByKey: Map<string, PF2eBattleSlot>,
): GridSizer {
  const theme = PF2E_ELF_THEME.components.battleBoard;
  const cardHeight = Math.round(cardWidth / PF2E_ELF_THEME.components.battleCard.aspectRatio);
  const width = cardWidth * 3 + theme.slotGap * 2;
  const height = cardHeight * 2 + theme.rowGap;
  const grid = new GridSizer(scene, {
    width,
    height,
    column: 3,
    row: 2,
    columnProportions: 0,
    rowProportions: 0,
    space: {
      column: theme.slotGap,
      row: theme.rowGap,
    },
  });
  scene.add.existing(grid);

  order.forEach((position, index) => {
    const slot = new PF2eBattleSlot(scene, {
      width: cardWidth,
      height: cardHeight,
      label: fieldAbbreviation(position),
    });
    slotByKey.set(`${playerId}:${position}`, slot);
    grid.add(slot, {
      column: index % 3,
      row: Math.floor(index / 3),
      align: 'center',
    });
  });

  return grid;
}

function hasCard(state: BattleState, cardId: StableId): boolean {
  return state.cards.some((card) => card.id === cardId);
}

export class PF2eBattleBoard extends Sizer {
  private readonly cardWidth: number;
  private readonly cardDefinitions: readonly CardDefinition[];
  private readonly cardPresentations: readonly CardPresentation[];
  private readonly slotByKey: Map<string, PF2eBattleSlot>;
  private readonly cardById = new Map<StableId, PF2eBattleCard>();
  private readonly enemySummaryText: Phaser.GameObjects.Text;
  private readonly playerSummaryText: Phaser.GameObjects.Text;
  private readonly turnText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBattleBoardConfig) {
    const theme = PF2E_ELF_THEME.components.battleBoard;
    const slotByKey = new Map<string, PF2eBattleSlot>();
    const background = new PF2eNinePatch2(scene, {
      variant: 'panel',
      width: 2,
      height: 2,
    });
    const enemySummaryText = createSummaryText(scene, '');
    const playerSummaryText = createSummaryText(scene, '');
    const turnText = scene.add.text(0, 0, '', {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${theme.headerFontSize}px`,
      fontStyle: 'bold',
      align: 'center',
    });
    const enemyField = createFieldGrid(
      scene,
      'ENEMY',
      ENEMY_FIELD_ORDER,
      config.cardWidth,
      slotByKey,
    );
    const playerField = createFieldGrid(
      scene,
      'PLAYER',
      PLAYER_FIELD_ORDER,
      config.cardWidth,
      slotByKey,
    );

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        left: theme.handInset,
        right: theme.handInset,
        top: theme.handInset,
        bottom: theme.handInset,
        item: theme.handGap,
      },
    });

    scene.add.existing(this);
    this.cardWidth = config.cardWidth;
    this.cardDefinitions = config.cardDefinitions;
    this.cardPresentations = config.cardPresentations ?? TEST_CARD_CATALOG.cardPresentations;
    this.slotByKey = slotByKey;
    this.enemySummaryText = enemySummaryText;
    this.playerSummaryText = playerSummaryText;
    this.turnText = turnText;
    this.addBackground(background)
      .add(enemySummaryText, { align: 'center' })
      .add(enemyField, { align: 'center' })
      .add(turnText, { align: 'center' })
      .add(playerField, { align: 'center' })
      .add(playerSummaryText, { align: 'center' });
    this.renderState(config.initialState);
  }

  get viewCallbacks(): PhaserBattlePresentationViewCallbacks {
    return {
      getCardView: (cardId) => this.cardById.get(cardId),
      detachCardView: (cardId, view) => {
        if (view instanceof PF2eBattleCard) {
          this.detachCard(cardId, view);
        }
      },
      createTransientCardView: (cardId, cue, context) =>
        this.createTransientCard(cardId, cue, context),
      getCardPosition: (cardId, state) => this.getCardPosition(cardId, state),
      renderState: (state) => {
        this.renderState(state);
      },
    };
  }

  renderState(state: BattleState): void {
    this.enemySummaryText.setText(playerSummary(state, 'ENEMY'));
    this.playerSummaryText.setText(playerSummary(state, 'PLAYER'));
    this.turnText.setText(
      `${state.activePlayerId === 'PLAYER' ? '내 턴' : '적 턴'} · Turn ${state.turnNumber} · Action ${state.actionCount}`,
    );

    for (const playerId of ['ENEMY', 'PLAYER'] as const) {
      for (const position of BATTLE_FIELD_POSITIONS) {
        const slot = this.requireSlot(playerId, position);
        const desiredCardId = state.players[playerId].field[position];
        const current = slot.currentCard;

        if (current !== undefined && current.cardId !== desiredCardId) {
          slot.detachCard(current);
          this.cardById.delete(current.cardId);
          current.destroy();
        }

        if (desiredCardId === null) {
          continue;
        }

        const existing = slot.currentCard;
        const model = createBattleCardViewModel(
          state,
          desiredCardId,
          this.cardDefinitions,
          this.cardPresentations,
        );

        if (existing !== undefined) {
          existing.setModel(model);
          this.cardById.set(desiredCardId, existing);
          continue;
        }

        const card = new PF2eBattleCard(this.scene, {
          model,
          width: this.cardWidth,
        }).layout();
        slot.setCard(card).layout();
        this.cardById.set(desiredCardId, card);
      }
    }
  }

  getCardPosition(cardId: StableId, state: BattleState): PhaserBattlePoint | undefined {
    if (!hasCard(state, cardId)) {
      return undefined;
    }

    const location = locateBattleCard(state, cardId);

    if (location.zone === 'FIELD' && location.fieldPosition !== null) {
      const slot = this.requireSlot(location.playerId, location.fieldPosition);
      return Object.freeze({ x: slot.x, y: slot.y });
    }

    const summary = location.playerId === 'PLAYER' ? this.playerSummaryText : this.enemySummaryText;
    const horizontalOffset =
      location.zone === 'DECK'
        ? this.width * 0.27
        : location.zone === 'DROP'
          ? -this.width * 0.27
          : location.zone === 'EXILE'
            ? -this.width * 0.38
            : 0;

    return Object.freeze({
      x: summary.x + horizontalOffset,
      y: summary.y,
    });
  }

  private detachCard(cardId: StableId, view: PF2eBattleCard): void {
    for (const slot of this.slotByKey.values()) {
      if (slot.currentCard === view) {
        slot.detachCard(view).layout();
        break;
      }
    }

    if (this.cardById.get(cardId) === view) {
      this.cardById.delete(cardId);
    }
  }

  private createTransientCard(
    cardId: StableId,
    _cue: BattlePresentationCue,
    context: BattleCuePlaybackContext,
  ): PhaserBattleCardView | undefined {
    const state = hasCard(context.step.beforeState, cardId)
      ? context.step.beforeState
      : context.step.afterState;

    if (!hasCard(state, cardId)) {
      return undefined;
    }

    const card = new PF2eBattleCard(this.scene, {
      model: createBattleCardViewModel(state, cardId, this.cardDefinitions, this.cardPresentations),
      width: this.cardWidth,
    }).layout();
    const position =
      this.getCardPosition(cardId, context.step.beforeState) ??
      this.getCardPosition(cardId, context.step.afterState);

    if (position !== undefined) {
      card.setPosition(position.x, position.y);
    }

    return card;
  }

  private requireSlot(playerId: BattlePlayerId, position: BattleFieldPosition): PF2eBattleSlot {
    const slot = this.slotByKey.get(`${playerId}:${position}`);

    if (slot === undefined) {
      throw new Error(`전투 Field 슬롯을 찾을 수 없습니다: ${playerId}:${position}`);
    }

    return slot;
  }
}
