import './style.css';

import { startGame } from './phaser/boot/startGame';

const game = startGame();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
