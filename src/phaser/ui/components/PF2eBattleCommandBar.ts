import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { BattleState } from '../../../game/simulation/battle/index.js';
import type { BattlePlaybackSpeed } from '../../adapters/battlePresentationCueAdapter.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons, type PF2eButtonDefinition } from './PF2eButtons.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface PF2eBattleCommandBarConfig {
  readonly width: number;
  readonly height: number;
  readonly state: BattleState;
  readonly speed: BattlePlaybackSpeed;
  readonly volume: number;
  readonly muted: boolean;
}

const COMMANDS: readonly [PF2eButtonDefinition, ...PF2eButtonDefinition[]] = Object.freeze([
  Object.freeze({ id: 'end-turn', text: '턴 종료' }),
  Object.freeze({ id: 'skip', text: 'Skip' }),
  Object.freeze({ id: 'speed', text: '속도' }),
  Object.freeze({ id: 'volume-down', text: '−' }),
  Object.freeze({ id: 'mute', text: 'SFX' }),
  Object.freeze({ id: 'volume-up', text: '+' }),
  Object.freeze({ id: 'leave', text: '나가기', variant: 'danger' }),
]);

function compactCommands(): readonly [PF2eButtonDefinition, ...PF2eButtonDefinition[]] {
  return COMMANDS.map((command) =>
    Object.freeze({
      ...command,
      fontSize: PF2E_ELF_THEME.components.battleDirect.commandButtonFontSize,
      paddingX: PF2E_ELF_THEME.components.battleDirect.commandButtonPaddingX,
    }),
  ) as [PF2eButtonDefinition, ...PF2eButtonDefinition[]];
}

function battleSummary(state: BattleState): string {
  const active = state.activePlayerId === 'PLAYER' ? '내 턴' : '적 턴';
  return `${active} · T${state.turnNumber} · A${state.actionCount}`;
}

function settingsSummary(speed: BattlePlaybackSpeed, volume: number, muted: boolean): string {
  return `${speed}x · ${muted ? '음소거' : `SFX ${Math.round(volume * 100)}%`}`;
}

/**
 * Action 목록 대신 상태와 보조 제어만 제공하는 전투 상단 명령 막대다.
 */
export class PF2eBattleCommandBar extends Sizer {
  readonly buttons: PF2eButtons;
  private readonly summaryText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly settingsText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBattleCommandBarConfig) {
    const theme = PF2E_ELF_THEME.components.battleDirect;
    const compact = config.width < theme.commandStackBreakpoint;
    const background = new PF2eSurface(scene, {
      variant: 'panel',
      width: 2,
      height: 2,
    });
    const summaryText = scene.add.text(0, 0, battleSummary(config.state), {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${theme.commandTitleFontSize}px`,
      fontStyle: 'bold',
    });
    const statusText = scene.add.text(0, 0, '카드를 누르거나 드래그해 Action을 실행하세요.', {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${theme.commandStatusFontSize}px`,
      wordWrap: compact
        ? undefined
        : {
            width: Math.max(140, Math.round(config.width * 0.3)),
            useAdvancedWrap: true,
          },
    });
    const settingsText = scene.add.text(
      0,
      0,
      settingsSummary(config.speed, config.volume, config.muted),
      {
        color: PF2E_ELF_THEME.colors.mutedText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${theme.commandStatusFontSize}px`,
      },
    );
    const summary = new Sizer(scene, {
      height: compact ? theme.commandCompactSummaryHeight : config.height,
      orientation: compact ? 'x' : 'y',
      space: {
        item: compact ? theme.commandGap : 1,
      },
    });
    scene.add.existing(summary);
    if (compact) {
      summary
        .add(summaryText, { align: 'left' })
        .add(statusText, { proportion: 1, align: 'center' })
        .add(settingsText, { align: 'right' });
    } else {
      summary
        .add(summaryText, { align: 'left' })
        .add(statusText, { align: 'left' })
        .add(settingsText, { align: 'left' });
    }
    const buttons = new PF2eButtons(scene, {
      height: config.height,
      orientation: 'x',
      buttons: compactCommands(),
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: compact ? 'y' : 'x',
      space: {
        left: theme.commandInsetX,
        right: theme.commandInsetX,
        top: 4,
        bottom: 4,
        item: theme.commandGap,
      },
    });

    scene.add.existing(this);
    this.buttons = buttons;
    this.summaryText = summaryText;
    this.statusText = statusText;
    this.settingsText = settingsText;
    this.addBackground(background);
    if (compact) {
      this.add(summary, { expand: true }).add(buttons, { expand: true });
    } else {
      this.add(summary, { proportion: 1, expand: true }).add(buttons, {
        proportion: 2,
        expand: true,
      });
    }
  }

  setBattleState(state: BattleState): this {
    this.summaryText.setText(battleSummary(state));
    return this;
  }

  setSettings(speed: BattlePlaybackSpeed, volume: number, muted: boolean): this {
    this.settingsText.setText(settingsSummary(speed, volume, muted));
    return this;
  }

  setStatus(message: string, danger = false): this {
    this.statusText
      .setText(message)
      .setColor(danger ? PF2E_ELF_THEME.colors.dangerText : PF2E_ELF_THEME.colors.accentText);
    return this;
  }
}
