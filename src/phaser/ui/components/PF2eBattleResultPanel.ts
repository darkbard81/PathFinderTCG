import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { CompletedClientBattle } from '../../../game/simulation/GameSession.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons } from './PF2eButtons.js';
import { PF2eCard } from './PF2eCard.js';
import { PF2ePanel } from './PF2ePanel.js';

export interface PF2eBattleResultPanelConfig {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'landscape' | 'portrait';
  readonly battle: CompletedClientBattle;
  readonly ownedCardCount: number;
}

function resultTitle(battle: CompletedClientBattle): string {
  if (battle.result.type === 'DRAW') {
    return '무승부';
  }

  return battle.result.winnerId === 'PLAYER' ? '승리' : '패배';
}

function resultReason(battle: CompletedClientBattle): string {
  return battle.result.reason === 'LEADER_DEFEATED'
    ? '리더가 패배해 전투가 종료되었습니다.'
    : '필수 드로우에 실패해 전투가 종료되었습니다.';
}

export class PF2eBattleResultPanel extends Sizer {
  readonly buttons: PF2eButtons;

  constructor(scene: Phaser.Scene, config: PF2eBattleResultPanelConfig) {
    const gap = PF2E_ELF_THEME.spacing.compactGap;
    const portrait = config.orientation === 'portrait';
    const panelInset = portrait
      ? PF2E_ELF_THEME.spacing.compactGap
      : PF2E_ELF_THEME.spacing.compactInset;
    const summaryHeight = Math.max(
      1,
      config.height - PF2E_ELF_THEME.components.buttons.height - gap,
    );
    const resultText = scene.add.text(0, 0, resultTitle(config.battle), {
      color:
        config.battle.result.type === 'WIN' && config.battle.result.winnerId !== 'PLAYER'
          ? PF2E_ELF_THEME.colors.dangerText
          : PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${PF2E_ELF_THEME.label.heading.fontSize}px`,
      fontStyle: 'bold',
      align: 'center',
    });
    const detailText = scene.add.text(
      0,
      0,
      [
        resultReason(config.battle),
        `총 ${config.battle.finalState.actionCount} Action · Turn ${config.battle.finalState.turnNumber}`,
        `실행 ID · ${config.battle.stageRun.runId}`,
      ].join('\n'),
      {
        color: PF2E_ELF_THEME.colors.mutedText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${PF2E_ELF_THEME.components.phaseSeven.summaryDetailFontSize}px`,
        lineSpacing: PF2E_ELF_THEME.components.phaseSeven.statusLineSpacing,
        align: 'center',
      },
    );
    const rewardText = scene.add.text(
      0,
      0,
      config.battle.reward === null
        ? `${config.battle.stageRun.result === 'WIN' ? '보상 정보를 찾을 수 없습니다.' : '패배 또는 무승부에는 보상이 없습니다.'}\n컬렉션 ${config.ownedCardCount}장`
        : `획득 · ${config.battle.reward.card.name} · ${config.battle.reward.card.rarity}\n컬렉션 ${config.ownedCardCount}장 · 서버 저장 완료`,
      {
        color: PF2E_ELF_THEME.colors.accentText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${PF2E_ELF_THEME.components.phaseSeven.summaryDetailFontSize}px`,
        lineSpacing: PF2E_ELF_THEME.components.phaseSeven.statusLineSpacing,
        align: 'center',
        wordWrap: {
          width: Math.max(220, config.width - PF2E_ELF_THEME.spacing.panelInset * 2),
          useAdvancedWrap: true,
        },
      },
    );
    const stageText = portrait
      ? null
      : scene.add.text(0, 0, config.battle.stage.presentation.name, {
          color: PF2E_ELF_THEME.colors.accentText,
          fontFamily: PF2E_ELF_THEME.typography.display,
          fontSize: `${PF2E_ELF_THEME.components.phaseSeven.summaryTitleFontSize}px`,
          fontStyle: 'bold',
          align: 'center',
        });
    const resultSummary = new Sizer(scene, {
      orientation: 'y',
      space: {
        item: gap,
      },
    });
    scene.add.existing(resultSummary);
    if (stageText !== null) {
      resultSummary.add(stageText, { align: 'center' });
    }
    resultSummary
      .add(resultText, { align: 'center' })
      .add(detailText, { align: 'center' })
      .add(rewardText, { align: 'center' });
    const summaryPanel = new PF2ePanel(scene, {
      width: config.width,
      height: summaryHeight,
      orientation: config.orientation === 'landscape' ? 'x' : 'y',
      inset: panelInset,
      itemGap: gap,
    });
    summaryPanel.add(
      resultSummary,
      portrait
        ? {
            align: 'center',
          }
        : {
            proportion: 1,
            align: 'center',
            expand: true,
          },
    );
    if (config.battle.reward !== null) {
      summaryPanel.add(
        new PF2eCard(scene, {
          card: config.battle.reward.card,
          width: portrait
            ? PF2E_ELF_THEME.components.card.compactWidth
            : PF2E_ELF_THEME.components.card.minimumWidth,
          compact: portrait,
        }),
        {
          align: 'center',
          expand: false,
        },
      );
    }
    const buttons = new PF2eButtons(scene, {
      orientation: 'x',
      buttons: [
        { id: 'rematch', text: '다시 전투' },
        { id: 'stage', text: 'Stage로' },
        { id: 'slots', text: '세이브 슬롯' },
      ],
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        item: gap,
      },
    });

    scene.add.existing(this);
    this.buttons = buttons;
    this.add(summaryPanel, { proportion: 1, expand: true }).add(buttons, {
      expand: true,
    });
  }
}
