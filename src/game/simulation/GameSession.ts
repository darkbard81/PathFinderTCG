import type { CardDefinition } from '../cards/card.js';
import { createCardDisplayModel, type CardDisplayModel } from '../cards/cardDisplay.js';
import {
  ENEMY_TEST_DECK_BLUEPRINT,
  STAGE_CATALOG,
  TEST_CARD_CATALOG,
  type StageCatalogEntry,
} from '../content/index.js';
import {
  validatePlayableSavedDeck,
  type CardCatalog,
  type CompletedStageRun,
  type EnemyDeckBlueprint,
  type SaveSlotState,
  type SavedDeck,
  type StableId,
  type StageRunResult,
  type StartedStageRun,
} from '../data/index.js';
import {
  PathfinderApiClient,
  PathfinderApiError,
  type AuthenticatedUser,
  type PathfinderGameApi,
  type SaveSlotId,
  type SaveSlotSummary,
} from '../client/PathfinderApiClient.js';
import { BattleDeckFactory, type BattleIdRequest } from './BattleDeckFactory.js';
import {
  BattleSession,
  chooseBattleAiAction,
  type ActionResolution,
  type BattleAction,
  type BattleDecisionProvider,
  type BattleResult,
  type BattleState,
} from './battle/index.js';

export interface GameSessionContent {
  readonly cardCatalog: CardCatalog;
  readonly stages: readonly StageCatalogEntry[];
  readonly enemyDeckBlueprints: readonly EnemyDeckBlueprint[];
}

export const DEFAULT_GAME_SESSION_CONTENT: GameSessionContent = Object.freeze({
  cardCatalog: TEST_CARD_CATALOG,
  stages: STAGE_CATALOG,
  enemyDeckBlueprints: Object.freeze([ENEMY_TEST_DECK_BLUEPRINT]),
});

export interface EarnedStageReward {
  readonly cardInstanceId: StableId;
  readonly card: CardDisplayModel;
}

export interface CompletedClientBattle {
  readonly result: Exclude<BattleResult, { readonly type: 'ONGOING' }>;
  readonly finalState: BattleState;
  readonly stage: StageCatalogEntry;
  readonly stageRun: CompletedStageRun;
  readonly reward: EarnedStageReward | null;
}

export interface GameState {
  readonly user: AuthenticatedUser | null;
  readonly saveSlots: readonly SaveSlotSummary[];
  readonly activeSaveSlot: SaveSlotState | null;
  readonly activeStageRun: StartedStageRun | null;
  readonly battleState: BattleState | null;
  readonly lastBattle: CompletedClientBattle | null;
}

export type GameStateListener = (state: GameState) => void;

const INITIAL_STATE: GameState = Object.freeze({
  user: null,
  saveSlots: Object.freeze([]),
  activeSaveSlot: null,
  activeStageRun: null,
  battleState: null,
  lastBattle: null,
});

function freezeState(state: GameState): GameState {
  return Object.freeze({
    ...state,
    saveSlots: Object.freeze([...state.saveSlots]),
  });
}

function createBattleIdFactory(runId: StableId): (request: BattleIdRequest) => StableId {
  let sequence = 0;

  return (request) => {
    const id = `stage-${runId}-${request.kind.toLowerCase()}-${request.sourceId}-${
      request.ordinal
    }-${sequence}`;
    sequence += 1;
    return id;
  };
}

function requireSelectedDeck(saveSlot: SaveSlotState): SavedDeck {
  const selectedDeck = saveSlot.decks.find((deck) => deck.id === saveSlot.selectedDeckId);

  if (selectedDeck === undefined) {
    throw new Error('선택된 저장 덱을 찾을 수 없습니다.');
  }

  return selectedDeck;
}

function toStageRunResult(
  result: Exclude<BattleResult, { readonly type: 'ONGOING' }>,
): StageRunResult {
  if (result.type === 'DRAW') {
    return 'DRAW';
  }

  return result.winnerId === 'PLAYER' ? 'WIN' : 'LOSS';
}

export class GameSession {
  private readonly api: PathfinderGameApi;
  private readonly content: GameSessionContent;
  private state: GameState = INITIAL_STATE;
  private battleSession: BattleSession | null = null;
  private readonly listeners = new Set<GameStateListener>();

