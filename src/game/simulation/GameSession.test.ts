import { describe, expect, it, vi } from 'vitest';

import { GameSession } from './GameSession';

describe('GameSession', () => {
  it('keeps serializable game state outside Phaser scenes', () => {
    const session = new GameSession();

    session.dispatch('confirm');

    expect(session.getState()).toEqual({
      actionCount: 1,
      lastAction: 'confirm',
      message: '확인 액션을 처리했습니다.',
    });
  });

  it('notifies active subscribers and supports unsubscribe', () => {
    const session = new GameSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    session.dispatch('cancel');
    unsubscribe();
    session.dispatch('confirm');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      actionCount: 1,
      lastAction: 'cancel',
      message: '취소 액션을 처리했습니다.',
    });
  });

  it('does not expose the internal mutable state object', () => {
    const session = new GameSession();
    const snapshot = session.getState();

    session.dispatch('confirm');

    expect(snapshot).toEqual({
      actionCount: 0,
      lastAction: null,
      message: '아직 입력된 액션이 없습니다.',
    });
  });
});
