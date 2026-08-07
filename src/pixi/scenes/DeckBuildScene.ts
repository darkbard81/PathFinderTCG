import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { toCardTile, type CardTile } from '../../dom/screens/card-tile';
import {
  buildCostFilters,
  filterTilesByCost,
  pruneCostFilters,
  toggleCostFilter,
  type CardGridEntry,
} from '../../dom/screens/card-workbench';
import {
  createDeckBuildView,
  toDeckBuildEntry,
  type DeckBuildMode,
  type DeckBuildPanelModel,
  type DeckBuildView,
} from '../../dom/screens/deck-build-view';
import {
  changeDeckLeaderWithCollectionLeader,
  moveCollectionUnitToDeck,
  moveDeckUnitToCollection,
} from '../../game/save/deck-building';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
} from '../../game/save/session';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

export type DeckBuildSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  assetBaseUrl: string;
  session: GameSession;
  /** 저장된 세션을 돌려준다. 저장하지 않았으면 들어올 때의 세션 그대로다. */
  onBack: (session: GameSession) => void;
  view?: DeckBuildView;
};

/**
 * 덱 구성 화면이다. UNIT 모드는 덱과 수집품 사이 유닛을 옮기고, LEADER 모드는 리더를 교체한다.
 * 편집은 draft 세션에만 적용하고, 저장을 눌러야 서버 상태가 바뀐다.
 */
