import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { launchCaptureBrowser } from './playwright-browser';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const assetsRoot = path.join(projectRoot, 'assets');
const assetsManifestPath = path.join(assetsRoot, 'assets.json');
const metaPath = path.join(projectRoot, 'cards/card_frame_meta.json');
const cardsRoot = path.join(projectRoot, 'cards');
const schemaPath = path.join(projectRoot, 'cards/card.schema.json');
const artAssetsDir = path.join(assetsRoot, 'cards/arts');
const referenceAssetsDir = path.join(assetsRoot, 'cards/reference');
const pendingCaptures = new Map<
  string,
  {
    deckId: string;
    cardId: string;
    area: TextAreaRegion;
    nameArea: TextAreaRegion;
    artImage: string;
    referenceImage: string;
    artOffsetY: number;
  }
>();

type JsonRecord = Record<string, unknown>;

type AssetsManifest = {
  assetBaseUrl: string;
  textures: Array<{
    key: string;
    path: string;
    revision: string;
  }>;
  manifestRevision: string;
  schemaVersion: number;
  revisionAlgorithm: string;
};

type CanvasMeta = {
  width: number;
  height: number;
};

type TextAreaRegion = {
  type: 'text_area';
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
  fill: string;
  opacity: number;
  stroke: string;
  fontFamily: string;
  fontFile: string;
  fontSize: number;
  titleFontSize: number;
  nameColor: string;
  titleColor: string;
  textColor: string;
  textStrokeColor: string;
  textStrokeWidth: number;
  paddingX: number;
  paddingY: number;
  description: string;
};

type FrameMeta = JsonRecord & {
  canvas: CanvasMeta;
  regions: JsonRecord;
  safeAreas?: JsonRecord;
};

type Ability = {
  id: string;
  category: string;
  name: string;
  text: string;
};

type Card = {
  id: string;
  name: string;
  abilities: Ability[];
};

type DeckData = {
  cards: Card[];
};

type DeckOption = {
  id: string;
  name: string;
  cardCount: number;
  filePath: string;
};

type CardAssetPaths = {
  png: string;
  webp: string;
};

type SharpMetadata = {
  width?: number;
  height?: number;
};

type SharpPipeline = {
  metadata(): Promise<SharpMetadata>;
  png(): SharpPipeline;
  resize(width: number, height: number): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  toFile(targetPath: string): Promise<unknown>;
};

type SharpFactory = (input: string) => SharpPipeline;

type AssetImage = {
  name: string;
  path: string;
};

type SaveAreaPayload = {
  deckId?: string;
  cardId: string;
  area: TextAreaRegion;
  nameArea: TextAreaRegion;
  artImage?: string;
  referenceImage?: string;
  artOffsetY?: number;
};

const defaultTextArea: TextAreaRegion = {
  type: 'text_area',
  x: 128,
  y: 1010,
  width: 768,
  height: 270,
  cornerRadius: 22,
  fill: '#FFFFFF',
  opacity: 0.62,
  stroke: '#FFFFFF',
  fontFamily: 'D2Coding',
  fontFile: 'fonts/D2CodingBold.ttf',
  fontSize: 31,
  titleFontSize: 31,
  nameColor: '#12351A',
  titleColor: '#7A2D18',
  textColor: '#17251A',
  textStrokeColor: '#DFDFDF',
  textStrokeWidth: 0,
  paddingX: 28,
  paddingY: 24,
  description:
    '카드 능력 텍스트를 배치하는 반투명 흰색 텍스트 영역. 브라우저 편집 도구에서 위치와 크기를 조정한다.',
};

const defaultNameTextArea: TextAreaRegion = {
  ...defaultTextArea,
  x: 253,
  y: 1294,
  width: 518,
  height: 222,
  cornerRadius: 14,
  fill: '#000000',
  opacity: 0.48,
  stroke: '#000000',
  fontSize: 42,
  titleFontSize: 42,
  textColor: '#FFFFFF',
  textStrokeColor: '#222222',
  textStrokeWidth: 2,
  paddingX: 18,
  paddingY: 18,
  description:
    '카드 이름을 하단 중앙 영역에 배치하는 텍스트 영역. 브라우저 편집 도구에서 위치와 크기를 조정한다.',
};

