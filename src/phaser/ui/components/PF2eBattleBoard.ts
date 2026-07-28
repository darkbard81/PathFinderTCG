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
import { PF2eBattlePile } from './PF2eBattlePile.js';
import { PF2eBattleSlot } from './PF2eBattleSlot.js';
import { PF2eCard } from './PF2eCard.js';
import { PF2eSurface } from './PF2eSurface.js';

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

function createFieldArea(
  scene: Phaser.Scene,
  playerId: BattlePlayerId,
  order: readonly BattleFieldPosition[],
  cardWidth: number,
  slotByKey: Map<string, PF2eBattleSlot>,
  pileByKey: Map<string, PF2eBattlePile>,
): Sizer {
  const theme = PF2E_ELF_THEME.components.battleBoard;
  const cardHeight = Math.round(cardWidth / PF2E_ELF_THEME.components.card.aspectRatio);
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
      playerId,
      fieldPosition: position,
    });
    slotByKey.set(`${playerId}:${position}`, slot);
    grid.add(slot, {
      column: index % 3,
      row: Math.floor(index / 3),
      align: 'center',
    });
  });

  const pileWidth = Math.max(
    PF2E_ELF_THEME.components.battleDirect.pileMinimumWidth,
    Math.round(cardWidth * PF2E_ELF_THEME.components.battleDirect.pileWidthRatio),
  );
  const drop = new PF2eBattlePile(scene, {
    playerId,
    zone: 'DROP',
    width: pileWidth,
    height,
  });
  const deck = new PF2eBattlePile(scene, {
    playerId,
    zone: 'DECK',
    width: pileWidth,
    height,
  });
  pileByKey.set(`${playerId}:DROP`, drop);
  pileByKey.set(`${playerId}:DECK`, deck);
  const area = new Sizer(scene, {
    width: width + pileWidth * 2 + theme.zoneGap * 2,
    height,
    orientation: 'x',
    space: {
      item: theme.zoneGap,
    },
  });
  scene.add.existing(area);
  area.add(drop, { expand: true }).add(grid, { align: 'center' }).add(deck, { expand: true });
  return area;
}

function hasCard(state: BattleState, cardId: StableId): boolean {
  return state.cards.some((card) => card.id === cardId);
}

export class PF2eBattleBoard extends Sizer {
  private readonly cardWidth: number;
  private readonly cardDefinitions: readonly CardDefinition[];
  private readonly cardPresentations: readonly CardPresentation[];
  private readonly slotByKey: Map<string, PF2eBattleSlot>;
  private readonly pileByKey: Map<string, PF2eBattlePile>;
  private readonly cardById = new Map<StableId, PF2eCard>();
  private readonly enemySummaryText: Phaser.GameObjects.Text;
  private readonly playerSummaryText: Phaser.GameObjects.Text;
  private readonly turnText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBattleBoardConfig) {
    const theme = PF2E_ELF_THEME.components.battleBoard;
    const slotByKey = new Map<string, PF2eBattleSlot>();
    const pileByKey = new Map<string, PF2eBattlePile>();
    const background = new PF2eSurface(scene, {
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
    const enemyField = createFieldArea(
      scene,
      'ENEMY',
      ENEMY_FIELD_ORDER,
      config.cardWidth,
      slotByKey,
      pileByKey,
    );
    const playerField = createFieldArea(
      scene,
      'PLAYER',
      PLAYER_FIELD_ORDER,
      config.cardWidth,
      slotByKey,
      pileByKey,
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
    this.pileByKey = pileByKey;
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
        if (view instanceof PF2eCard) {
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
      const player = state.players[playerId];
      this.requirePile(playerId, 'DECK').setCounts(player.drawPileIds.length);
      this.requirePile(playerId, 'DROP').setCounts(player.dropIds.length, player.exileIds.length);
    }

    const detachedCards = new Map<StableId, PF2eCard>();
    for (const playerId of ['ENEMY', 'PLAYER'] as const) {
      for (const position of BATTLE_FIELD_POSITIONS) {
        const slot = this.requireSlot(playerId, position);
        const desiredCardId = state.players[playerId].field[position];
        const current = slot.currentCard;

        if (current !== undefined && slot.currentCardId !== desiredCardId) {
          const currentCardId = slot.currentCardId;
          slot.detachCard(current).layout();
          if (currentCardId !== undefined) {
            this.cardById.delete(currentCardId);
            detachedCards.set(currentCardId, current);
          }
        }
      }
    }

    for (const playerId of ['ENEMY', 'PLAYER'] as const) {
      for (const position of BATTLE_FIELD_POSITIONS) {
        const slot = this.requireSlot(playerId, position);
        const desiredCardId = state.players[playerId].field[position];
        if (desiredCardId === null) {
          continue;
        }

        const model = createBattleCardViewModel(
          state,
          desiredCardId,
          this.cardDefinitions,
          this.cardPresentations,
        );
        let card = slot.currentCard;
        if (card === undefined) {
          card =
            detachedCards.get(desiredCardId) ??
            new PF2eCard(this.scene, {
              card: model.card,
              width: this.cardWidth,
              mode: 'board',
            })
              .setName(desiredCardId)
              .layout();
          detachedCards.delete(desiredCardId);
          slot.setCard(desiredCardId, card).layout();
        }
        card.setCard(model.card);
        this.cardById.set(desiredCardId, card);
      }
    }

    for (const card of detachedCards.values()) {
      card.destroy();
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

  getCardView(cardId: StableId): PF2eCard | undefined {
    return this.cardById.get(cardId);
  }

  getCardEntries(): readonly (readonly [StableId, PF2eCard])[] {
    return Object.freeze([...this.cardById.entries()]);
  }

  getSlots(): readonly PF2eBattleSlot[] {
    return Object.freeze([...this.slotByKey.values()]);
  }

  getPile(playerId: BattlePlayerId, zone: 'DECK' | 'DROP'): PF2eBattlePile {
    return this.requirePile(playerId, zone);
  }

  createCardModel(state: BattleState, cardId: StableId) {
    return createBattleCardViewModel(state, cardId, this.cardDefinitions, this.cardPresentations);
  }

  private detachCard(cardId: StableId, view: PF2eCard): void {
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

    const card = new PF2eCard(this.scene, {
      card: createBattleCardViewModel(state, cardId, this.cardDefinitions, this.cardPresentations)
        .card,
      width: this.cardWidth,
      mode: 'board',
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

  private requirePile(playerId: BattlePlayerId, zone: 'DECK' | 'DROP'): PF2eBattlePile {
    const pile = this.pileByKey.get(`${playerId}:${zone}`);
    if (pile === undefined) {
      throw new Error(`전투 pile을 찾을 수 없습니다: ${playerId}:${zone}`);
    }
    return pile;
  }
}