export class DeckBuildScene implements Scene {
  public readonly view = new Container({
    label: 'deck-build',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly deckBuildView: DeckBuildView;
  private readonly backdrop = new Graphics({ label: 'deck-build-backdrop', eventMode: 'none' });
  private readonly shade = new Graphics({ label: 'deck-build-shade', eventMode: 'none' });
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private savedSession: GameSession;
  private draftSession: GameSession;
  private mode: DeckBuildMode = 'UNIT';
  private deckCostFilters: ReadonlySet<number> = new Set();
  private collectionCostFilters: ReadonlySet<number> = new Set();
  private isDirty = false;
  private isSaving = false;
  private active = true;

  public constructor(private readonly options: DeckBuildSceneOptions) {
    this.savedSession = options.session;
    this.draftSession = options.session;

    this.deckBuildView =
      options.view ??
      createDeckBuildView({
        onSelectMode: (mode) => this.selectMode(mode),
        onToggleDeckCost: (cost) => {
          this.deckCostFilters = toggleCostFilter(this.deckCostFilters, cost);
          this.renderView();
        },
        onToggleCollectionCost: (cost) => {
          this.collectionCostFilters = toggleCostFilter(this.collectionCostFilters, cost);
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

    this.element = this.deckBuildView.element;
    this.view.addChild(this.backdrop, this.shade);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.isSaving = false;
    this.renderView('덱에 넣을 카드를 고르세요.');

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

  private selectMode(mode: DeckBuildMode): void {
    if (this.isSaving || this.mode === mode) {
      return;
    }

    this.mode = mode;
    // 모드가 바뀌면 다루는 카드 집합 자체가 달라진다. 이전 모드의 코스트 필터는 의미가 없다.
    this.deckCostFilters = new Set();
    this.collectionCostFilters = new Set();
    this.renderView(mode === 'UNIT' ? '유닛을 편집합니다.' : '교체할 리더를 고르세요.');
  }

  private handleDeckCardClick(instanceId: string): void {
    if (this.isSaving) {
      return;
    }

    if (this.mode === 'LEADER') {
      this.renderView('리더는 수집품의 다른 리더로만 교체할 수 있습니다.', true);
      return;
    }

    this.applyMutation(
      () => moveDeckUnitToCollection(this.draftSession, { deckCardInstanceId: instanceId }),
      '카드를 수집품으로 옮겼습니다.',
    );
  }

  private handleCollectionCardClick(instanceId: string): void {
    if (this.isSaving) {
      return;
    }

    if (this.mode === 'LEADER') {
      this.applyMutation(
        () =>
          changeDeckLeaderWithCollectionLeader(this.draftSession, {
            collectionLeaderInstanceId: instanceId,
          }),
        '리더를 교체했습니다.',
      );
      return;
    }

    this.applyMutation(
      () => moveCollectionUnitToDeck(this.draftSession, { collectionCardInstanceId: instanceId }),
      '카드를 덱에 넣었습니다.',
    );
  }

  /** 도메인 함수는 규칙 위반 시 예외를 던진다. 실패해도 draft는 이전 상태를 유지한다. */
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
    this.renderView('덱을 저장하는 중입니다...');

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
      this.renderView('덱을 저장했습니다.');
    } catch (error: unknown) {
      if (!this.active) {
        return;
      }

      this.isSaving = false;
      this.renderView(
        `덱 저장에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  private renderView(status = '', statusIsError = false): void {
    const deckEntries = this.buildDeckEntries();
    const collectionEntries = this.buildCollectionEntries();

    // 옮긴 카드 때문에 사라진 코스트는 필터에서 뺀다. 버튼 없이 필터만 남으면 해제할 수 없다.
    this.deckCostFilters = pruneCostFilters(
      this.deckCostFilters,
      deckEntries.map((entry) => entry.tile),
    );
    this.collectionCostFilters = pruneCostFilters(
      this.collectionCostFilters,
      collectionEntries.map((entry) => entry.tile),
    );

    this.deckBuildView.render({
      mode: this.mode,
      saveName: this.draftSession.saveName,
      leaderName: this.draftSession.deck.leader.definition.name,
      deckCardCount: this.draftSession.deck.cards.length,
      deck: this.buildPanelModel(
        this.mode === 'UNIT' ? '내 덱' : '현재 리더',
        deckEntries,
        this.deckCostFilters,
        this.mode === 'UNIT' ? '덱이 비어 있습니다.' : '리더가 없습니다.',
      ),
      collection: this.buildPanelModel(
        '수집품',
        collectionEntries,
        this.collectionCostFilters,
        this.mode === 'UNIT' ? '보유한 유닛이 없습니다.' : '보유한 리더가 없습니다.',
      ),
      status,
      statusIsError,
      isDirty: this.isDirty,
      busy: this.isSaving,
    });
  }

  private buildPanelModel(
    title: string,
    entries: CardGridEntry[],
    activeCosts: ReadonlySet<number>,
    emptyMessage: string,
  ): DeckBuildPanelModel {
    const visible = filterTilesByCost(entries, activeCosts);

    return {
      title,
      subtitle:
        visible.length === entries.length
          ? `${entries.length}장`
          : `${visible.length}/${entries.length}장`,
      entries: visible,
      costFilters: buildCostFilters(
        entries.map((entry) => entry.tile),
        activeCosts,
      ),
      emptyMessage: entries.length === 0 ? emptyMessage : '필터에 맞는 카드가 없습니다.',
    };
  }

  private buildDeckEntries(): CardGridEntry[] {
    if (this.mode === 'LEADER') {
      // 리더는 클릭으로 제거할 수 없다. 교체는 수집품 쪽에서만 일어난다.
      return [toDeckBuildEntry(this.toTile(this.draftSession.deck.leader), false, () => undefined)];
    }

    return this.draftSession.deck.cards.map((card) => {
      const tile = this.toTile(card);
      return toDeckBuildEntry(tile, true, () => this.handleDeckCardClick(tile.instanceId));
    });
  }

  private buildCollectionEntries(): CardGridEntry[] {
    const wantedType = this.mode === 'UNIT' ? 'UNIT' : 'LEADER';

    return this.draftSession.collection.cards
      .filter((card) => card.definition.type === wantedType)
      .map((card) => {
        const tile = this.toTile(card);
        return toDeckBuildEntry(tile, true, () => this.handleCollectionCardClick(tile.instanceId));
      });
  }

  private toTile(card: Parameters<typeof toCardTile>[0]): CardTile {
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
