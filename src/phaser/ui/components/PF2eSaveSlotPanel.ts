import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { SaveSlotSummary } from '../../../game/client/PathfinderApiClient.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons } from './PF2eButtons.js';
import { PF2eGridTable, type PF2eGridTableItem } from './PF2eGridTable.js';

export interface PF2eSaveSlotPanelConfig {
  readonly width: number;
  readonly height: number;
  readonly summaries: readonly SaveSlotSummary[];
  readonly columns: number;
  readonly compactActions: boolean;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('ko-KR');
}

export function createSaveSlotItems(
  summaries: readonly SaveSlotSummary[],
): readonly PF2eGridTableItem[] {
  return Object.freeze(
    summaries.map((summary) =>
      Object.freeze({
        id: String(summary.slotId),
        title:
          summary.status === 'EMPTY'
            ? `슬롯 ${summary.slotId} · 비어 있음`
            : `슬롯 ${summary.slotId} · 모험 진행 중`,
        detail:
          summary.status === 'EMPTY'
            ? '새 게임을 만들 수 있습니다.'
            : [
                `보유 카드 ${summary.ownedCardCount}장 · 덱 ${summary.deckCount}개`,
                `마지막 저장 ${formatTimestamp(summary.lastModifiedAt)}`,
              ].join('\n'),
      }),
    ),
  );
}

export class PF2eSaveSlotPanel extends Sizer {
  readonly table: PF2eGridTable;
  readonly buttons: PF2eButtons;
  readonly items: readonly PF2eGridTableItem[];

  constructor(scene: Phaser.Scene, config: PF2eSaveSlotPanelConfig) {
    const items = createSaveSlotItems(config.summaries);
    const table = new PF2eGridTable(scene, {
      width: config.width,
      height: config.height,
      items,
      columns: config.columns,
    });
    const buttons = new PF2eButtons(scene, {
      orientation: config.compactActions ? 'y' : 'x',
      buttons: [
        {
          id: 'enter',
          text: '선택한 슬롯 열기',
        },
        {
          id: 'reset',
          text: '슬롯 초기화',
          variant: 'danger',
        },
        {
          id: 'logout',
          text: '로그아웃',
          variant: 'danger',
        },
      ],
    });

    super(scene, {
      width: config.width,
      orientation: 'y',
      space: {
        item: PF2E_ELF_THEME.spacing.compactGap,
      },
    });

    scene.add.existing(this);
    this.table = table;
    this.buttons = buttons;
    this.items = items;
    this.add(table, { proportion: 1, expand: true }).add(buttons, { expand: true });
  }
}
