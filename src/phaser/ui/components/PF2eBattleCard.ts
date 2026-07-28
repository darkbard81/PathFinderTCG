import type * as Phaser from 'phaser';
import { OverlapSizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import type { BattleCardViewModel } from '../controllers/battleUiModels.js';

export interface PF2eBattleCardConfig {
  readonly model: BattleCardViewModel;
  readonly width: number;
}

function scaled(width: number, ratio: number, minimum: number): number {
  return Math.max(minimum, Math.round(width * ratio));
}

function cardName(model: BattleCardViewModel): string {
  return `${model.isLeader ? '♛ ' : ''}${model.card.name}`;
}

function cardStats(model: BattleCardViewModel): string {
  const stats = model.card.stats;
  return `C ${stats.cost} · D ${stats.dominance}\nA ${stats.attack} · HP ${stats.hp}`;
}

function cardState(model: BattleCardViewModel): string {
  const states = [
    model.deploymentPending ? '배치 대기' : undefined,
    model.statusCount > 0 ? `상태 ${model.statusCount}` : undefined,
  ].filter((value): value is string => value !== undefined);
  return states.join(' · ');
}

export class PF2eBattleCard extends OverlapSizer {
  readonly cardId: string;
  private readonly art: Phaser.GameObjects.Image;
  private readonly frame: Phaser.GameObjects.Image;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly stateText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBattleCardConfig) {
    const theme = PF2E_ELF_THEME.components.battleCard;
    const width = Math.max(1, Math.round(config.width));
    const height = Math.max(1, Math.round(width / theme.aspectRatio));
    const frameInset = theme.frameInset;
    const contentWidth = Math.max(1, width - frameInset * 2);
    const nameHeight = scaled(width, theme.nameHeightRatio, 20);
    const fontSize = scaled(width, theme.nameFontRatio, 9);
    const statFontSize = scaled(width, theme.statFontRatio, 9);
    const art = scene.add
      .image(0, 0, config.model.card.artAssetKey)
      .setDisplaySize(contentWidth, Math.max(1, height - frameInset * 2));
    const frame = scene.add
      .image(0, 0, PF2E_ELF_THEME.components.card.frameVariants[config.model.card.frameVariant].key)
      .setDisplaySize(width, height);
    const nameBackground = scene.add.rectangle(
      0,
      0,
      contentWidth,
      nameHeight,
      theme.nameBackgroundColor,
      theme.nameBackgroundAlpha,
    );
    const statsBackground = scene.add.rectangle(
      0,
      0,
      contentWidth,
      nameHeight,
      theme.nameBackgroundColor,
      theme.nameBackgroundAlpha,
    );
    const nameText = scene.add.text(0, 0, cardName(config.model), {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      stroke: theme.textStrokeColor,
      strokeThickness: theme.textStrokeThickness,
      align: 'center',
      wordWrap: {
        width: Math.max(1, contentWidth - frameInset * 2),
        useAdvancedWrap: true,
      },
    });
    const statsText = scene.add.text(0, 0, cardStats(config.model), {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.mono,
      fontSize: `${statFontSize}px`,
      fontStyle: 'bold',
      stroke: theme.textStrokeColor,
      strokeThickness: theme.textStrokeThickness,
      align: 'center',
    });
    const stateText = scene.add.text(0, 0, cardState(config.model), {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${Math.max(8, fontSize - 1)}px`,
      fontStyle: 'bold',
      stroke: theme.textStrokeColor,
      strokeThickness: theme.textStrokeThickness,
      align: 'center',
    });

    super(scene, {
      width,
      height,
    });

    scene.add.existing(this);
    this.cardId = config.model.id;
    this.art = art;
    this.frame = frame;
    this.nameText = nameText;
    this.statsText = statsText;
    this.stateText = stateText;
    this.setName(config.model.id);

    this.add(art, { key: 'art', align: 'center', expand: false })
      .add(nameBackground, {
        key: 'name-background',
        align: 'top',
        expand: false,
        padding: { top: frameInset },
      })
      .add(nameText, {
        key: 'name',
        align: 'top',
        expand: false,
        padding: { top: frameInset + Math.round(nameHeight * 0.2) },
      })
      .add(statsBackground, {
        key: 'stats-background',
        align: 'bottom',
        expand: false,
        padding: { bottom: frameInset },
      })
      .add(statsText, {
        key: 'stats',
        align: 'bottom',
        expand: false,
        padding: { bottom: frameInset + Math.round(nameHeight * 0.1) },
      })
      .add(stateText, {
        key: 'state',
        align: 'center',
        expand: false,
      })
      .add(frame, { key: 'frame', align: 'center', expand: false });
  }

  setModel(model: BattleCardViewModel): this {
    if (model.id !== this.cardId) {
      throw new Error(`다른 전투 카드 모델을 기존 view에 적용할 수 없습니다: ${model.id}`);
    }

    this.art.setTexture(model.card.artAssetKey);
    this.frame.setTexture(
      PF2E_ELF_THEME.components.card.frameVariants[model.card.frameVariant].key,
    );
    this.nameText.setText(cardName(model));
    this.statsText.setText(cardStats(model));
    this.stateText.setText(cardState(model));
    return this;
  }
}
