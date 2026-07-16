import type { GameAction } from './actions';

const KEYBOARD_BINDINGS: Readonly<Record<string, GameAction>> = {
  Enter: 'confirm',
  Escape: 'cancel',
};

export function resolveKeyboardAction(code: string): GameAction | undefined {
  return KEYBOARD_BINDINGS[code];
}
