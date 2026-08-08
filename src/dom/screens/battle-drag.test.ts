import { describe, expect, it } from 'vitest';
import type { BattleSlotId } from '../../game/battle/types';
import { findSlotAtPoint, isDragDistance, toLogicalPoint, type SlotBounds } from './battle-drag';

function bounds(slotId: BattleSlotId, left: number, top: number): SlotBounds {
  return { slotId, left, top, right: left + 112, bottom: top + 168 };
}

describe('findSlotAtPoint', () => {
  const slots = [bounds('player:FR', 100, 400), bounds('player:FC', 220, 400)];

  it('사각형 안의 점은 그 칸을 돌려준다', () => {
    expect(findSlotAtPoint(slots, 150, 450)).toBe('player:FR');
    expect(findSlotAtPoint(slots, 260, 450)).toBe('player:FC');
  });

  it('칸 사이 간격에 떨어진 점은 어느 칸도 아니다', () => {
    expect(findSlotAtPoint(slots, 215, 450)).toBeNull();
  });

  it('모든 칸 바깥의 점은 어느 칸도 아니다', () => {
    expect(findSlotAtPoint(slots, 150, 100)).toBeNull();
  });

  it('왼쪽 위 모서리는 포함하고 오른쪽 아래 모서리는 제외한다', () => {
    // 경계를 양쪽 다 포함하면 맞닿은 칸에서 앞 칸이 이겨 한 칸이 영영 안 잡힌다.
    expect(findSlotAtPoint(slots, 100, 400)).toBe('player:FR');
    expect(findSlotAtPoint(slots, 212, 568)).toBeNull();
  });

  it('후보가 없으면 어느 칸도 아니다', () => {
    expect(findSlotAtPoint([], 150, 450)).toBeNull();
  });
});

describe('toLogicalPoint', () => {
  it('배율이 1이면 루트 기준 상대 좌표를 그대로 돌려준다', () => {
    const point = toLogicalPoint({ left: 40, top: 20, width: 1024 }, 1024, 240, 120);

    expect(point).toEqual({ x: 200, y: 100 });
  });

  it('오버레이가 줄어 있으면 논리 좌표로 되돌린다', () => {
    // 논리 폭 1024가 화면에서 512로 보이면 배율은 0.5다.
    const point = toLogicalPoint({ left: 0, top: 0, width: 512 }, 1024, 256, 128);

    expect(point).toEqual({ x: 512, y: 256 });
  });

  it('논리 폭을 알 수 없으면 배율 1로 다룬다', () => {
    const point = toLogicalPoint({ left: 0, top: 0, width: 512 }, 0, 256, 128);

    expect(point).toEqual({ x: 256, y: 128 });
  });
});

describe('isDragDistance', () => {
  it('임계값 미만은 클릭으로 본다', () => {
    expect(isDragDistance(3, 3)).toBe(false);
  });

  it('임계값 이상은 드래그로 본다', () => {
    expect(isDragDistance(0, 6)).toBe(true);
    expect(isDragDistance(-8, 0)).toBe(true);
  });
});
