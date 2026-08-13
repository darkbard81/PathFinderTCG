import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { toCardDetail } from '../../dom/screens/card-detail';
import { toCardTile, type CardTile } from '../../dom/screens/card-tile';
import {
  buildCostFilters,
  filterTilesByCost,
  pruneCostFilters,
  toggleCostFilter,
  type CardGridEntry,
} from '../../dom/screens/card-workbench';
import { createGrowthView, type GrowthView } from '../../dom/screens/growth-view';
import {
  calculateCardLevelFromExp,
  calculateMaterialExp,
  consumeCollectionMaterialsForDeckGrowth,
  readCardExp,
} from '../../game/save/card-growth';
import {
  createGameSession,
  type GameSession,
  type RuntimeCardInstance,
  findSessionCard,
} from '../../game/save/session';
import type { CardGrowthRequest } from '../../game/save/types';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

export type GrowthSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  assetBaseUrl: string;
  session: GameSession;
  onBack: (session: GameSession) => void;
  view?: GrowthView;
};

/**
 * 성장 화면이다. 덱 유닛 하나를 고르고 보유 유닛을 재료로 흡수시켜 EXP를 올린다.
 *
 * 재료는 소모되므로 성장 실행은 draft에만 반영하고 저장을 눌러야 확정된다.
 * draft는 미리보기일 뿐이다. 저장할 때는 계산 결과가 아니라 '어느 카드에 어떤 재료를' 목록만 보내고,
 * EXP 계산과 재료 소모는 서버가 자기 저장본 위에서 다시 한다.
 */
