import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { CardDefinition } from '../../../game/cards/card.js';
import type {
  CardInstance,
  CardPresentation,
  OwnedCollection,
  SavedDeck,
  StableId,
} from '../../../game/data/index.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons } from './PF2eButtons.js';
import { PF2eGridTable, type PF2eGridTableItem } from './PF2eGridTable.js';
import { PF2eNineLabel } from './PF2eNineLabel.js';
import { PF2ePanel } from './PF2ePanel.js';

export interface DeckBuilderListModels {
  readonly collectionItems: readonly PF2eGridTableItem[];
  readonly deckItems: readonly PF2eGridTableItem[];
}

export interface PF2eDeckBuilderPanelConfig extends DeckBuilderListModels {
  readonly width: number;
  readonly tableHeight: number;
  readonly orientation: 'landscape' | 'portrait';
  readonly collectionCount: number;
  readonly deckCount: number;
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

function cardItem(
  instance: CardInstance,
  definition: CardDefinition,
  presentation: CardPresentation | undefined,
  suffix: string,
): PF2eGridTableItem {
  return Object.freeze({
    id: instance.id,
    title: `${definition.type === 'LEADER' ? 'LEADER' : `COST ${definition.cost}`} · ${
      definition.name
    }`,
    detail: [
      `${presentation?.rarity ?? 'COMMON'} · HP ${definition.hp} · ATK ${
        definition.attack
      } · DOM ${definition.dominance}`,
      suffix,
    ].join('\n'),
  });
}

export function createDeckBuilderListModels(
  collection: OwnedCollection,
  deck: SavedDeck,
  cardDefinitions: readonly CardDefinition[],
  presentations: readonly CardPresentation[],
): DeckBuilderListModels {
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
  const collectionItems = sortedCollection.map((instance) => {
    const definition = getDefinition(definitionById, instance);
    const selected =
      deck.leaderInstanceId === instance.id
        ? '현재 리더'
        : unitIds.has(instance.id)
          ? '현재 덱에 포함'
          : '컬렉션 대기';
    return cardItem(
      instance,
      definition,
      presentationById.get(definition.id),
      `${selected} · 인스턴스 ${instance.id.slice(0, 8)}`,
    );
  });
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
    return cardItem(
      instance,
      definition,
      presentationById.get(definition.id),
      index === 0 && definition.type === 'LEADER'
        ? '리더 슬롯'
        : `유닛 ${index - (deck.leaderInstanceId === null ? -1 : 0)}/29`,
    );
  });

  return Object.freeze({
    collectionItems: Object.freeze(collectionItems),
    deckItems: Object.freeze(deckItems),
  });
}

function createListPanel(
  scene: Phaser.Scene,
  title: string,
  width: number,
  height: number,
  items: readonly PF2eGridTableItem[],
): { readonly panel: PF2ePanel; readonly table: PF2eGridTable } {
  const heading = new PF2eNineLabel(scene, {
    text: title,
    variant: 'section',
    fontSize: PF2E_ELF_THEME.components.phaseSeven.summaryTitleFontSize,
  });
  const table = new PF2eGridTable(scene, {
    width,
    height,
    items,
    columns: 1,
  });
  const panel = new PF2ePanel(scene, {
    width,
    orientation: 'y',
    inset: PF2E_ELF_THEME.spacing.compactInset,
    itemGap: PF2E_ELF_THEME.spacing.compactGap,
  });
  panel.add(heading, { expand: true }).add(table, { proportion: 1, expand: true });
  return Object.freeze({ panel, table });
}

export class PF2eDeckBuilderPanel extends Sizer {
  readonly collectionTable: PF2eGridTable;
  readonly deckTable: PF2eGridTable;
  readonly editButtons: PF2eButtons;
  readonly navigationButtons: PF2eButtons;

  constructor(scene: Phaser.Scene, config: PF2eDeckBuilderPanelConfig) {
    const gap = PF2E_ELF_THEME.spacing.compactGap;
    const tableWidth =
      config.orientation === 'landscape'
        ? Math.max(180, Math.floor((config.width - gap) / 2))
        : config.width;
    const collection = createListPanel(
      scene,
      `컬렉션 · ${config.collectionCount}장`,
      tableWidth,
      config.tableHeight,
      config.collectionItems,
    );
    const deck = createListPanel(
      scene,
      `현재 덱 · ${config.deckCount}/30장`,
      tableWidth,
      config.tableHeight,
      config.deckItems,
    );
    const lists = new Sizer(scene, {
      width: config.width,
      orientation: config.orientation === 'landscape' ? 'x' : 'y',
      space: {
        item: gap,
      },
    });
    scene.add.existing(lists);
    lists
      .add(collection.panel, { proportion: 1, expand: true })
      .add(deck.panel, { proportion: 1, expand: true });

    const editButtons = new PF2eButtons(scene, {
      orientation: 'x',
      buttons: [
        {
          id: 'add',
          text: '유닛 추가',
          fontSize: PF2E_ELF_THEME.components.battleHud.compactButtonFontSize,
          paddingX: PF2E_ELF_THEME.components.battleHud.compactButtonPaddingX,
        },
        {
          id: 'leader',
          text: '리더 선택',
          fontSize: PF2E_ELF_THEME.components.battleHud.compactButtonFontSize,
          paddingX: PF2E_ELF_THEME.components.battleHud.compactButtonPaddingX,
        },
        {
          id: 'remove',
          text: '덱에서 제거',
          variant: 'danger',
          fontSize: PF2E_ELF_THEME.components.battleHud.compactButtonFontSize,
          paddingX: PF2E_ELF_THEME.components.battleHud.compactButtonPaddingX,
        },
      ],
    });
    const navigationButtons = new PF2eButtons(scene, {
      orientation: 'x',
      buttons: [
        {
          id: 'save',
          text: '덱 저장',
          fontSize: PF2E_ELF_THEME.components.battleHud.compactButtonFontSize,
          paddingX: PF2E_ELF_THEME.components.battleHud.compactButtonPaddingX,
        },
        {
          id: 'battle',
          text: '저장 덱으로 전투',
          fontSize: PF2E_ELF_THEME.components.battleHud.compactButtonFontSize,
          paddingX: PF2E_ELF_THEME.components.battleHud.compactButtonPaddingX,
        },
        {
          id: 'stage',
          text: 'Stage로 돌아가기',
          fontSize: PF2E_ELF_THEME.components.battleHud.compactButtonFontSize,
          paddingX: PF2E_ELF_THEME.components.battleHud.compactButtonPaddingX,
        },
      ],
    });

    super(scene, {
      width: config.width,
      orientation: 'y',
      space: {
        item: gap,
      },
    });

    scene.add.existing(this);
    this.collectionTable = collection.table;
    this.deckTable = deck.table;
    this.editButtons = editButtons;
    this.navigationButtons = navigationButtons;
    this.add(lists, { proportion: 1, expand: true })
      .add(editButtons, { expand: true })
      .add(navigationButtons, { expand: true });
  }
}
