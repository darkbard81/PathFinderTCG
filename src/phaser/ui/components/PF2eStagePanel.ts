import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { StageCatalogEntry } from '../../../game/content/index.js';
import type { SavedDeck } from '../../../game/data/index.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons } from './PF2eButtons.js';
import { PF2eNineLabel } from './PF2eNineLabel.js';
import { PF2ePanel } from './PF2ePanel.js';

export interface PF2eStagePanelConfig {
  readonly width: number;
  readonly stage: StageCatalogEntry;
  readonly deck: SavedDeck;
  readonly ownedCardCount: number;
  readonly completedRunCount: number;
  readonly winCount: number;
  readonly cleared: boolean;
  readonly compactActions: boolean;
  readonly bodyFontSize: number;
}

export class PF2eStagePanel extends Sizer {
  readonly buttons: PF2eButtons;

  constructor(scene: Phaser.Scene, config: PF2eStagePanelConfig) {
    const phaseTheme = PF2E_ELF_THEME.components.phaseSeven;
    const deckSummary = new PF2ePanel(scene, {
      orientation: 'y',
      inset: PF2E_ELF_THEME.spacing.compactInset,
      itemGap: PF2E_ELF_THEME.spacing.compactGap,
    });
    const deckTitle = new PF2eNineLabel(scene, {
      text: `선택 덱 · ${config.deck.name}`,
      variant: 'section',
      fontSize: phaseTheme.summaryTitleFontSize,
    });
    const deckDetail = scene.add.text(
      0,
      0,
      [
        `리더 ${config.deck.leaderInstanceId === null ? '미선택' : '선택됨'}`,
        `유닛 ${config.deck.unitInstanceIds.length}/29 · 총 ${
          config.deck.unitInstanceIds.length + (config.deck.leaderInstanceId === null ? 0 : 1)
        }/30장`,
        `컬렉션 ${config.ownedCardCount}장`,
      ],
      {
        color: PF2E_ELF_THEME.colors.mutedText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${config.bodyFontSize}px`,
        lineSpacing: phaseTheme.statusLineSpacing,
      },
    );
    deckSummary.add(deckTitle, { expand: true }).add(deckDetail, { align: 'left' });

    const stageSummary = new PF2ePanel(scene, {
      orientation: 'y',
      inset: PF2E_ELF_THEME.spacing.compactInset,
      itemGap: PF2E_ELF_THEME.spacing.compactGap,
    });
    const stageTitle = new PF2eNineLabel(scene, {
      text: config.stage.presentation.name,
      variant: 'section',
      fontSize: phaseTheme.summaryTitleFontSize,
    });
    const stageDetail = scene.add.text(
      0,
      0,
      [
        config.stage.presentation.description,
        config.stage.presentation.rewardSummary,
        `${config.cleared ? '클리어 완료' : '미클리어'} · 실행 ${config.completedRunCount}회 · 승리 ${config.winCount}회`,
      ].join('\n'),
      {
        color: PF2E_ELF_THEME.colors.text,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${config.bodyFontSize}px`,
        lineSpacing: phaseTheme.statusLineSpacing,
        wordWrap: {
          width: Math.max(180, config.width - PF2E_ELF_THEME.spacing.compactInset * 4),
          useAdvancedWrap: true,
        },
      },
    );
    stageSummary.add(stageTitle, { expand: true }).add(stageDetail, {
      align: 'left',
    });

    const buttons = new PF2eButtons(scene, {
      orientation: config.compactActions ? 'y' : 'x',
      buttons: [
        {
          id: 'deck',
          text: '덱 구성',
        },
        {
          id: 'battle',
          text: '전투 시작',
        },
        {
          id: 'slots',
          text: '슬롯 변경',
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
        item: PF2E_ELF_THEME.spacing.controlGap,
      },
    });

    scene.add.existing(this);
    this.buttons = buttons;
    this.add(deckSummary, { expand: true })
      .add(stageSummary, { proportion: 1, expand: true })
      .add(buttons, { expand: true });
  }
}