  constructor(
    api: PathfinderGameApi = new PathfinderApiClient(),
    content: GameSessionContent = DEFAULT_GAME_SESSION_CONTENT,
  ) {
    this.api = api;
    this.content = Object.freeze({
      cardCatalog: Object.freeze({
        cardDefinitions: Object.freeze([...content.cardCatalog.cardDefinitions]),
        cardPresentations: Object.freeze([...content.cardCatalog.cardPresentations]),
      }),
      stages: Object.freeze([...content.stages]),
      enemyDeckBlueprints: Object.freeze([...content.enemyDeckBlueprints]),
    });
  }

  getState(): GameState {
    return freezeState(this.state);
  }

  getCardDefinitions(): readonly CardDefinition[] {
    return this.content.cardCatalog.cardDefinitions;
  }

  getCardPresentations(): CardCatalog['cardPresentations'] {
    return this.content.cardCatalog.cardPresentations;
  }

  getStages(): readonly StageCatalogEntry[] {
    return this.content.stages;
  }

  getAvailableStages(): readonly StageCatalogEntry[] {
    const saveSlot = this.state.activeSaveSlot;

    if (saveSlot === null) {
      return Object.freeze([]);
    }

    return Object.freeze(
      this.content.stages.filter((stage) =>
        saveSlot.progress.unlockedStageIds.includes(stage.definition.id),
      ),
    );
  }

  getStage(stageId: StableId): StageCatalogEntry {
    const stage = this.content.stages.find((candidate) => candidate.definition.id === stageId);

    if (stage === undefined) {
      throw new Error(`클라이언트 콘텐츠에 없는 Stage입니다: ${stageId}`);
    }

    return stage;
  }