export type CardTextApiOptions = {
  /**
   * 요청자가 카드 텍스트 도구를 쓸 수 있는지 확인한다.
   * 거절할 때는 응답을 직접 마감하고 false를 돌려준다.
   */
  authorize: (request: IncomingMessage, response: ServerResponse) => boolean;
  /** 캡처 브라우저가 접속할 origin이다. 실제 리스닝 주소에서 만든다. */
  resolveCaptureOrigin: () => string;
};

/**
 * `/api/card-text-tool/...` 요청을 처리하는 전용 API 핸들러를 만든다.
 * 카드 메타 저장, PNG/WEBP 생성, capture용 합성까지 이 경로에서만 처리한다.
 */
export function createCardTextApiHandler(
  options: CardTextApiOptions,
): (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void> {
  return async (request, response, next) => {
    await handleCardTextToolRequest(request, response, next, options);
  };
}

/**
 * `/api/card-text-tool/...` 요청을 분기 처리한다.
 * 데이터 조회, 저장, 이미지 생성은 모두 이 경로에서만 다룬다.
 */
async function handleCardTextToolRequest(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
  options: CardTextApiOptions,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (!url.pathname.startsWith('/api/card-text-tool/')) {
    next();
    return;
  }

  // 캡처 브라우저는 새 컨텍스트라 세션 쿠키가 없다.
  // 이미 인가된 generate가 발급해 둔 captureId만 데이터 조회를 대신 통과시킨다.
  if (!isPendingCaptureRead(request, url) && !options.authorize(request, response)) {
    return;
  }

  try {
    if (request.method === 'GET' && url.pathname === '/api/card-text-tool/data') {
      const meta = await readFrameMeta();
      const manifest = await readAssetsManifest();
      const assetBaseUrl = normalizeAssetBaseUrl(manifest.assetBaseUrl);
      const deckOptions = await listDeckOptions();
      const selectedDeck = selectDeckOption(url.searchParams.get('deckId'), deckOptions);
      const deck = await readJsonFile<DeckData>(selectedDeck.filePath);
      const schema = await readJsonFile<JsonRecord>(schemaPath);
      const artImages = filterAssetImagesForDeck(
        deck,
        await listAssetImages(artAssetsDir, 'cards/arts'),
      );
      const referenceImages = await listAssetImages(referenceAssetsDir, 'cards/reference');
      const requestedCardId = url.searchParams.get('cardId');
      const selectedArtImage =
        selectAssetPath(url.searchParams.get('artImage'), artImages, 'art image', assetBaseUrl) ??
        selectArtImageForCard(requestedCardId, artImages);
      const resolvedCardId = requestedCardId ?? cardIdFromAssetPath(selectedArtImage);
      const card = findCard(deck, resolvedCardId);
      const abilityTitles = getAbilityCategoryTitles(schema);
      const pendingCapture = readPendingCapture(
        url.searchParams.get('captureId'),
        selectedDeck.id,
        card.id,
      );
      const textArea = pendingCapture?.area ?? readTextArea(meta);
      const nameTextArea = pendingCapture?.nameArea ?? readNameTextArea(meta, textArea);
      const selectedReferenceImage =
        pendingCapture?.referenceImage ??
        selectAssetPath(
          url.searchParams.get('referenceImage'),
          referenceImages,
          'reference image',
          assetBaseUrl,
        ) ??
        selectFirstAssetPath(referenceImages, 'reference image');
      const artOffsetY =
        pendingCapture?.artOffsetY ??
        readOptionalInteger(url.searchParams.get('artOffsetY'), readDefaultArtOffsetY(meta));

      sendJson(response, {
        canvas: meta.canvas,
        assetBaseUrl,
        deckOptions: deckOptions.map(toPublicDeckOption),
        selectedDeckId: selectedDeck.id,
        card,
        abilityText: formatAbilityText(card, abilityTitles, textArea),
        nameText: formatNameText(card, nameTextArea),
        textArea,
        nameTextArea,
        artImages,
        referenceImages,
        selectedArtImage,
        selectedReferenceImage,
        artOffsetY,
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/card-text-tool/save-area') {
      const payload = validateAreaPayload(await readRequestJson(request));
      const meta = await readFrameMeta();
      meta.regions.ability_text_area = normalizeTextArea(payload.area);
      meta.regions.name_text_area = normalizeTextArea(payload.nameArea, defaultNameTextArea);
      await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

      sendJson(response, {
        savedPath: 'cards/card_frame_meta.json',
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/card-text-tool/generate') {
      const payload = validateAreaPayload(await readRequestJson(request));
      const meta = await readFrameMeta();
      const manifest = await readAssetsManifest();
      const assetBaseUrl = normalizeAssetBaseUrl(manifest.assetBaseUrl);
      const deckOptions = await listDeckOptions();
      const selectedDeck = selectDeckOption(payload.deckId, deckOptions);
      const deck = await readJsonFile<DeckData>(selectedDeck.filePath);
      const card = findCard(deck, payload.cardId);
      const area = normalizeTextArea(payload.area);
      const nameArea = normalizeTextArea(payload.nameArea, defaultNameTextArea);
      const artImages = filterAssetImagesForDeck(
        deck,
        await listAssetImages(artAssetsDir, 'cards/arts'),
      );
      const referenceImages = await listAssetImages(referenceAssetsDir, 'cards/reference');
      const artImage =
        selectAssetPath(payload.artImage, artImages, 'art image', assetBaseUrl) ??
        selectArtImageForCard(card.id, artImages);
      const referenceImage =
        selectAssetPath(payload.referenceImage, referenceImages, 'reference image', assetBaseUrl) ??
        selectFirstAssetPath(referenceImages, 'reference image');
      const artOffsetY = toInteger(payload.artOffsetY, readDefaultArtOffsetY(meta));

      // 임시 경로는 요청마다 고유해야 한다. 카드 ID로만 짓고 디렉터리를 통째로 비우면
      // 동시에 진행 중인 다른 생성의 중간 산출물까지 지워 버린다.
      const outputCardPath = path.join(
        projectRoot,
        `cards/temp/${card.id}_${crypto.randomUUID()}.png`,
      );
      await fs.mkdir(path.dirname(outputCardPath), { recursive: true });

      let outputAssets: CardAssetPaths;
      try {
        await renderCardByScreenshot({
          area,
          nameArea,
          deckId: selectedDeck.id,
          cardId: card.id,
          canvas: meta.canvas,
          outputCardPath,
          artImage,
          referenceImage,
          artOffsetY,
          captureOrigin: options.resolveCaptureOrigin(),
        });

        outputAssets = await finalizeCardAssets(card.id, outputCardPath);
      } finally {
        await fs.rm(outputCardPath, { force: true });
      }

      const outputPath = outputAssets.png;
      sendJson(response, {
        outputPath,
        outputUrl: toAssetUrl(assetBaseUrl, outputPath),
      });
      return;
    }

    response.statusCode = 404;
    response.end('Not found');
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(error instanceof Error ? error.message : String(error));
  }
}

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await fs.readFile(targetPath, 'utf8')) as T;
}

async function readFrameMeta(): Promise<FrameMeta> {
  return readJsonFile<FrameMeta>(metaPath);
}

async function readAssetsManifest(): Promise<AssetsManifest> {
  return readJsonFile<AssetsManifest>(assetsManifestPath);
}

/**
 * 작업 가능한 덱 파일을 `cards/deck_*.json` 규칙으로만 수집한다.
 * 카드 텍스트 툴은 임의 경로를 받지 않고, repo-root cards 폴더의 덱만 대상으로 삼는다.
 */
async function listDeckOptions(): Promise<DeckOption[]> {
  const entries = await fs.readdir(cardsRoot);
  const deckFiles = entries
    .filter((entry) => /^deck_[a-z0-9_-]+\.json$/i.test(entry))
    .sort((left, right) => left.localeCompare(right));

  if (deckFiles.length === 0) {
    throw new Error('No deck JSON files found in cards/deck_*.json');
  }

  return Promise.all(
    deckFiles.map(async (entry) => {
      const filePath = path.join(cardsRoot, entry);
      const deck = await readJsonFile<DeckData>(filePath);
      return {
        id: path.basename(entry, '.json'),
        name: entry,
        cardCount: Array.isArray(deck.cards) ? deck.cards.length : 0,
        filePath,
      };
    }),
  );
}

/**
 * 요청된 덱 ID를 실제 덱 파일 옵션으로 해석한다.
 * 선택값이 없으면 기존 동작과 호환되도록 `deck_test`를 우선 사용하고, 허용되지 않은 이름은 즉시 거절한다.
 */
function selectDeckOption(
  requestedDeckId: string | null | undefined,
  deckOptions: DeckOption[],
): DeckOption {
  const firstDeck = deckOptions[0];
  if (!firstDeck) {
    throw new Error('No deck JSON files found in cards/deck_*.json');
  }

  const fallbackDeck = deckOptions.find((option) => option.id === 'deck_test') ?? firstDeck;
  const deckId = requestedDeckId?.trim();

  if (!deckId) {
    return fallbackDeck;
  }

  if (!/^deck_[a-z0-9_-]+$/i.test(deckId)) {
    throw new Error(`Invalid deck id: ${requestedDeckId}`);
  }

  const selectedDeck = deckOptions.find((option) => option.id === deckId);
  if (!selectedDeck) {
    throw new Error(`Deck not found: ${deckId}`);
  }

  return selectedDeck;
}

function toPublicDeckOption(option: DeckOption): Omit<DeckOption, 'filePath'> {
  return {
    id: option.id,
    name: option.name,
    cardCount: option.cardCount,
  };
}

function readTextArea(meta: FrameMeta): TextAreaRegion {
  const maybeRegion = meta.regions.ability_text_area;
  return normalizeTextArea(isRecord(maybeRegion) ? maybeRegion : defaultTextArea);
}

function readNameTextArea(meta: FrameMeta, abilityArea: TextAreaRegion): TextAreaRegion {
  const maybeRegion = meta.regions.name_text_area;
  if (isRecord(maybeRegion)) {
    return normalizeTextArea(maybeRegion, defaultNameTextArea);
  }

  return {
    ...createNameTextAreaFromSafeArea(meta),
    fontFamily: abilityArea.fontFamily,
    fontFile: abilityArea.fontFile,
  };
}

/**
 * 진행 중인 캡처가 자기 데이터를 읽는 요청인지 판별한다.
 * captureId는 인가된 generate가 서버에서 발급한 UUID이고 캡처가 끝나면 즉시 폐기되므로,
 * 이 조회만 세션 없이 통과시켜도 외부에서 재현할 수 없다. 쓰기 경로는 절대 통과시키지 않는다.
 */
function isPendingCaptureRead(request: IncomingMessage, url: URL): boolean {
  if (request.method !== 'GET' || url.pathname !== '/api/card-text-tool/data') {
    return false;
  }

  const captureId = url.searchParams.get('captureId');
  return captureId !== null && pendingCaptures.has(captureId);
}

function readPendingCapture(captureId: string | null, deckId: string, cardId: string) {
  if (!captureId) {
    return null;
  }

  const pendingCapture = pendingCaptures.get(captureId);
  if (!pendingCapture || pendingCapture.deckId !== deckId || pendingCapture.cardId !== cardId) {
    return null;
  }

  return pendingCapture;
}

/**
 * 브라우저 캡처로 카드 합성 이미지를 만든다.
 * 렌더링 실패는 그대로 예외로 올려서 상위 요청이 중단되게 한다.
 */
async function renderCardByScreenshot(input: {
  area: TextAreaRegion;
  nameArea: TextAreaRegion;
  deckId: string;
  cardId: string;
  canvas: CanvasMeta;
  outputCardPath: string;
  artImage: string;
  referenceImage: string;
  artOffsetY: number;
  captureOrigin: string;
}): Promise<void> {
  const captureId = crypto.randomUUID();
  pendingCaptures.set(captureId, {
    deckId: input.deckId,
    cardId: input.cardId,
    area: input.area,
    nameArea: input.nameArea,
    artImage: input.artImage,
    referenceImage: input.referenceImage,
    artOffsetY: input.artOffsetY,
  });

  const captureUrl = new URL('/tools/card-text/', input.captureOrigin);
  captureUrl.searchParams.set('capture', '1');
  captureUrl.searchParams.set('captureId', captureId);
  captureUrl.searchParams.set('deckId', input.deckId);
  captureUrl.searchParams.set('cardId', input.cardId);
  captureUrl.searchParams.set('artImage', input.artImage);
  captureUrl.searchParams.set('referenceImage', input.referenceImage);
  captureUrl.searchParams.set('artOffsetY', String(input.artOffsetY));

  // 브라우저 실행 자체가 실패해도 pendingCaptures 항목은 반드시 회수한다.
  // 남아 있는 captureId는 무인증 조회를 계속 통과시키는 열쇠가 된다.
  try {
    const browser = await launchCaptureBrowser();

    try {
      const page = await browser.newPage({
        viewport: {
          width: input.canvas.width,
          height: input.canvas.height,
        },
        deviceScaleFactor: 1,
      });

      await page.goto(captureUrl.href, { waitUntil: 'networkidle' });
      // 클라이언트가 데이터 조회·글꼴 등록·최초 렌더를 마치고 세우는 신호다.
      // 글꼴은 /data 응답 뒤에 등록되므로 document.fonts만 보면 등록 전에 통과해 버린다.
      await page.waitForFunction(
        () =>
          (window as unknown as { __CARD_TEXT_TOOL_READY?: boolean }).__CARD_TEXT_TOOL_READY ===
          true,
        undefined,
        { timeout: 15000 },
      );
      await page.waitForFunction(() => document.fonts.status === 'loaded');
      await page.locator('[data-stage] canvas').first().waitFor({ timeout: 10000 });
      await page.waitForFunction(() =>
        Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
      );
      await page.waitForTimeout(500);
      await page.locator('[data-stage]').screenshot({
        path: input.outputCardPath,
        animations: 'disabled',
      });
    } finally {
      await browser.close();
    }
  } finally {
    pendingCaptures.delete(captureId);
  }
}

function toProjectPath(targetPath: string): string {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

/**
 * 생성된 합성 이미지를 repo-root 기준 PNG와 WEBP로 정리한다.
 * 카드는 2:3 비율을 강제하며, 실패하면 바로 예외를 던진다.
 */
async function finalizeCardAssets(cardId: string, sourcePath: string): Promise<CardAssetPaths> {
  const sharpFactory = sharp as unknown as SharpFactory;
  const pngDir = path.join(projectRoot, 'assets/cards/png');
  const webpDir = path.join(projectRoot, 'assets/cards/webp');
  await fs.mkdir(pngDir, { recursive: true });
  await fs.mkdir(webpDir, { recursive: true });

  const metadata = await sharpFactory(sourcePath).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error(`Could not read generated image dimensions: ${toProjectPath(sourcePath)}`);
  }

  if (width * 3 !== height * 2) {
    throw new Error(`Generated image must be 2:3, got ${width}x${height}`);
  }

  const pngPath = path.join(pngDir, `${cardId}.png`);
  const webpPath = path.join(webpDir, `${cardId}.webp`);

  await sharpFactory(sourcePath).png().toFile(pngPath);
  await sharpFactory(sourcePath)
    .resize(Math.round(width * 0.5), Math.round(height * 0.5))
    .webp({ quality: 90 })
    .toFile(webpPath);

  const cardAssets = {
    png: toAssetsPath(pngPath),
    webp: toAssetsPath(webpPath),
  };

  return cardAssets;
}

function normalizeAssetBaseUrl(assetBaseUrl: string): string {
  if (!assetBaseUrl.startsWith('/')) {
    return `/${assetBaseUrl.replace(/^\/+/, '')}`;
  }

  return assetBaseUrl.replace(/\/+$/, '') || '/';
}

function normalizeAssetPath(requestedPath: string, assetBaseUrl: string): string {
  const stripped = requestedPath.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
  const normalizedBaseUrl = normalizeAssetBaseUrl(assetBaseUrl).replace(/^\/+/, '');

  if (normalizedBaseUrl && stripped.startsWith(`${normalizedBaseUrl}/`)) {
    return stripped.slice(normalizedBaseUrl.length + 1);
  }

  if (stripped.startsWith('assets/')) {
    return stripped.slice('assets/'.length);
  }

  return stripped;
}

function toAssetsPath(targetPath: string): string {
  return path.relative(assetsRoot, targetPath).split(path.sep).join('/');
}

function toAssetUrl(assetBaseUrl: string, assetPath: string): string {
  const normalizedBaseUrl = normalizeAssetBaseUrl(assetBaseUrl);
  const normalizedPath = assetPath.replace(/^\/+/, '');
  return `${normalizedBaseUrl}/${normalizedPath}`;
}

function createNameTextAreaFromSafeArea(meta: FrameMeta): TextAreaRegion {
  const safeArea = isRecord(meta.safeAreas?.bottom_center_between_orbs)
    ? meta.safeAreas.bottom_center_between_orbs
    : {};

  return normalizeTextArea(
    {
      ...defaultNameTextArea,
      x: toInteger(safeArea.x, defaultNameTextArea.x),
      y: toInteger(safeArea.y, defaultNameTextArea.y),
      width: toInteger(safeArea.width, defaultNameTextArea.width),
      height: toInteger(safeArea.height, defaultNameTextArea.height),
    },
    defaultNameTextArea,
  );
}

function readDefaultArtOffsetY(meta: FrameMeta): number {
  const chromaArea = isRecord(meta.regions?.inner_chroma_area)
    ? meta.regions.inner_chroma_area
    : {};
  return Math.round(toInteger(chromaArea.y, 0) / 2);
}

/**
 * 자산 디렉터리에서 카드 이미지 후보만 모아 정렬한다.
 * 비어 있으면 요청이 더 진행되지 않도록 즉시 예외를 던진다.
 */
async function listAssetImages(directoryPath: string, assetDir: string): Promise<AssetImage[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(directoryPath);
  } catch {
    throw new Error(`Missing image directory: ${toProjectPath(directoryPath)}`);
  }

  const images = entries
    .filter((entry) => /\.(?:png|webp|jpe?g)$/i.test(entry))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => ({
      name: entry,
      path: `${assetDir}/${entry}`,
    }));

  if (images.length === 0) {
    throw new Error(`No images found in ${assetDir}`);
  }

  return images;
}

/**
 * 선택된 덱에 포함된 카드 ID와 일치하는 일러스트만 남긴다.
 * 덱별 일괄 생성이 다른 덱의 아트를 섞어 처리하지 않도록 하는 서버 측 방어선이다.
 */
function filterAssetImagesForDeck(deck: DeckData, images: AssetImage[]): AssetImage[] {
  const cardIds = new Set(deck.cards.map((card) => card.id));
  const deckImages = images.filter((image) => cardIds.has(cardIdFromAssetPath(image.path)));

  if (deckImages.length === 0) {
    throw new Error('No art images found for the selected deck');
  }

  return deckImages;
}

function selectAssetPath(
  requestedPath: string | null | undefined,
  images: AssetImage[],
  label: string,
  assetBaseUrl: string,
): string | null {
  if (!requestedPath) {
    return null;
  }

  const normalizedPath = normalizeAssetPath(requestedPath, assetBaseUrl);
  if (images.some((image) => image.path === normalizedPath)) {
    return normalizedPath;
  }

  throw new Error(`Invalid ${label}: ${requestedPath}`);
}

function selectFirstAssetPath(images: AssetImage[], label: string): string {
  const firstImage = images[0];
  if (!firstImage) {
    throw new Error(`No ${label} candidates found`);
  }

  return firstImage.path;
}

/**
 * 카드 ID에 맞는 일러스트를 찾고, 없으면 첫 번째 후보를 사용한다.
 * 파일명 규칙이 카드 ID와 일치한다는 전제를 따른다.
 */
function selectArtImageForCard(cardId: string | null | undefined, images: AssetImage[]): string {
  if (cardId) {
    const matchingImage = images.find((image) => cardIdFromAssetPath(image.path) === cardId);
    if (matchingImage) {
      return matchingImage.path;
    }
  }

  return selectFirstAssetPath(images, 'art image');
}

function cardIdFromAssetPath(assetPath: string): string {
  return path.basename(assetPath).replace(/\.(?:png|webp|jpe?g)$/i, '');
}

function readOptionalInteger(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') {
    return fallback;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : fallback;
}

/**
 * 메타와 요청 payload를 텍스트 영역 구조로 정규화한다.
 * 누락된 수치는 기본값으로 보정하고, 타입 태그는 항상 고정한다.
 */
function normalizeTextArea(
  area: JsonRecord | TextAreaRegion,
  fallback: TextAreaRegion = defaultTextArea,
): TextAreaRegion {
  return {
    ...fallback,
    ...area,
    type: 'text_area',
    x: toInteger(area.x, fallback.x),
    y: toInteger(area.y, fallback.y),
    width: toInteger(area.width, fallback.width),
    height: toInteger(area.height, fallback.height),
    cornerRadius: toInteger(area.cornerRadius, fallback.cornerRadius),
    opacity: toNumber(area.opacity, fallback.opacity),
    fontSize: toInteger(area.fontSize, fallback.fontSize),
    titleFontSize: toInteger(area.titleFontSize, fallback.titleFontSize),
    paddingX: toInteger(area.paddingX, fallback.paddingX),
    paddingY: toInteger(area.paddingY, fallback.paddingY),
  };
}

function findCard(deck: DeckData, cardId: string): Card {
  const card = deck.cards.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new Error(`Card not found: ${cardId}`);
  }

  return card;
}

