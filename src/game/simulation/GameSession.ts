import type { GameAction } from '../input/actions';

export interface GameState {
  readonly actionCount: number;
  readonly lastAction: GameAction | null;
  readonly message: string;
}

export type GameStateListener = (state: GameState) => void;

const INITIAL_STATE: GameState = {
  actionCount: 0,
  lastAction: null,
  message: '아직 입력된 액션이 없습니다.',
};

export class GameSession {
  private state: GameState = INITIAL_STATE;
  private readonly listeners = new Set<GameStateListener>();

  getState(): GameState {
    return { ...this.state };
  }

  dispatch(action: GameAction): void {
    this.state = {
      actionCount: this.state.actionCount + 1,
      lastAction: action,
      message: action === 'confirm' ? '확인 액션을 처리했습니다.' : '취소 액션을 처리했습니다.',
    };

    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  subscribe(listener: GameStateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}
