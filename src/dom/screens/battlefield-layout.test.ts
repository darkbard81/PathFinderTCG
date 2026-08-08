import { describe, expect, it } from 'vitest';
import { BATTLE_ROW_IDS, listRowSlotIds, resolveBattleBoardMetrics } from './battlefield-layout';

describe('listRowSlotIds', () => {
  it('행 순서가 위에서 아래로 적 후위·적 전위·내 전위·내 후위다', () => {
    expect(BATTLE_ROW_IDS).toEqual(['enemyBack', 'enemyFront', 'playerFront', 'playerBack']);
  });

  it('같은 열에서 후위 슬롯이 전위 슬롯 바로 뒤에 놓인다', () => {
    expect(listRowSlotIds('playerBack')).toEqual(['player:BR', 'player:BC', 'player:BL']);
    expect(listRowSlotIds('playerFront')).toEqual(['player:FR', 'player:FC', 'player:FL']);
  });

  it('적 진영도 같은 열 순서를 쓴다', () => {
    expect(listRowSlotIds('enemyBack')).toEqual(['enemy:BR', 'enemy:BC', 'enemy:BL']);
    expect(listRowSlotIds('enemyFront')).toEqual(['enemy:FR', 'enemy:FC', 'enemy:FL']);
  });
});

describe('resolveBattleBoardMetrics', () => {
  it('최소 해상도에서 4행과 엿보기 손패가 세로에 모두 들어간다', () => {
    const metrics = resolveBattleBoardMetrics({ width: 1024, height: 768 });
    const usedHeight =
      metrics.paddingY * 2 +
      metrics.cardHeight * 4 +
      metrics.gap * 2 +
      metrics.dividerHeight +
      metrics.handPeekHeight;

    expect(usedHeight).toBeLessThanOrEqual(768);
    expect(metrics.cardWidth).toBeGreaterThan(0);
  });

  it('카드 비율이 카드 이미지와 같은 2:3을 유지한다', () => {
    const metrics = resolveBattleBoardMetrics({ width: 1024, height: 768 });

    expect(metrics.cardWidth / metrics.cardHeight).toBeCloseTo(2 / 3, 2);
  });

  it.each([
    { width: 1024, height: 768 },
    { width: 1053, height: 792 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 3440, height: 1440 },
    { width: 1024, height: 1400 },
  ])('레일이 보드를 덮지 않는다 ($width x $height)', (viewport) => {
    const metrics = resolveBattleBoardMetrics(viewport);
    // 여백 + 레일 + 간격 + 보드 + 간격 + 레일 + 여백이 뷰포트 폭 안에 들어가야 겹치지 않는다.
    const usedWidth =
      (metrics.railMargin + metrics.railWidth + metrics.railGap) * 2 + metrics.boardWidth;

    expect(usedWidth).toBeLessThanOrEqual(viewport.width);
  });

  it('보드 폭은 카드 5열과 그 사이 간격 4개의 합이다', () => {
    const metrics = resolveBattleBoardMetrics({ width: 1024, height: 768 });

    expect(metrics.boardWidth).toBe(metrics.cardWidth * 5 + metrics.gap * 4);
  });

  it('세로가 늘어나면 카드가 커진다', () => {
    const small = resolveBattleBoardMetrics({ width: 1440, height: 768 });
    const tall = resolveBattleBoardMetrics({ width: 1440, height: 900 });

    expect(tall.cardHeight).toBeGreaterThan(small.cardHeight);
  });

  it('세로가 아주 긴 창에서는 가로가 카드 크기를 제한한다', () => {
    const tall = resolveBattleBoardMetrics({ width: 1024, height: 1400 });
    const wide = resolveBattleBoardMetrics({ width: 1600, height: 1400 });

    expect(tall.cardWidth).toBeLessThan(wide.cardWidth);
  });

  it('울트라와이드에서도 카드와 레일이 무한정 커지지 않는다', () => {
    const metrics = resolveBattleBoardMetrics({ width: 3440, height: 1440 });

    expect(metrics.cardWidth).toBeLessThanOrEqual(160);
    expect(metrics.railWidth).toBeLessThanOrEqual(264);
  });
});