function getAbilityCategoryTitles(schema: JsonRecord): Map<string, string> {
  const defs = schema.$defs;
  if (!isRecord(defs)) {
    return new Map();
  }

  const abilityCategory = defs.abilityCategory;
  if (!isRecord(abilityCategory) || !Array.isArray(abilityCategory.oneOf)) {
    return new Map();
  }

  return new Map(
    abilityCategory.oneOf.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.const !== 'string' || typeof entry.title !== 'string') {
        return [];
      }

      return [[entry.const, entry.title] as const];
    }),
  );
}

function formatAbilityText(
  card: Card,
  abilityTitles: Map<string, string>,
  area: TextAreaRegion,
): string {
  if (card.abilities.length === 0) {
    return '';
  }

  return card.abilities
    .map((ability) => {
      const title = abilityTitles.get(ability.category) ?? ability.category;
      return [
        `[color=${area.nameColor}]${escapeBBCode(ability.name)}[/color] : [color=${area.titleColor}][${escapeBBCode(title)}][/color]`,
        `[color=${area.textColor}]${escapeBBCode(ability.text)}[/color]`,
      ].join('\n');
    })
    .join('\n\n');
}

function formatNameText(card: Card, area: TextAreaRegion): string {
  return `[color=${area.textColor}]${escapeBBCode(card.name)}[/color]`;
}

