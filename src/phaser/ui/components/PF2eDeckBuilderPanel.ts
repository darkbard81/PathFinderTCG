import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { CardDefinition } from '../../../game/cards/card.js';
import { createCardDisplayModel } from '../../../game/cards/cardDisplay.js';
import type {
  CardInstance,
  CardPresentation,
  OwnedCollection,
  SavedDeck,
  StableId,
} from '../../../game/data/index.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons } from './PF2eButtons.js';
import { PF2eCardGrid, type PF2eCardGridItem } from './PF2eCardGrid.js';
import { PF2eLabel } from './PF2eLabel.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface DeckBuilderCardModels {
  readonly collectionItems: readonly PF2eCardGridItem[];
  readonly deckItems: readonly PF2eCardGridItem[];
}

export interface PF2eDeckBuilderPanelConfig extends DeckBuilderCardModels {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'landscape' | 'portrait';
  readonly gap: number;
  readonly headerHeight: number;
  readonly footerHeight: number;
  readonly collectionWidth: number;
  readonly collectionHeight: number;
  readonly collectionColumns: number;
  readonly collectionCardWidth: number;
  readonly deckWidth: number;
  readonly deckHeight: number;
  readonly deckColumns: number;
  readonly deckCardWidth: number;
  readonly collectionCount: number;
  readonly deckCount: number;
  readonly status: string;
  readonly statusDanger: boolean;
}

function getDefinition(
  definitionById: ReadonlyMap<StableId, CardDefinition>,
  instance: CardInstance,
): CardDefinition {
  const definition = definitionById.get(instance.cardDefinitionId);

  if (definition === undefined) {
    throw new Error(`카드 정의를 찾을 수 없습니다: ${instance.cardDefinitionId}`);
  }

  return definition;
}

/**
 * 저장 컬렉션과 편집 중 덱을 PF2eCard 갤러리 모델로 변환한다.
 */
export function createDeckBuilderCardModels(
  collection: OwnedCollection,
  deck: SavedDeck,
  cardDefinitions: readonly CardDefinition[],
  presentations: readonly CardPresentation[],
): DeckBuilderCardModels {
  const definitionById = new Map(cardDefinitions.map((definition) => [definition.id, definition]));
  const presentationById = new Map(
    presentations.map((presentation) => [presentation.cardDefinitionId, presentation]),
  );
  const instanceById = new Map(collection.cardInstances.map((instance) => [instance.id, instance]));
  const unitIds = new Set(deck.unitInstanceIds);
  const sortedCollection = [...collection.cardInstances].sort((left, right) => {
    const leftDefinition = getDefinition(definitionById, left);
    const rightDefinition = getDefinition(definitionById, right);
    const typeOrder =
      Number(rightDefinition.type === 'LEADER') - Number(leftDefinition.type === 'LEADER');
    return (
      typeOrder ||
      leftDefinition.cost - rightDefinition.cost ||
      leftDefinition.name.localeCompare(rightDefinition.name) ||
      left.id.localeCompare(right.id)
    );
  });

  const toCard = (instance: CardInstance) => {
    const definition = getDefinition(definitionById, instance);
    const presentation = presentationById.get(definition.id);
    if (presentation === undefined) {
      throw new Error(`카드 표시 정보를 찾을 수 없습니다: ${definition.id}`);
    }
    return createCardDisplayModel(definition, presentation);
  };

  const collectionItems = sortedCollection.map((instance) =>
    Object.freeze({
      id: instance.id,
      card: toCard(instance),
      caption:
        deck.leaderInstanceId === instance.id
          ? '현재 리더 · 누르면 해제'
          : unitIds.has(instance.id)
            ? '현재 덱 · 누르면 제거'
            : '누르거나 덱으로 드래그',
    }),
  );
  const deckInstanceIds = [
    ...(deck.leaderInstanceId === null ? [] : [deck.leaderInstanceId]),
    ...deck.unitInstanceIds,
  ];
  const deckItems = deckInstanceIds.map((instanceId, index) => {
    const instance = instanceById.get(instanceId);
    if (instance === undefined) {
      throw new Error(`덱 카드 인스턴스를 컬렉션에서 찾을 수 없습니다: ${instanceId}`);
    }
    const definition = getDefinition(definitionById, instance);
    return Object.freeze({
      id: instance.id,
      card: toCard(instance),
      caption:
        index === 0 && definition.type === 'LEADER'
          ? '리더 · 컬렉션으로 드래그'
          : `유닛 ${index - (deck.leaderInstanceId === null ? -1 : 0)}/29 · 누르면 제거`,
    });
  });

  return Object.freeze({
    collectionItems: Object.freeze(collectionItems),
    deckItems: Object.freeze(deckItems),
  });
}

interface CardGalleryConfig {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly cardWidth: number;
  readonly items: readonly PF2eCardGridItem[];
}

class PF2eCardGallery extends Sizer {
  readonly grid: PF2eCardGrid;

