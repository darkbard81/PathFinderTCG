/** 한 번에 띄울 요청 수다. 화면이 지금 필요로 하는 그림과 대역폭을 다투지 않을 만큼만 둔다. */
const DEFAULT_CONCURRENCY = 4;

export type WarmImagesResult = {
  requestedCount: number;
  loadedCount: number;
  failedCount: number;
};

export type WarmImagesOptions = {
  concurrency?: number;
  /** 한 장을 받는 방법이다. 테스트가 실제 네트워크 없이 바꿔 끼운다. */
  loadImage?: (url: string) => Promise<void>;
};

/**
 * 그림을 미리 받아 브라우저 캐시에 넣어 둔다. 화면에 붙이지는 않는다.
 *
 * `<img>`가 곧 요청할 것과 같은 요청을 같은 방식으로 보낸다. 그래야 캐시 항목이
 * 갈리지 않는다. 받은 뒤에는 `Image`를 놓아 준다. Pixi `Assets`처럼 들고 있으면
 * 디코드된 비트맵이 그대로 쌓여, 미리 받으려다 메모리를 잃는다.
 *
 * 실패는 세기만 하고 넘어간다. 어차피 화면이 다시 요청하고, 그때 없으면 그때 처리한다.
 * 같은 주소는 한 번만 받는다.
 */
export async function warmImages(
  urls: readonly string[],
  options: WarmImagesOptions = {},
): Promise<WarmImagesResult> {
  const targets = [...new Set(urls.filter((url) => url !== ''))];
  const loadImage = options.loadImage ?? loadImageElement;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

  let nextIndex = 0;
  let loadedCount = 0;
  let failedCount = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < targets.length) {
      const url = targets[nextIndex];
      nextIndex += 1;

      if (url === undefined) {
        continue;
      }

      try {
        await loadImage(url);
        loadedCount += 1;
      } catch {
        failedCount += 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => runWorker()),
  );

  return { requestedCount: targets.length, loadedCount, failedCount };
}

function loadImageElement(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve());
    image.addEventListener('error', () => reject(new Error(`Failed to warm image: ${url}`)));
    image.src = url;
  });
}