  async restoreAuthentication(): Promise<boolean> {
    try {
      const user = await this.api.getAuthenticatedUser();
      this.updateState({
        user,
        saveSlots: Object.freeze([]),
        activeSaveSlot: null,
        activeStageRun: null,
        battleState: null,
        lastBattle: null,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof PathfinderApiError && error.code === 'UNAUTHENTICATED') {
        this.reset();
        return false;
      }

      throw error;
    }
  }

  async registerAndLogin(username: string, password: string): Promise<AuthenticatedUser> {
    await this.api.register(username, password);
    return this.login(username, password);
  }

  async login(username: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.api.login(username, password);
    this.battleSession = null;
    this.updateState({
      user,
      saveSlots: Object.freeze([]),
      activeSaveSlot: null,
      activeStageRun: null,
      battleState: null,
      lastBattle: null,
    });
    return user;
  }

  async logout(): Promise<void> {
    await this.api.logout();
    this.reset();
  }

  async refreshSaveSlots(): Promise<readonly SaveSlotSummary[]> {
    this.requireUser();
    const saveSlots = await this.api.listSaveSlots();
    this.updateState({
      ...this.state,
      saveSlots,
    });
    return saveSlots;
  }

  async createSaveSlot(slotId: SaveSlotId): Promise<SaveSlotState> {
    this.requireUser();
    const saveSlot = await this.api.createSaveSlot(slotId);
    this.battleSession = null;
    this.updateState({
      ...this.state,
      activeSaveSlot: saveSlot,
      activeStageRun: null,
      battleState: null,
      lastBattle: null,
    });
    await this.refreshSaveSlots();
    return saveSlot;
  }

  async openSaveSlot(slotId: SaveSlotId): Promise<SaveSlotState> {
    this.requireUser();
    const saveSlot = await this.api.getSaveSlot(slotId);
    this.battleSession = null;
    this.updateState({
      ...this.state,
      activeSaveSlot: saveSlot,
      activeStageRun: null,
      battleState: null,
      lastBattle: null,
    });
    return saveSlot;
  }

  async saveDeck(deck: SavedDeck): Promise<SaveSlotState> {
    const saveSlot = this.requireActiveSaveSlot();
    const updated = await this.api.updateDeck(saveSlot.slotId, deck.id, deck);
    this.updateState({
      ...this.state,
      activeSaveSlot: updated,
    });
    await this.refreshSaveSlots();
    return updated;
  }

  async deleteSaveSlot(slotId: SaveSlotId): Promise<void> {
    this.requireUser();
    await this.api.deleteSaveSlot(slotId);
    const activeSaveSlot =
      this.state.activeSaveSlot?.slotId === slotId ? null : this.state.activeSaveSlot;

    if (activeSaveSlot === null) {
      this.battleSession = null;
    }

    this.updateState({
      ...this.state,
      activeSaveSlot,
      activeStageRun: activeSaveSlot === null ? null : this.state.activeStageRun,
      battleState: activeSaveSlot === null ? null : this.state.battleState,
      lastBattle: activeSaveSlot === null ? null : this.state.lastBattle,
    });
    await this.refreshSaveSlots();
  }

  getSelectedDeck(): SavedDeck {
    return requireSelectedDeck(this.requireActiveSaveSlot());
  }

  canStartBattle(): boolean {
    const firstStage = this.getAvailableStages()[0];
    return firstStage !== undefined && this.canStartStage(firstStage.definition.id);
  }

  canStartStage(stageId: StableId): boolean {
    const saveSlot = this.state.activeSaveSlot;

    if (
      saveSlot === null ||
      !saveSlot.progress.unlockedStageIds.includes(stageId) ||
      !this.content.stages.some((stage) => stage.definition.id === stageId)
    ) {
      return false;
    }

    const deck = saveSlot.decks.find((candidate) => candidate.id === saveSlot.selectedDeckId);

    return (
      deck !== undefined &&
      validatePlayableSavedDeck(deck, {
        collection: saveSlot.collection,
        cardDefinitions: this.content.cardCatalog.cardDefinitions,
      }).valid
    );
  }

  async startStageBattle(stageId: StableId): Promise<BattleState> {
    const saveSlot = this.requireActiveSaveSlot();
    const stage = this.getStage(stageId);

    if (!saveSlot.progress.unlockedStageIds.includes(stage.definition.id)) {
      throw new Error(`아직 해금되지 않은 Stage입니다: ${stage.definition.id}`);
    }

    const deck = requireSelectedDeck(saveSlot);
    const validation = validatePlayableSavedDeck(deck, {
      collection: saveSlot.collection,
      cardDefinitions: this.content.cardCatalog.cardDefinitions,
    });

    if (!validation.valid) {
      throw new Error('합법적인 30장 덱만 Stage를 시작할 수 있습니다.');
    }

    const enemyBlueprint = this.content.enemyDeckBlueprints.find(
      (blueprint) => blueprint.id === stage.definition.enemyDeckBlueprintId,
    );
    if (enemyBlueprint === undefined) {
      throw new Error(
        `Stage가 참조하는 적 덱 청사진을 찾을 수 없습니다: ${stage.definition.enemyDeckBlueprintId}`,
      );
    }

    const stageRun = await this.api.startStageRun(saveSlot.slotId, stage.definition.id);
    if (stageRun.stageId !== stage.definition.id) {
      throw new Error(
        `서버가 다른 Stage 실행을 반환했습니다: ${stageRun.stageId} != ${stage.definition.id}`,
      );
    }

    const factory = new BattleDeckFactory(
      this.content.cardCatalog.cardDefinitions,
      createBattleIdFactory(stageRun.runId),
    );
    const playerDeck = factory.createFromSavedDeck(deck, saveSlot.collection, stageRun.seed);
    const enemySeed = (stageRun.seed ^ 0x9e37_79b9) >>> 0;
    const enemyDeck = factory.createFromEnemyDeckBlueprint(enemyBlueprint, enemySeed);
    this.battleSession = BattleSession.create({
      seed: stageRun.seed,
      playerDeck,
      enemyDeck,
      cardDefinitions: this.content.cardCatalog.cardDefinitions,
      firstPlayerId: 'PLAYER',
    });
    const battleState = this.battleSession.getState();
    this.updateState({
      ...this.state,
      activeStageRun: stageRun,
      battleState,
      lastBattle: null,
    });
    return battleState;
  }

  getLegalBattleActions(): readonly BattleAction[] {
    return this.requireBattleSession().getLegalActions();
  }

  simulateBattleAction(action: BattleAction, decisions: BattleDecisionProvider): ActionResolution {
    return this.requireBattleSession().simulateAction(action, decisions);
  }

  resolveBattleAction(action: BattleAction, decisions: BattleDecisionProvider): ActionResolution {
    const resolution = this.requireBattleSession().resolveAction(action, decisions);
    this.updateState({
      ...this.state,
      battleState: resolution.finalState,
    });
    return resolution;
  }

  chooseEnemyBattleAction(): BattleAction {
    const battle = this.requireBattleSession();
    const state = battle.getState();

    if (state.activePlayerId !== 'ENEMY') {
      throw new Error('적 턴이 아닐 때 AI Action을 선택할 수 없습니다.');
    }

    return chooseBattleAiAction(state, this.content.cardCatalog.cardDefinitions);
  }

  async completeStageBattle(): Promise<CompletedClientBattle> {
    const saveSlot = this.requireActiveSaveSlot();
    const activeStageRun = this.requireActiveStageRun();
    const finalState = this.requireBattleSession().getState();

    if (finalState.result.type === 'ONGOING') {
      throw new Error('진행 중인 전투를 완료 처리할 수 없습니다.');
    }

    const result = toStageRunResult(finalState.result);
    const receipt = await this.api.completeStageRun(saveSlot.slotId, activeStageRun.runId, result);
    if (
      receipt.stageRun.runId !== activeStageRun.runId ||
      receipt.stageRun.stageId !== activeStageRun.stageId ||
      receipt.stageRun.result !== result
    ) {
      throw new Error('서버 Stage 실행 완료 영수증이 현재 전투 결과와 일치하지 않습니다.');
    }

    const stage = this.getStage(activeStageRun.stageId);
    const reward = this.createEarnedReward(receipt.saveSlot, receipt.stageRun.rewardCardInstanceId);
    const completed: CompletedClientBattle = Object.freeze({
      result: finalState.result,
      finalState,
      stage,
      stageRun: receipt.stageRun,
      reward,
    });
    this.battleSession = null;
    this.updateState({
      ...this.state,
      activeSaveSlot: receipt.saveSlot,
      activeStageRun: null,
      battleState: null,
      lastBattle: completed,
    });
    return completed;
  }

  async abandonStageBattle(): Promise<void> {
    const saveSlot = this.requireActiveSaveSlot();
    const activeStageRun = this.requireActiveStageRun();
    const receipt = await this.api.completeStageRun(saveSlot.slotId, activeStageRun.runId, 'LOSS');

    if (
      receipt.stageRun.runId !== activeStageRun.runId ||
      receipt.stageRun.stageId !== activeStageRun.stageId ||
      receipt.stageRun.result !== 'LOSS' ||
      receipt.stageRun.rewardCardInstanceId !== null
    ) {
      throw new Error('서버 Stage 포기 영수증이 현재 실행과 일치하지 않습니다.');
    }

    this.battleSession = null;
    this.updateState({
      ...this.state,
      activeSaveSlot: receipt.saveSlot,
      activeStageRun: null,
      battleState: null,
      lastBattle: null,
    });
  }

  subscribe(listener: GameStateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private createEarnedReward(
    saveSlot: SaveSlotState,
    rewardCardInstanceId: StableId | null,
  ): EarnedStageReward | null {
    if (rewardCardInstanceId === null) {
      return null;
    }

    const instance = saveSlot.collection.cardInstances.find(
      (candidate) => candidate.id === rewardCardInstanceId,
    );
    if (instance === undefined) {
      throw new Error(`보상 카드 인스턴스를 컬렉션에서 찾을 수 없습니다: ${rewardCardInstanceId}`);
    }

    const definition = this.content.cardCatalog.cardDefinitions.find(
      (candidate) => candidate.id === instance.cardDefinitionId,
    );
    const presentation = this.content.cardCatalog.cardPresentations.find(
      (candidate) => candidate.cardDefinitionId === instance.cardDefinitionId,
    );
    if (definition === undefined || presentation === undefined) {
      throw new Error(`보상 카드 콘텐츠를 찾을 수 없습니다: ${instance.cardDefinitionId}`);
    }

    return Object.freeze({
      cardInstanceId: instance.id,
      card: createCardDisplayModel(definition, presentation),
    });
  }

  private reset(): void {
    this.battleSession = null;
    this.updateState(INITIAL_STATE);
  }

  private requireUser(): AuthenticatedUser {
    if (this.state.user === null) {
      throw new Error('로그인된 사용자가 없습니다.');
    }

    return this.state.user;
  }

  private requireActiveSaveSlot(): SaveSlotState {
    this.requireUser();

    if (this.state.activeSaveSlot === null) {
      throw new Error('선택된 세이브 슬롯이 없습니다.');
    }

    return this.state.activeSaveSlot;
  }

  private requireActiveStageRun(): StartedStageRun {
    if (this.state.activeStageRun === null) {
      throw new Error('진행 중인 Stage 실행이 없습니다.');
    }

    return this.state.activeStageRun;
  }

  private requireBattleSession(): BattleSession {
    if (this.battleSession === null) {
      throw new Error('진행 중인 전투가 없습니다.');
    }

    return this.battleSession;
  }

  private updateState(state: GameState): void {
    this.state = freezeState(state);
    const snapshot = this.getState();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