export class GrowthScene implements Scene {
  public readonly view = new Container({
    label: 'growth',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly growthView: GrowthView;
  private readonly backdrop = new Graphics({ label: 'growth-backdrop', eventMode: 'none' });
  private readonly shade = new Graphics({ label: 'growth-shade', eventMode: 'none' });
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private savedSession: GameSession;
  private draftSession: GameSession;
  private selectedTargetId: string | null;
  private selectedMaterialIds: ReadonlySet<string> = new Set();
  /** 저장할 때 서버로 보낼 성장 요청이다. 누른 순서대로 쌓고 서버가 그대로 다시 실행한다. */
  private pendingGrowths: CardGrowthRequest[] = [];
  private materialCostFilters: ReadonlySet<number> = new Set();
  private isDirty = false;
  private isSaving = false;
  private active = true;

  public constructor(private readonly options: GrowthSceneOptions) {
    this.savedSession = options.session;
    this.draftSession = options.session;
    this.selectedTargetId = findFirstGrowthTarget(options.session)?.instance.instanceId ?? null;

    this.growthView =
      options.view ??
      createGrowthView({
        onInspect: (instanceId) => this.inspect(instanceId),
        onToggleMaterialCost: (cost) => {
          this.materialCostFilters = toggleCostFilter(this.materialCostFilters, cost);
          this.renderView();
        },
        onGrow: () => this.grow(),
        onClearMaterials: () => {
          this.selectedMaterialIds = new Set();
          this.renderView('재료 선택을 해제했습니다.');
        },
        onSave: () => {
          void this.save();
        },
        onBack: () => {
          if (!this.isSaving) {
            this.options.onBack(this.savedSession);
          }
        },
      });

    this.element = this.growthView.element;
    this.view.addChild(this.backdrop, this.shade);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.isSaving = false;
    this.renderView(
      this.selectedTargetId === null
        ? '성장시킬 덱 유닛이 없습니다.'
        : '재료로 쓸 유닛을 고르세요. 같은 카드를 넣으면 EXP가 10배입니다.',
    );

    await this.ensureBackground();
    if (this.layout) {
      this.layoutBackground(this.layout);
    }
  }

  public exit(): void {
    this.active = false;
  }

  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.layoutBackground(layout);
  }

  private selectTarget(instanceId: string): void {
    if (this.isSaving || this.selectedTargetId === instanceId) {
      return;
    }

    this.selectedTargetId = instanceId;
    // 대상이 바뀌면 같은 카드 10배 보너스가 달라진다. 재료 선택을 유지하면 미리보기가 틀린다.
    this.selectedMaterialIds = new Set();
    this.renderView(`${this.findSelectedTarget()?.instance.name ?? '유닛'}을(를) 선택했습니다.`);
  }

  private toggleMaterial(instanceId: string): void {
    if (this.isSaving) {
      return;
    }

    const next = new Set(this.selectedMaterialIds);
    if (!next.delete(instanceId)) {
      next.add(instanceId);
    }

    this.selectedMaterialIds = next;
    this.renderView();
  }

  private grow(): void {
    const targetId = this.selectedTargetId;
    if (this.isSaving || targetId === null || this.selectedMaterialIds.size === 0) {
      return;
    }

    try {
      const growth: CardGrowthRequest = {
        targetDeckCardInstanceId: targetId,
        materialCollectionCardInstanceIds: [...this.selectedMaterialIds],
      };
      // 화면에 보여 줄 미리보기다. 저장에 쓰이는 값은 아니다.
      const result = consumeCollectionMaterialsForDeckGrowth(this.draftSession, growth);

      this.draftSession = result.session;
      this.pendingGrowths = [...this.pendingGrowths, growth];
      this.selectedMaterialIds = new Set();
      this.isDirty = true;

      const levelUp =
        result.nextLevel > result.previousLevel
          ? ` Lv.${result.previousLevel} → Lv.${result.nextLevel}`
          : '';
      this.renderView(
        `${result.targetCardName}이(가) ${result.totalMaterialExp} EXP를 얻었습니다.${levelUp}`,
      );
    } catch (error: unknown) {
      this.renderView(error instanceof Error ? error.message : String(error), true);
    }
  }

  private async save(): Promise<void> {
    if (this.isSaving || !this.isDirty) {
      return;
    }

    this.isSaving = true;
    this.renderView('성장 결과를 저장하는 중입니다...');

    try {
      const savedState = await this.options.services.saveSlots.grow(
        this.savedSession.slotId,
        this.pendingGrowths,
      );

      if (!this.active) {
        return;
      }

      const savedSession = createGameSession(savedState);
      this.savedSession = savedSession;
      this.draftSession = savedSession;
      this.pendingGrowths = [];
      this.isDirty = false;
      this.isSaving = false;
      this.renderView('성장 결과를 저장했습니다.');
    } catch (error: unknown) {
      if (!this.active) {
        return;
      }

      this.isSaving = false;
      this.renderView(
        `저장에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  private renderView(status = '', statusIsError = false): void {
    const target = this.findSelectedTarget();
    const materialEntries = this.buildMaterialEntries(target);

    this.materialCostFilters = pruneCostFilters(
      this.materialCostFilters,
      materialEntries.map((entry) => entry.tile),
    );
    const visibleMaterials = filterTilesByCost(materialEntries, this.materialCostFilters);
    const targetExp = target ? readCardExp(target) : null;

    this.growthView.render({
      targetName: target?.instance.name ?? '선택 없음',
      targetLevel: targetExp === null ? null : calculateCardLevelFromExp(targetExp),
      targetExp,
      pendingExp: this.calculatePendingExp(target),
      selectedMaterialCount: this.selectedMaterialIds.size,
      target: {
        subtitle: `${this.draftSession.deck.cards.length}장`,
        entries: this.buildTargetEntries(),
        emptyMessage: '덱에 유닛이 없습니다.',
      },
      materials: {
        subtitle:
          visibleMaterials.length === materialEntries.length
            ? `${materialEntries.length}장`
            : `${visibleMaterials.length}/${materialEntries.length}장`,
        entries: visibleMaterials,
        costFilters: buildCostFilters(
          materialEntries.map((entry) => entry.tile),
          this.materialCostFilters,
        ),
        emptyMessage:
          materialEntries.length === 0
            ? '재료로 쓸 유닛이 없습니다.'
            : '필터에 맞는 재료가 없습니다.',
      },
      status,
      statusIsError,
      isDirty: this.isDirty,
      canGrow: target !== null && this.selectedMaterialIds.size > 0,
      busy: this.isSaving,
    });
  }

  private calculatePendingExp(target: RuntimeCardInstance | null): number {
    if (!target) {
      return 0;
    }

    return this.draftSession.collection.cards
      .filter((card) => this.selectedMaterialIds.has(card.instance.instanceId))
      .reduce((total, card) => total + calculateMaterialExp(target, card), 0);
  }

  private buildTargetEntries(): CardGridEntry[] {
    return this.draftSession.deck.cards.map((card) => {
      const tile = this.toTile(card);
      return {
        tile,
        disabled: this.isSaving || card.definition.type !== 'UNIT',
        selected: tile.instanceId === this.selectedTargetId,
        ...(tile.level === null ? {} : { chip: `Lv.${tile.level}` }),
        onClick: () => this.selectTarget(tile.instanceId),
      };
    });
  }

  /** 재료는 컬렉션 UNIT만 가능하다. 같은 카드 정의면 EXP가 10배라 칩으로 미리 알려준다. */
  private buildMaterialEntries(target: RuntimeCardInstance | null): CardGridEntry[] {
    return this.draftSession.collection.cards
      .filter((card) => card.definition.type === 'UNIT')
      .map((card) => {
        const tile = this.toTile(card);
        const materialExp = target ? calculateMaterialExp(target, card) : null;

        return {
          tile,
          disabled: this.isSaving || target === null,
          selected: this.selectedMaterialIds.has(tile.instanceId),
          ...(materialExp === null ? {} : { chip: `+${materialExp}` }),
          ...(target && card.definition.id === target.definition.id
            ? { note: '같은 카드 · EXP 10배' }
            : {}),
          onClick: () => this.toggleMaterial(tile.instanceId),
        };
      });
  }

  private findSelectedTarget(): RuntimeCardInstance | null {
    if (this.selectedTargetId === null) {
      return null;
    }

    return (
      this.draftSession.deck.cards.find(
        (card) => card.instance.instanceId === this.selectedTargetId,
      ) ?? null
    );
  }

  /** 길게 누르기·우클릭으로 연 카드를 상세 패널에 싣는다. */
  private inspect(instanceId: string): void {
    const card = findSessionCard(this.draftSession, instanceId);
    this.growthView.showDetail(card ? toCardDetail(card, this.options.assetBaseUrl) : null);
  }

  private toTile(card: RuntimeCardInstance): CardTile {
    return toCardTile(card, this.options.assetBaseUrl);
  }

  private async ensureBackground(): Promise<void> {
    if (this.background) {
      return;
    }

    try {
      const texture = (await Assets.load({
        alias: TITLE_BACKGROUND_ALIAS,
        src: this.options.backgroundImageUrl,
      })) as Texture;

      if (!this.active) {
        return;
      }

      this.background = new Sprite({
        texture,
        label: 'title-background',
        eventMode: 'none',
      });
      this.view.addChildAt(this.background, 0);
    } catch {
      this.background = null;
    }
  }

  private layoutBackground(layout: ViewportLayout): void {
    if (this.background) {
      this.background.width = layout.width;
      this.background.height = layout.height;
    }

    const { screenDim, screenShade } = UI_THEME.surfaces;

    this.backdrop
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: screenDim.fill.canvas, alpha: screenDim.fillAlpha });

    this.shade
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: screenShade.fill.canvas, alpha: screenShade.fillAlpha });
  }
}

/** 성장 대상은 덱의 UNIT만 가능하다. 첫 후보를 기본 선택으로 쓴다. */
export function findFirstGrowthTarget(session: GameSession): RuntimeCardInstance | null {
  return session.deck.cards.find((card) => card.definition.type === 'UNIT') ?? null;
}
