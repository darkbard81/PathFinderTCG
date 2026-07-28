import type * as Phaser from 'phaser';

import type { StableId } from '../../../game/data/index.js';
import type {
  DiscardDecision,
  EffectFieldDecision,
  ReactiveSkillChoice,
  ReactiveSkillOrderDecision,
} from '../../../game/simulation/battle/index.js';
import { calculatePhaseSevenLayout } from '../../../ui/layout/phaseSevenLayout.js';
import { PF2eBattleChoicePanel } from '../components/PF2eBattleChoicePanel.js';
import type { PF2eGridTableItem } from '../components/PF2eGridTable.js';
import type { BattleDecisionPrompt } from './BattleDecisionCoordinator.js';
import { PF2eButtonsController } from './PF2eButtonsController.js';
import { PF2eGridTableSelectionController } from './PF2eGridTableSelectionController.js';
import { formatBattleFieldPosition } from './battleUiModels.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';

export interface BattleDecisionPromptControllerOptions {
  readonly getCardName?: (cardId: StableId) => string;
}

interface ActivePrompt {
  readonly panel: PF2eBattleChoicePanel;
  readonly cover: Phaser.GameObjects.Rectangle;
  readonly selection: PF2eGridTableSelectionController;
  readonly buttons: PF2eButtonsController;
  reject(error: Error): void;
}

function deterministicReactiveOrder(
  choices: readonly ReactiveSkillChoice[],
): readonly ReactiveSkillChoice[] {
  return Object.freeze(
    [...choices].sort(
      (left, right) =>
        left.skillId.localeCompare(right.skillId) ||
        left.sourceCardId.localeCompare(right.sourceCardId),
    ),
  );
}

export class BattleDecisionPromptController implements BattleDecisionPrompt {
  private readonly scene: Phaser.Scene;
  private readonly getCardName: (cardId: StableId) => string;
  private activePrompt?: ActivePrompt;
  private destroyed = false;

  constructor(scene: Phaser.Scene, options: BattleDecisionPromptControllerOptions = {}) {
    this.scene = scene;
    this.getCardName = options.getCardName ?? ((cardId) => cardId);
  }

  async orderReactiveSkills(
    decision: ReactiveSkillOrderDecision,
  ): Promise<readonly ReactiveSkillChoice[]> {
    if (decision.playerId === 'ENEMY' || decision.choices.length <= 1) {
      return deterministicReactiveOrder(decision.choices);
    }

    const remaining = [...decision.choices];
    const ordered: ReactiveSkillChoice[] = [];

    while (remaining.length > 0) {
      const selectedId = await this.chooseOne(
        '반응 Skill 순서',
        `${ordered.length + 1}번째로 해결할 반응 Skill을 선택하세요.`,
        remaining.map((choice, index) =>
          Object.freeze({
            id: `reactive-${index}`,
            title: this.getCardName(choice.sourceCardId),
            detail: `Skill · ${choice.skillId}`,
          }),
        ),
      );
      const selectedIndex = Number(selectedId.slice('reactive-'.length));
      const selected = remaining[selectedIndex];

      if (selected === undefined) {
        throw new Error('선택한 반응 Skill을 찾을 수 없습니다.');
      }

      ordered.push(selected);
      remaining.splice(selectedIndex, 1);
    }

    return Object.freeze(ordered);
  }

  async chooseEffectField(decision: EffectFieldDecision) {
    const first = decision.legalPositions[0];

    if (first === undefined) {
      throw new Error('선택할 수 있는 합법 Field가 없습니다.');
    }
    if (decision.playerId === 'ENEMY' || decision.legalPositions.length === 1) {
      return first;
    }

    const selectedId = await this.chooseOne(
      decision.effectType === 'PLACE' ? '배치 위치 선택' : '이동 위치 선택',
      `${this.getCardName(decision.targetCardId)} 카드가 이동할 Field를 선택하세요.`,
      decision.legalPositions.map((position) =>
        Object.freeze({
          id: position,
          title: formatBattleFieldPosition(position),
          detail: position,
        }),
      ),
    );
    const selected = decision.legalPositions.find((position) => position === selectedId);

    if (selected === undefined) {
      throw new Error('선택한 Field가 더 이상 합법적이지 않습니다.');
    }

    return selected;
  }