function escapeBBCode(value: string): string {
  return value.replace(/\[/g, '[esc][').replace(/\]/g, '][/esc]');
}

/**
 * 저장/생성 요청 본문이 카드 편집 payload인지 검증한다.
 * 필요한 필드가 하나라도 비면 즉시 거절한다.
 */
function validateAreaPayload(value: unknown): SaveAreaPayload {
  if (
    !isRecord(value) ||
    typeof value.cardId !== 'string' ||
    !isRecord(value.area) ||
    !isRecord(value.nameArea)
  ) {
    throw new Error('Invalid payload');
  }

  return {
    ...(typeof value.deckId === 'string' ? { deckId: value.deckId } : {}),
    cardId: value.cardId,
    area: normalizeTextArea(value.area),
    nameArea: normalizeTextArea(value.nameArea, defaultNameTextArea),
    ...(typeof value.artImage === 'string' ? { artImage: value.artImage } : {}),
    ...(typeof value.referenceImage === 'string' ? { referenceImage: value.referenceImage } : {}),
    ...(typeof value.artOffsetY === 'number' ? { artOffsetY: value.artOffsetY } : {}),
  };
}

/**
 * 요청 본문을 스트림에서 읽어 JSON으로 파싱한다.
 * 파싱 실패는 호출자에게 그대로 전달한다.
 */
function readRequestJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', (error) => {
      reject(error);
    });
  });
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function toInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
