import { warmImages } from './warm-images';

function createLoader(failing: readonly string[] = []) {
  const requested: string[] = [];
  let inFlight = 0;
  let peakInFlight = 0;
  const pending: Array<() => void> = [];

  const loadImage = (url: string): Promise<void> => {
    requested.push(url);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);

    return new Promise<void>((resolve, reject) => {
      pending.push(() => {
        inFlight -= 1;
        if (failing.includes(url)) {
          reject(new Error(url));
          return;
        }
        resolve();
      });
    });
  };

  /** 지금까지 시작된 요청을 모두 끝낸다. 워커가 다음 것을 집을 틈을 준다. */
  const settleAll = async (): Promise<void> => {
    while (pending.length > 0) {
      pending.splice(0, pending.length).forEach((finish) => finish());
      await Promise.resolve();
      await Promise.resolve();
    }
  };

  return {
    loadImage,
    requested,
    settleAll,
    peak: () => peakInFlight,
  };
}

describe('warmImages', () => {
  it('모든 주소를 받고 결과를 센다', async () => {
    const loader = createLoader(['/b.webp']);

    const result = warmImages(['/a.webp', '/b.webp', '/c.webp'], {
      loadImage: loader.loadImage,
    });
    await loader.settleAll();

    expect(await result).toEqual({ requestedCount: 3, loadedCount: 2, failedCount: 1 });
  });

  it('같은 주소는 한 번만 받는다', async () => {
    const loader = createLoader();

    const result = warmImages(['/a.webp', '/a.webp', '/b.webp', ''], {
      loadImage: loader.loadImage,
    });
    await loader.settleAll();

    await result;
    expect(loader.requested).toEqual(['/a.webp', '/b.webp']);
  });

  it('한 번에 띄우는 요청 수를 제한한다', async () => {
    const loader = createLoader();
    const urls = Array.from({ length: 10 }, (_, index) => `/card-${index}.webp`);

    const result = warmImages(urls, { concurrency: 3, loadImage: loader.loadImage });
    await loader.settleAll();

    await result;
    expect(loader.peak()).toBe(3);
    expect(loader.requested).toHaveLength(10);
  });

  it('실패해도 나머지를 계속 받는다', async () => {
    const loader = createLoader(['/a.webp', '/b.webp']);

    const result = warmImages(['/a.webp', '/b.webp', '/c.webp'], {
      concurrency: 1,
      loadImage: loader.loadImage,
    });
    await loader.settleAll();

    expect(await result).toEqual({ requestedCount: 3, loadedCount: 1, failedCount: 2 });
    expect(loader.requested).toEqual(['/a.webp', '/b.webp', '/c.webp']);
  });

  it('받을 것이 없으면 아무것도 하지 않는다', async () => {
    const loader = createLoader();

    expect(await warmImages([], { loadImage: loader.loadImage })).toEqual({
      requestedCount: 0,
      loadedCount: 0,
      failedCount: 0,
    });
    expect(loader.requested).toEqual([]);
  });
});
