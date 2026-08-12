import { Application, Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import type {
  ActiveSkillBattleAction,
  ActiveSkillBattleEffect,
  BattleAutomationAction,
  BattleSlotId,
  BattleTurnEvent,
} from '../../game/battle/types';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';

/** 연출 종류다. 색과 부호만 다르고 움직임은 같다. */
export type BattleEffectKind = 'damage' | 'heal' | 'buff';

export type BattleEffectRequest = {
  kind: BattleEffectKind;
  slotId: BattleSlotId;
  value: number;
};

/**
 * 전장 연출을 내보내는 창구다.
 * Scene은 어떤 행동에 어떤 연출을 낼지만 정하고, 그리는 방법은 알지 않는다.
 */
export type BattleEffects = {
  play: (request: BattleEffectRequest) => Promise<void>;
  resize: (layout: ViewportLayout) => void;
  destroy: () => void;
};

const SKILL_EFFECT_KINDS: Record<ActiveSkillBattleEffect, BattleEffectKind> = {
  HEAL: 'heal',
  DAMAGE: 'damage',
  BUFF_ATTACK: 'buff',
};

/**
 * 액션 하나가 어떤 연출을 내야 하는지 정한다.
 * 배치와 이동은 카드가 나타나거나 자리를 옮기는 것 자체가 이미 피드백이라 연출을 내지 않는다.
 */
export function toBattleEffectRequest(
  action: BattleAutomationAction | ActiveSkillBattleAction,
): BattleEffectRequest | null {
  if (action.type === 'ATTACK') {
    return { kind: 'damage', slotId: action.toSlotId, value: action.attack };
  }

  if (action.type === 'ACTIVE_SKILL') {
    return {
      kind: SKILL_EFFECT_KINDS[action.effect],
      slotId: action.targetSlotId,
      value: action.value,
    };
  }

  return null;
}

/** 한 걸음이 낸 이벤트 중 연출할 것을 고른다. 한 걸음은 행동 하나이므로 많아야 하나다. */
export function readBattleEffectRequest(
  events: readonly BattleTurnEvent[],
): BattleEffectRequest | null {
  for (const event of events) {
    if (event.type === 'ACTION') {
      const request = toBattleEffectRequest(event.action);
      if (request) {
        return request;
      }
    }
  }

  return null;
}

export type BattleEffectsLayerOptions = {
  /** 캔버스를 붙일 곳이다. 카드 위에 겹치고 입력은 통과시킨다. */
  host: HTMLElement;
  /** 칸 가운데의 논리 좌표를 돌려준다. 못 찾으면 연출을 건너뛴다. */
  resolveSlotCenter: (slotId: BattleSlotId) => { x: number; y: number } | null;
  /** 공용 연출 시간축이 검증한 현재 재생 배속을 돌려준다. */
  getPlaybackRate: () => number;
};

const BURST_DURATION_MS = 360;
const VALUE_DURATION_MS = 720;
const VALUE_RISE_PX = 38;

const EFFECT_COLORS: Record<BattleEffectKind, number> = {
  damage: 0xff8e8e,
  heal: 0xa8e6b2,
  buff: 0xffe4a8,
};

const EFFECT_SIGNS: Record<BattleEffectKind, string> = {
  damage: '-',
  heal: '+',
  buff: '+',
};

/**
 * 카드 위에 겹치는 연출 전용 캔버스를 만든다.
 *
 * 배경과 디밍을 그리는 본 캔버스는 DOM 오버레이 아래에 있어서, 카드 위에 무언가를 얹을 수 없다.
 * 그래서 오버레이 안쪽에 캔버스를 한 장 더 두고 여기서만 타격 연출을 그린다.
 * 오버레이가 이미 배율 변환을 갖고 있으므로 이 캔버스는 논리 좌표 그대로 그리면 된다.
 */
export async function createBattleEffectsLayer(
  options: BattleEffectsLayerOptions,
): Promise<BattleEffects> {
  const app = new Application();
  await app.init({
    width: 1024,
    height: 768,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    preference: 'webgl',
  });

  const canvas = app.canvas;
  canvas.className = 'pf-battlefield__effects-canvas';
  options.host.append(canvas);

  let destroyed = false;

  function resize(layout: ViewportLayout): void {
    if (destroyed) {
      return;
    }

    app.renderer.resize(layout.width, layout.height);
  }

  function play(request: BattleEffectRequest): Promise<void> {
    const center = options.resolveSlotCenter(request.slotId);
    if (destroyed || !center) {
      return Promise.resolve();
    }

    const color = EFFECT_COLORS[request.kind];
    const group = new Container({ x: center.x, y: center.y, eventMode: 'none' });
    app.stage.addChild(group);

    const burst = new Graphics({ eventMode: 'none' }).circle(0, 0, 46).fill({ color, alpha: 0.34 });
    burst.stroke({ color, width: 3, alpha: 0.9 });
    const label = new Text({
      text: `${EFFECT_SIGNS[request.kind]}${Math.abs(request.value)}`,
      style: createLabelStyle(color),
      eventMode: 'none',
    });
    label.anchor.set(0.5);
    group.addChild(burst, label);

    return animate(app, options.getPlaybackRate, (elapsed) => {
      const burstProgress = Math.min(1, elapsed / BURST_DURATION_MS);
      burst.scale.set(0.45 + burstProgress * 1.15);
      burst.alpha = 1 - burstProgress;

      const valueProgress = Math.min(1, elapsed / VALUE_DURATION_MS);
      label.y = -valueProgress * VALUE_RISE_PX;
      // 절반까지는 또렷하게 두고 그 뒤에 사라진다. 숫자를 읽을 시간을 준다.
      label.alpha = valueProgress < 0.5 ? 1 : 1 - (valueProgress - 0.5) * 2;

      return valueProgress >= 1;
    }).then(() => {
      group.destroy({ children: true });
    });
  }

  function destroy(): void {
    if (destroyed) {
      return;
    }

    destroyed = true;
    app.destroy({ removeView: true }, { children: true });
  }

  return { play, resize, destroy };
}

/**
 * 매 프레임 진행률을 넘기고, 콜백이 true를 돌려주면 끝낸다.
 * 화면이 사라져 ticker가 멈추면 resolve되지 않으므로 호출자가 destroy로 정리해야 한다.
 */
function animate(
  app: Application,
  getPlaybackRate: () => number,
  step: (elapsedMs: number) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    const onFrame = (): void => {
      elapsed += app.ticker.deltaMS * getPlaybackRate();
      if (step(elapsed)) {
        app.ticker.remove(onFrame);
        resolve();
      }
    };

    app.ticker.add(onFrame);
  });
}

function createLabelStyle(color: number): TextStyleOptions {
  return {
    fontFamily: UI_THEME.fontFamily,
    fontSize: 34,
    fontWeight: '800',
    fill: color,
    stroke: { color: UI_THEME.colors.black.canvas, width: 6 },
  };
}
