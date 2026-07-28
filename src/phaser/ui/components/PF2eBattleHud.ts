import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { BattleState } from '../../../game/simulation/battle/index.js';
import type { BattlePlaybackSpeed } from '../../adapters/battlePresentationCueAdapter.js';
import type { BattleActionListItem } from '../controllers/battleUiModels.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons, type PF2eButtonDefinition } from './PF2eButtons.js';
import { PF2eGridTable } from './PF2eGridTable.js';
import { PF2eNinePatch2 } from './PF2eNinePatch2.js';

export interface PF2eBattleHudConfig {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'landscape' | 'portrait';
  readonly actionItems: readonly BattleActionListItem[];
  readonly state: BattleState;
  readonly speed: BattlePlaybackSpeed;
  readonly volume: number;
  readonly muted: boolean;
}

const NAVIGATION_BUTTONS: readonly [
  PF2eButtonDefinition,
  PF2eButtonDefinition,
  PF2eButtonDefinition,
] = Object.freeze([
  Object.freeze({ id: 'execute', text: 'Action 실행' }),
  Object.freeze({ id: 'skip', text: '연출 Skip' }),
  Object.freeze({ id: 'leave', text: '전투 나가기', variant: 'danger' }),
]);

const SPEED_BUTTONS: readonly [PF2eButtonDefinition, PF2eButtonDefinition, PF2eButtonDefinition] =
  Object.freeze([
    Object.freeze({ id: 'speed-1', text: '1x' }),
    Object.freeze({ id: 'speed-2', text: '2x' }),
    Object.freeze({ id: 'speed-4', text: '4x' }),
  ]);

const AUDIO_BUTTONS: readonly [PF2eButtonDefinition, PF2eButtonDefinition, PF2eButtonDefinition] =
  Object.freeze([
    Object.freeze({ id: 'volume-down', text: '음량 −' }),
    Object.freeze({ id: 'mute', text: '음소거' }),
    Object.freeze({ id: 'volume-up', text: '음량 +' }),
  ]);

function compactButtons(
  definitions: readonly [PF2eButtonDefinition, ...PF2eButtonDefinition[]],
): readonly [PF2eButtonDefinition, ...PF2eButtonDefinition[]] {
  return definitions.map((definition) =>
    Object.freeze({
      ...definition,
      fontSize: PF2E_ELF_THEME.components.battleHud.compactButtonFontSize,
      paddingX: PF2E_ELF_THEME.components.battleHud.compactButtonPaddingX,
    }),
  ) as [PF2eButtonDefinition, ...PF2eButtonDefinition[]];
}

function battleSummary(state: BattleState): string {
  const active = state.activePlayerId === 'PLAYER' ? '내 턴' : '적 턴';
  const result =
    state.result.type === 'ONGOING'
      ? ''
      : state.result.type === 'DRAW'
        ? ' · 무승부'
        : ` · ${state.result.winnerId === 'PLAYER' ? '승리' : '패배'}`;
  return `${active} · Turn ${state.turnNumber} · Action ${state.actionCount}${result}`;
}

function settingsSummary(speed: BattlePlaybackSpeed, volume: number, muted: boolean): string {
  return `연출 ${speed}x · SFX ${muted ? '음소거' : `${Math.round(volume * 100)}%`}`;
}

