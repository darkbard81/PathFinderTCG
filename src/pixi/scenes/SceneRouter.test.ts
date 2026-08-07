import { Container, Ticker, type TickerCallback } from 'pixi.js';
import type { ViewportLayout } from '../app/viewport';
import { SceneRouter } from './SceneRouter';
import type { Scene } from './scene';

const initialLayout: ViewportLayout = { scale: 1, width: 1024, height: 768 };

describe('SceneRouter', () => {
  it('화면 교체 lifecycle을 정해진 순서로 실행한다', async () => {
    const events: string[] = [];
    const root = new Container();
    const ticker = new Ticker();
    const router = new SceneRouter(root, ticker, initialLayout);
    const first = createScene('first', events, true);
    const second = createScene('second', events, true);

    first.view.on('removed', () => events.push('first:removed'));
    first.view.on('destroyed', () => events.push('first:destroyed'));
    second.view.on('added', () => events.push('second:added'));

    await router.goto(first);
    events.length = 0;

    const removeSpy = vi.spyOn(ticker, 'remove').mockImplementation(function (
      this: Ticker,
      callback: TickerCallback<unknown>,
      context?: unknown,
    ) {
      events.push('ticker:remove');
      return Ticker.prototype.remove.call(this, callback, context);
    });
    const addSpy = vi.spyOn(ticker, 'add').mockImplementation(function (
      this: Ticker,
      callback: TickerCallback<unknown>,
      context?: unknown,
      priority?: number,
    ) {
      events.push('ticker:add');
      return Ticker.prototype.add.call(this, callback, context, priority);
    });

    await router.goto(second);

    expect(events).toEqual([
      'first:exit',
      'ticker:remove',
      'first:removed',
      'first:destroyed',
      'second:added',
      'second:resize:1024x768',
      'second:enter',
      'ticker:add',
    ]);
    expect(first.view.destroyed).toBe(true);
    expect(root.children).toEqual([second.view]);
    expect(removeSpy).toHaveBeenCalledOnce();
    expect(addSpy).toHaveBeenCalledOnce();

    ticker.destroy();
    root.destroy({ children: true });
  });

  it('마지막 layout을 활성 화면과 새 화면에 전달한다', async () => {
    const events: string[] = [];
    const root = new Container();
    const ticker = new Ticker();
    const router = new SceneRouter(root, ticker, initialLayout);
    const first = createScene('first', events);
    const second = createScene('second', events);
    const resizedLayout: ViewportLayout = { scale: 0.75, width: 1200, height: 800 };

    await router.goto(first);
    router.resize(resizedLayout);
    await router.goto(second);

    expect(events).toContain('first:resize:1200x800');
    expect(events).toContain('second:resize:1200x800');

    ticker.destroy();
    root.destroy({ children: true });
  });

  it('연속 goto 호출의 비동기 lifecycle을 직렬화한다', async () => {
    const events: string[] = [];
    const root = new Container();
    const ticker = new Ticker();
    const router = new SceneRouter(root, ticker, initialLayout);
    let releaseEnter: (() => void) | undefined;
    const first = createScene('first', events);
    first.enter = async () => {
      events.push('first:enter:start');
      await new Promise<void>((resolve) => {
        releaseEnter = resolve;
      });
      events.push('first:enter:end');
    };
    const second = createScene('second', events);

    const firstTransition = router.goto(first);
    const secondTransition = router.goto(second);
    await vi.waitFor(() => expect(events).toContain('first:enter:start'));

    expect(events).not.toContain('second:enter');
    releaseEnter?.();
    await Promise.all([firstTransition, secondTransition]);

    expect(events).toEqual([
      'first:resize:1024x768',
      'first:enter:start',
      'first:enter:end',
      'first:exit',
      'second:resize:1024x768',
      'second:enter',
    ]);

    ticker.destroy();
    root.destroy({ children: true });
  });

  it('화면 view의 자식까지 파괴한다', async () => {
    const root = new Container();
    const ticker = new Ticker();
    const router = new SceneRouter(root, ticker, initialLayout);
    const child = new Container();
    const first = createScene('first', []);
    first.view.addChild(child);

    await router.goto(first);
    await router.goto(createScene('second', []));

    expect(child.destroyed).toBe(true);

    ticker.destroy();
    root.destroy({ children: true });
  });
});

function createScene(name: string, events: string[], withUpdate = false): Scene {
  const scene: Scene = {
    view: new Container({ label: name }),
    enter: () => {
      events.push(`${name}:enter`);
    },
    exit: () => {
      events.push(`${name}:exit`);
    },
    resize: (layout) => events.push(`${name}:resize:${layout.width}x${layout.height}`),
  };

  if (withUpdate) {
    scene.update = () => events.push(`${name}:update`);
  }

  return scene;
}
