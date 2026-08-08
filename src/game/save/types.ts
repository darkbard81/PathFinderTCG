import type { CardDefinition } from './card-catalog';
import type { StageProgressState } from '../stage/types';

export const SAVE_SLOT_SCHEMA_VERSION = 4 as const;

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
