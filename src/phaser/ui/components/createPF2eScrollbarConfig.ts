import * as Phaser from 'phaser';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme';
import { PF2eScrollbarPart } from './PF2eScrollbarPart';

export interface PF2eScrollbarParts {
  readonly track: PF2eScrollbarPart;
  readonly thumb: PF2eScrollbarPart;
  readonly config: {
    readonly position: 'left' | 'right';
    readonly track: PF2eScrollbarPart;
    readonly thumb: PF2eScrollbarPart;
    readonly adaptThumbSize: true;
    readonly minThumbSize: number;
    readonly hideUnscrollableSlider: boolean;
    readonly disableUnscrollableDrag: true;
  };
}

export function createPF2eScrollbarConfig(
  scene: Phaser.Scene,
  position: 'left' | 'right',
  hideWhenUnscrollable: boolean,
): PF2eScrollbarParts {
  const theme = PF2E_ELF_THEME.components.scrollablePanel;
  const track = new PF2eScrollbarPart(scene, {
    variant: 'scrollTrack',
    width: PF2E_ELF_THEME.sizes.scrollbar,
    height: 2,
  });
  const thumb = new PF2eScrollbarPart(scene, {
    variant: 'scrollThumb',
    width: PF2E_ELF_THEME.sizes.scrollbar,
    height: theme.minThumbSize,
  });

  return {
    track,
    thumb,
    config: {
      position,
      track,
      thumb,
      adaptThumbSize: true,
      minThumbSize: theme.minThumbSize,
      hideUnscrollableSlider: hideWhenUnscrollable,
      disableUnscrollableDrag: true,
    },
  };
}

export function bindPF2eScrollbarThumbStates(thumb: PF2eScrollbarPart): void {
  thumb
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      thumb.setVisualState('hover');
    })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      thumb.setVisualState('idle');
    })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      thumb.setVisualState('pressed');
    })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      thumb.setVisualState('hover');
    });
}
