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
import { createEquipmentView, type EquipmentView } from '../../dom/screens/equipment-view';
import {
  equipCollectionEquipmentToDeckUnit,
  listEquippedCardsForTarget,
  readSlotCapacity,
  readSlotUsage,
  unequipEquipmentFromDeckUnit,
} from '../../game/save/equipment';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
  type RuntimeCardInstance,
  findSessionCard,
} from '../../game/save/session';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

export type EquipmentSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  assetBaseUrl: string;
  session: GameSession;
  onBack: (session: GameSession) => void;
  view?: EquipmentView;
};

/**
 * 장비 화면이다. 덱 유닛 하나를 고르고 보유 장비를 붙이거나 뗀다.
 * 장착은 카드 이동이 아니라 저장 슬롯의 장착표 변경이라 저장을 눌러야 반영된다.
 */
export class EquipmentScene implements Scene {
  public readonly view = new Container({
    label: 'equipment',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly equipmentView: EquipmentView;
  private readonly backdrop = new Graphics({ label: 'equipment-backdrop', eventMode: 'none' });
  private readonly shade = new Graphics({ label: 'equipment-shade', eventMode: 'none' });
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private savedSession: GameSession;
  private draftSession: GameSession;
  private selectedUnitId: string | null;
  private availableCostFilters: ReadonlySet<number> = new Set();
  private isDirty = false;
  private isSaving = false;
  private active = true;

  public constructor(private readonly options: EquipmentSceneOptions) {
    this.savedSession = options.session;
    this.draftSession = options.session;
    this.selectedUnitId = options.session.deck.cards[0]?.instance.instanceId ?? null;

    this.equipmentView =
      options.view ??
      createEquipmentView({
        onInspect: (instanceId) => this.inspect(instanceId),
        onToggleAvailableCost: (cost) => {
          this.availableCostFilters = toggleCostFilter(this.availableCostFilters, cost);
          this.renderView();
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

    this.element = this.equipmentView.element;
    this.view.addChild(this.backdrop, this.shade);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.isSaving = false;
    this.renderView(
      this.selectedUnitId === null ? '덱에 장비를 붙일 유닛이 없습니다.' : '장비를 고르세요.',
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

  private selectUnit(instanceId: string): void {
    if (this.isSaving || this.selectedUnitId === instanceId) {
      return;
    }

    this.selectedUnitId = instanceId;
    this.renderView(`${this.findSelectedUnit()?.instance.name ?? '유닛'}을(를) 선택했습니다.`);
  }

  private equip(equipmentInstanceId: string): void {
    const targetId = this.selectedUnitId;
    if (this.isSaving || targetId === null) {
      this.renderView('먼저 장비를 붙일 유닛을 고르세요.', true);
      return;
    }

    this.applyMutation(
      () =>
        equipCollectionEquipmentToDeckUnit(this.draftSession, {
          targetDeckCardInstanceId: targetId,
          equipmentCardInstanceId: equipmentInstanceId,
        }),
      '장비를 장착했습니다.',
    );
  }

  private unequip(equipmentInstanceId: string): void {
    const targetId = this.selectedUnitId;
    if (this.isSaving || targetId === null) {
      return;
    }

    this.applyMutation(
      () =>
        unequipEquipmentFromDeckUnit(this.draftSession, {
          targetDeckCardInstanceId: targetId,
          equipmentCardInstanceId: equipmentInstanceId,
        }),
      '장비를 해제했습니다.',
    );
  }

  /** 슬롯 초과와 능력 중복은 도메인이 예외로 막는다. 실패해도 draft는 그대로 둔다. */
  private applyMutation(mutate: () => GameSession, successMessage: string): void {
    try {
      this.draftSession = mutate();
      this.isDirty = true;
      this.renderView(successMessage);
    } catch (error: unknown) {
      this.renderView(error instanceof Error ? error.message : String(error), true);
    }
  }

  private async save(): Promise<void> {
    if (this.isSaving || !this.isDirty) {
      return;
    }

    this.isSaving = true;
    this.renderView('장비를 저장하는 중입니다...');

    try {
      const savedState = await this.options.services.saveSlots.save(
        createSaveSlotStateFromGameSession(this.draftSession),
      );

      if (!this.active) {
        return;
      }

      const savedSession = createGameSession(savedState);
      this.savedSession = savedSession;
      this.draftSession = savedSession;
      this.isDirty = false;
      this.isSaving = false;
      this.renderView('장비를 저장했습니다.');
    } catch (error: unknown) {
      if (!this.active) {
        return;
      }

      this.isSaving = false;
      this.renderView(
        `장비 저장에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  private renderView(status = '', statusIsError = false): void {
    const selectedUnit = this.findSelectedUnit();
    const equippedCards = selectedUnit
      ? listEquippedCardsForTarget(this.draftSession, selectedUnit.instance.instanceId)
      : [];
    const availableEntries = this.buildAvailableEntries();

    this.availableCostFilters = pruneCostFilters(
      this.availableCostFilters,
      availableEntries.map((entry) => entry.tile),
    );
    const visibleAvailable = filterTilesByCost(availableEntries, this.availableCostFilters);

    this.equipmentView.render({
      targetName: selectedUnit?.instance.name ?? '선택 없음',
      slotUsage: selectedUnit
        ? {
            used: equippedCards.reduce((total, card) => total + readSlotUsage(card), 0),
            capacity: readSlotCapacity(selectedUnit),
          }
        : null,
      units: {
        subtitle: `${this.draftSession.deck.cards.length}장`,
        entries: this.buildUnitEntries(),
        emptyMessage: '덱에 유닛이 없습니다.',
      },
      equipped: {
        entries: equippedCards.map((card) => {
          const tile = this.toTile(card);
          return {
            tile,
            disabled: this.isSaving,
            note: '누르면 해제',
            onClick: () => this.unequip(tile.instanceId),
          };
        }),
        emptyMessage: selectedUnit ? '장착한 장비가 없습니다.' : '유닛을 먼저 고르세요.',
      },
      available: {
        subtitle:
          visibleAvailable.length === availableEntries.length
            ? `${availableEntries.length}장`
            : `${visibleAvailable.length}/${availableEntries.length}장`,
        entries: visibleAvailable,
        costFilters: buildCostFilters(
          availableEntries.map((entry) => entry.tile),
          this.availableCostFilters,
        ),
        emptyMessage:
          availableEntries.length === 0
            ? '보유한 장비가 없습니다.'
            : '필터에 맞는 장비가 없습니다.',
      },
      status,
      statusIsError,
      isDirty: this.isDirty,
      busy: this.isSaving,
    });
  }

  private buildUnitEntries(): CardGridEntry[] {
    return this.draftSession.deck.cards.map((card) => {
      const tile = this.toTile(card);
      const equippedCount = listEquippedCardsForTarget(this.draftSession, tile.instanceId).length;

      return {
        tile,
        disabled: this.isSaving,
        selected: tile.instanceId === this.selectedUnitId,
        ...(equippedCount > 0 ? { chip: `장비 ${equippedCount}` } : {}),
        onClick: () => this.selectUnit(tile.instanceId),
      };
    });
  }

  /** 아직 어디에도 장착되지 않은 보유 장비만 후보로 삼는다. */
  private buildAvailableEntries(): CardGridEntry[] {
    const equippedIds = new Set(
      this.draftSession.equipment.equipped.map((attachment) => attachment.equipmentCardInstanceId),
    );

    return this.draftSession.collection.cards
      .filter(
        (card) =>
          card.definition.type === 'EQUIPMENT' && !equippedIds.has(card.instance.instanceId),
      )
      .map((card) => {
        const tile = this.toTile(card);
        return {
          tile,
          disabled: this.isSaving || this.selectedUnitId === null,
          note: `슬롯 ${readSlotUsage(card)} 사용`,
          onClick: () => this.equip(tile.instanceId),
        };
      });
  }

  private findSelectedUnit(): RuntimeCardInstance | null {
    if (this.selectedUnitId === null) {
      return null;
    }

    return (
      this.draftSession.deck.cards.find(
        (card) => card.instance.instanceId === this.selectedUnitId,
      ) ?? null
    );
  }

  /** 길게 누르기·우클릭으로 연 카드를 상세 패널에 싣는다. */
  private inspect(instanceId: string): void {
    const card = findSessionCard(this.draftSession, instanceId);
    this.equipmentView.showDetail(card ? toCardDetail(card, this.options.assetBaseUrl) : null);
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