  async chooseDiscardCards(decision: DiscardDecision): Promise<readonly StableId[]> {
    if (decision.playerId === 'ENEMY') {
      return Object.freeze(decision.handCardIds.slice(0, decision.count));
    }

    const remaining = [...decision.handCardIds];
    const selected: StableId[] = [];

    while (selected.length < decision.count) {
      const selectedId = await this.chooseOne(
        '버릴 카드 선택',
        `${decision.count}장 중 ${selected.length + 1}번째 카드를 선택하세요.`,
        remaining.map((cardId) =>
          Object.freeze({
            id: cardId,
            title: this.getCardName(cardId),
            detail: decision.reason === 'HAND_LIMIT' ? '손패 제한' : 'Effect 해결',
          }),
        ),
      );
      const index = remaining.indexOf(selectedId);

      if (index === -1) {
        throw new Error('선택한 버리기 카드를 찾을 수 없습니다.');
      }

      selected.push(selectedId);
      remaining.splice(index, 1);
    }

    return Object.freeze(selected);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.activePrompt?.reject(new Error('전투 결정 화면이 종료되었습니다.'));
    this.closeActivePrompt();
  }

  private chooseOne(
    title: string,
    message: string,
    items: readonly PF2eGridTableItem[],
  ): Promise<string> {
    if (this.destroyed) {
      return Promise.reject(new Error('종료된 전투 결정 화면은 열 수 없습니다.'));
    }
    if (this.activePrompt !== undefined) {
      return Promise.reject(new Error('전투 결정 화면은 한 번에 하나만 열 수 있습니다.'));
    }
    if (items.length === 0) {
      return Promise.reject(new Error('선택할 전투 결정 항목이 없습니다.'));
    }

    const layout = calculatePhaseSevenLayout(
      this.scene.scale.gameSize.width,
      this.scene.scale.gameSize.height,
    );
    const theme = PF2E_ELF_THEME.components.phaseSeven;
    const cover = this.scene.add
      .rectangle(
        this.scene.scale.gameSize.width / 2,
        this.scene.scale.gameSize.height / 2,
        this.scene.scale.gameSize.width,
        this.scene.scale.gameSize.height,
        PF2E_ELF_THEME.colors.modalCover,
        theme.modalCoverAlpha,
      )
      .setDepth(theme.modalDepth)
      .setInteractive();
    const panel = new PF2eBattleChoicePanel(this.scene, {
      width: layout.choicePanelWidth,
      height: layout.choicePanelHeight,
      title,
      message,
      items,
    })
      .setPosition(this.scene.scale.gameSize.width / 2, this.scene.scale.gameSize.height / 2)
      .setDepth(theme.modalDepth + 1)
      .layout();
    this.scene.game.canvas.dataset.decisionPrompt = 'true';

    return new Promise<string>((resolve, reject) => {
      let selectedId: string | undefined;
      let settling = false;
      const selection = new PF2eGridTableSelectionController(panel.table, {
        items,
        onSelectionChange: (item) => {
          selectedId = item.id;
          panel.setStatus(`${item.title} 선택됨`);
        },
      });
      const buttons = new PF2eButtonsController(panel.buttons, {
        onButtonClick: () => {
          if (settling) {
            return;
          }
          if (selectedId === undefined) {
            panel.setStatus('먼저 항목을 선택하세요.', true);
            return;
          }

          settling = true;
          const confirmedId = selectedId;
          setTimeout(() => {
            if (this.activePrompt?.panel !== panel) {
              return;
            }

            this.closeActivePrompt();
            resolve(confirmedId);
          }, 0);
        },
      });
      this.activePrompt = {
        panel,
        cover,
        selection,
        buttons,
        reject,
      };
    });
  }

  private closeActivePrompt(): void {
    const prompt = this.activePrompt;

    if (prompt === undefined) {
      return;
    }

    this.activePrompt = undefined;
    this.scene.game.canvas.dataset.decisionPrompt = 'false';
    prompt.selection.destroy();
    prompt.buttons.destroy();
    prompt.panel.setVisible(false);
    prompt.cover.destroy();
    setTimeout(() => {
      if (prompt.panel.scene !== undefined) {
        prompt.panel.destroy();
      }
    }, 250);
  }
}
