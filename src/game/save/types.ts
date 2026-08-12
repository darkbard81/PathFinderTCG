import type { CardDefinition } from './card-catalog';
import type { LobbyState } from '../lobby/lobby-state';
import type { ResourceState } from '../resources/resource-state';
import type { StageProgressState } from '../stage/types';

export const SAVE_SLOT_SCHEMA_VERSION = 10 as const;

export type SaveSlotId = 1 | 2 | 3;

export const SAVE_SLOT_IDS: SaveSlotId[] = [1, 2, 3];

export type CardOwner = 'PLAYER' | 'ENEMY';

export type CardInstanceZone = 'LEADER' | 'DECK' | 'COLLECTION';

export type CardInstance = CardDefinition & {
  instanceId: string;
  owner: CardOwner;
  zone: CardInstanceZone;
};

export type DeckInstance = {
  id: string;
  leader: CardInstance;
  cards: CardInstance[];
};

export type CardCollection = {
  cards: CardInstance[];
};

export type EquipmentAttachment = {
  targetCardInstanceId: string;
  equipmentCardInstanceId: string;
};

export type EquipmentState = {
  equipped: EquipmentAttachment[];
};

export type SaveSlotState = {
  schemaVersion: typeof SAVE_SLOT_SCHEMA_VERSION;
  slotId: SaveSlotId;
  createdAt: string;
  updatedAt: string;
  saveName: string;
  deck: DeckInstance;
  collection: CardCollection;
  equipment: EquipmentState;
  stageProgress: StageProgressState;
  /**
   * 로비 꾸미기 상태다. schemaVersion 5에 배경, 7에 standing 설정, 8에 세로 위치,
   * 9에 미디어 선택, 10에 로비 BGM 플레이리스트가 들어왔다.
   */
  lobby: LobbyState;
  /** 골드·마나석·소환 티켓 잔액이다. schemaVersion 6에서 들어왔다. */
  resources: ResourceState;
};

export type SaveSlotSummary = {
  slotId: SaveSlotId;
  saveName: string | null;
  updatedAt: string | null;
  deckCardCount: number | null;
  leaderName: string | null;
  isEmpty: boolean;
};

export type SaveSlotsResponse = {
  slots: SaveSlotSummary[];
};