  constructor(scene: Phaser.Scene, config: CardGalleryConfig) {
    const heading = new PF2eLabel(scene, {
      text: config.title,
      variant: 'status',
      width: config.width,
      height: PF2E_ELF_THEME.components.themeMod.galleryHeadingHeight,
      fontSize: PF2E_ELF_THEME.components.themeMod.galleryHeadingFontSize,
    });
    const gridHeight = Math.max(
      1,
      config.height -
        PF2E_ELF_THEME.components.themeMod.galleryHeadingHeight -
        PF2E_ELF_THEME.components.themeMod.galleryGap,
    );
    const grid = new PF2eCardGrid(scene, {
      width: config.width,
      height: gridHeight,
      items: config.items,
      columns: config.columns,
      cardWidth: config.cardWidth,
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        item: PF2E_ELF_THEME.components.themeMod.galleryGap,
      },
    });

    scene.add.existing(this);
    this.grid = grid;
    this.add(heading, { expand: true }).add(grid, { proportion: 1, expand: true });
  }
}

/**
 * 카드 갤러리 두 개와 저장용 navigation만 조립하는 덱 구성 root Sizer다.
 */
export class PF2eDeckBuilderPanel extends Sizer {
  readonly collectionGrid: PF2eCardGrid;
  readonly deckGrid: PF2eCardGrid;
  readonly navigationButtons: PF2eButtons;
  private readonly statusText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eDeckBuilderPanelConfig) {
    const theme = PF2E_ELF_THEME.components.themeMod;
    const background = new PF2eSurface(scene, {
      variant: 'panel',
      width: 2,
      height: 2,
    });
    const titleText = scene.add.text(0, 0, '덱 구성', {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${theme.screenTitleFontSize}px`,
      fontStyle: 'bold',
    });
    const instructionText = scene.add.text(
      0,
      0,
      '카드를 누르거나 두 영역 사이로 드래그하세요. LEADER는 자동으로 리더 슬롯에 배치됩니다.',
      {
        color: PF2E_ELF_THEME.colors.mutedText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${theme.instructionFontSize}px`,
      },
    );
    const statusText = scene.add.text(0, 0, config.status, {
      color: config.statusDanger
        ? PF2E_ELF_THEME.colors.dangerText
        : PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${theme.statusFontSize}px`,
      fontStyle: 'bold',
      align: 'right',
      wordWrap: {
        width: Math.max(160, Math.round(config.width * 0.48)),
        useAdvancedWrap: true,
      },
    });
    const headerLeft = new Sizer(scene, {
      height: config.headerHeight,
      orientation: 'y',
      space: {
        item: theme.headerTextGap,
      },
    });
    scene.add.existing(headerLeft);
    headerLeft.add(titleText, { align: 'left' }).add(instructionText, { align: 'left' });
    const header = new Sizer(scene, {
      width: config.width,
      height: config.headerHeight,
      orientation: 'x',
      space: {
        left: theme.screenInset,
        right: theme.screenInset,
        top: theme.headerInsetY,
        bottom: theme.headerInsetY,
        item: config.gap,
      },
    });
    scene.add.existing(header);
    header
      .add(headerLeft, { proportion: 1, expand: true })
      .add(statusText, { proportion: 1, align: 'right' });

    const collection = new PF2eCardGallery(scene, {
      title: `컬렉션 · ${config.collectionCount}장`,
      width: config.collectionWidth,
      height: config.collectionHeight,
      columns: config.collectionColumns,
      cardWidth: config.collectionCardWidth,
      items: config.collectionItems,
    });
    const deck = new PF2eCardGallery(scene, {
      title: `현재 덱 · ${config.deckCount}/30장`,
      width: config.deckWidth,
      height: config.deckHeight,
      columns: config.deckColumns,
      cardWidth: config.deckCardWidth,
      items: config.deckItems,
    });
    const galleries = new Sizer(scene, {
      width: config.width,
      height:
        config.orientation === 'landscape'
          ? config.collectionHeight
          : config.collectionHeight + config.deckHeight + config.gap,
      orientation: config.orientation === 'landscape' ? 'x' : 'y',
      space: {
        item: config.gap,
      },
    });
    scene.add.existing(galleries);
    galleries.add(collection, { expand: true }).add(deck, { expand: true });

    const navigationButtons = new PF2eButtons(scene, {
      height: config.footerHeight,
      orientation: 'x',
      buttons: [
        { id: 'save', text: '덱 저장' },
        { id: 'battle', text: '전투 시작' },
        { id: 'stage', text: 'Stage' },
      ],
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        item: config.gap,
      },
    });

    scene.add.existing(this);
    this.collectionGrid = collection.grid;
    this.deckGrid = deck.grid;
    this.navigationButtons = navigationButtons;
    this.statusText = statusText;
    this.addBackground(background)
      .add(header, { expand: true })
      .add(galleries, { proportion: 1, expand: true })
      .add(navigationButtons, {
        expand: true,
        padding: {
          left: theme.screenInset,
          right: theme.screenInset,
          bottom: theme.footerInsetY,
        },
      });
  }

  setStatus(message: string, danger: boolean): this {
    this.statusText
      .setText(message)
      .setColor(danger ? PF2E_ELF_THEME.colors.dangerText : PF2E_ELF_THEME.colors.accentText);
    return this;
  }
}