export class PF2eBattleHud extends Sizer {
  readonly actionTable: PF2eGridTable;
  readonly navigationButtons: PF2eButtons;
  readonly settingsButtonGroups: readonly PF2eButtons[];
  private readonly battleSummaryText: Phaser.GameObjects.Text;
  private readonly settingsSummaryText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBattleHudConfig) {
    const theme = PF2E_ELF_THEME.components.battleHud;
    const gap = theme.groupGap;
    const background = new PF2eNinePatch2(scene, {
      variant: 'panel',
      width: 2,
      height: 2,
    });
    const battleSummaryText = scene.add.text(0, 0, battleSummary(config.state), {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${PF2E_ELF_THEME.components.battleBoard.headerFontSize}px`,
      fontStyle: 'bold',
      align: 'center',
    });
    const settingsSummaryText = scene.add.text(
      0,
      0,
      settingsSummary(config.speed, config.volume, config.muted),
      {
        color: PF2E_ELF_THEME.colors.accentText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${theme.statusFontSize}px`,
        align: 'center',
      },
    );
    const statusText = scene.add.text(0, 0, '실행할 Action을 선택하세요.', {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${theme.statusFontSize}px`,
      lineSpacing: theme.statusLineSpacing,
      align: 'center',
      wordWrap: {
        width: Math.max(120, config.width - PF2E_ELF_THEME.spacing.compactInset * 2),
        useAdvancedWrap: true,
      },
    });
    const controlRowCount = config.orientation === 'portrait' ? 2 : 3;
    const reservedHeight =
      PF2E_ELF_THEME.components.buttons.height * controlRowCount + gap * (controlRowCount + 4) + 78;
    const actionTableHeight = Math.max(
      82,
      config.height - PF2E_ELF_THEME.spacing.compactInset * 2 - reservedHeight,
    );
    const actionTable = new PF2eGridTable(scene, {
      width: Math.max(180, config.width - PF2E_ELF_THEME.spacing.compactInset * 2),
      height: actionTableHeight,
      items: config.actionItems,
      columns: 1,
    });
    const navigationButtons = new PF2eButtons(scene, {
      orientation: 'x',
      buttons: compactButtons(NAVIGATION_BUTTONS),
    });
    const settingsButtonGroups =
      config.orientation === 'portrait'
        ? [
            new PF2eButtons(scene, {
              orientation: 'x',
              buttons: compactButtons([...SPEED_BUTTONS, ...AUDIO_BUTTONS]),
            }),
          ]
        : [
            new PF2eButtons(scene, {
              orientation: 'x',
              buttons: compactButtons(SPEED_BUTTONS),
            }),
            new PF2eButtons(scene, {
              orientation: 'x',
              buttons: compactButtons(AUDIO_BUTTONS),
            }),
          ];

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        left: PF2E_ELF_THEME.spacing.compactInset,
        right: PF2E_ELF_THEME.spacing.compactInset,
        top: PF2E_ELF_THEME.spacing.compactInset,
        bottom: PF2E_ELF_THEME.spacing.compactInset,
        item: gap,
      },
    });

    scene.add.existing(this);
    this.actionTable = actionTable;
    this.navigationButtons = navigationButtons;
    this.settingsButtonGroups = Object.freeze(settingsButtonGroups);
    this.battleSummaryText = battleSummaryText;
    this.settingsSummaryText = settingsSummaryText;
    this.statusText = statusText;
    this.addBackground(background)
      .add(battleSummaryText, { align: 'center' })
      .add(settingsSummaryText, { align: 'center' })
      .add(actionTable, { proportion: 1, expand: true })
      .add(statusText, { align: 'center' })
      .add(navigationButtons, { expand: true });

    for (const group of settingsButtonGroups) {
      this.add(group, { expand: true });
    }
  }

  setActionItems(items: readonly BattleActionListItem[]): this {
    this.actionTable.setTableItems(items);
    return this;
  }

  setBattleState(state: BattleState): this {
    this.battleSummaryText.setText(battleSummary(state));
    return this;
  }

  setSettings(speed: BattlePlaybackSpeed, volume: number, muted: boolean): this {
    this.settingsSummaryText.setText(settingsSummary(speed, volume, muted));
    return this;
  }

  setStatus(message: string, danger = false): this {
    this.statusText
      .setText(message)
      .setColor(danger ? PF2E_ELF_THEME.colors.dangerText : PF2E_ELF_THEME.colors.mutedText);
    return this;
  }
}
