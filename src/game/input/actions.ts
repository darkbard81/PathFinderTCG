export const GAME_ACTIONS = ['confirm', 'cancel'] as const;

export type GameAction = (typeof GAME_ACTIONS)[number];
