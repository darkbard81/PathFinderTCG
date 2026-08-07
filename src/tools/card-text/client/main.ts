import './styles.css';

const RUNTIME_FONT_FAMILY = 'CardTextRuntime';
const urlParams = new URLSearchParams(window.location.search);
const INITIAL_DECK_ID = urlParams.get('deckId');
const INITIAL_CARD_ID = urlParams.get('cardId');
const captureId = urlParams.get('captureId');
const isCaptureMode = urlParams.get('capture') === '1';

const COLOR_OPEN_TAG = '[color=';
const COLOR_CLOSE_TAG = '[/color]';
const ESC_OPEN_TAG = '[esc]';
const ESC_CLOSE_TAG = '[/esc]';
const TEXT_STROKE_SHADOW_DIRECTIONS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

declare global {
  interface Window {
    __CARD_TEXT_TOOL_READY?: boolean;
  }
}

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

type AssetImage = {
  name: string;
  path: string;
};

type DeckOption = {
  id: string;
  name: string;
  cardCount: number;
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

type EditorData = {
  canvas: {
    width: number;
    height: number;
  };
  assetBaseUrl: string;
  deckOptions: DeckOption[];
  selectedDeckId: string;
  card: Card;
  abilityText: string;
  nameText: string;
  textArea: TextAreaRegion;
  nameTextArea: TextAreaRegion;
  artImages: AssetImage[];
  referenceImages: AssetImage[];
  selectedArtImage: string;
  selectedReferenceImage: string;
  artOffsetY: number;
};

type AreaKey = 'ability' | 'name';

type DragState =
  | {
      mode: 'move';
      pointerId: number;
      startX: number;
      startY: number;
      originalX: number;
      originalY: number;
    }
  | {
      mode: 'resize';
      pointerId: number;
      startX: number;
      startY: number;
      originalWidth: number;
      originalHeight: number;
    };

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('#app element not found');
}

app.innerHTML = `
  <main class="app">
    <section class="preview-shell" aria-label="카드 미리보기">
      <div class="stage" data-stage>
        <canvas class="render-ready-canvas" width="1" height="1" aria-hidden="true"></canvas>
        <img class="card-layer art-layer" data-art-image alt="selected card art" />
        <img class="card-layer reference-layer" data-reference-image alt="card frame reference" />
        <div class="text-area ability-text-area" data-area-key="ability" data-text-area>
          <div class="bbcode-preview" data-bbcode-preview></div>
          <span class="resize-handle" data-resize-handle aria-hidden="true"></span>
        </div>
        <div class="text-area name-text-area" data-area-key="name" data-name-text-area>
          <div class="bbcode-preview name-bbcode-preview" data-name-bbcode-preview></div>
          <span class="resize-handle" data-name-resize-handle aria-hidden="true"></span>
        </div>
      </div>
    </section>
    <aside class="panel">
      <h1>카드 텍스트 영역</h1>
      <div class="card-summary" data-card-summary></div>
      <div class="asset-controls">
        <div class="field">
          <label for="deckId">Deck</label>
          <select id="deckId" data-deck-select></select>
        </div>
        <div class="field">
          <label for="artImage">Art</label>
          <select id="artImage" data-art-select></select>
        </div>
        <div class="field">
          <label for="referenceImage">Reference</label>
          <select id="referenceImage" data-reference-select></select>
        </div>
        <div class="field">
          <label for="artOffsetY">Art Y</label>
          <input id="artOffsetY" data-art-offset-y type="number" step="1" />
        </div>
      </div>
      <pre class="text-preview" data-text-preview></pre>
      <div class="area-tabs" aria-label="편집 영역">
        <button type="button" data-area-tab="ability" class="active">어빌리티</button>
        <button type="button" data-area-tab="name">이름</button>
      </div>
      <div class="controls">
        <div class="field">
          <label for="x">X</label>
          <input id="x" data-field="x" type="number" min="0" step="1" />
        </div>
        <div class="field">
          <label for="y">Y</label>
          <input id="y" data-field="y" type="number" min="0" step="1" />
        </div>
        <div class="field">
          <label for="width">Width</label>
          <input id="width" data-field="width" type="number" min="120" step="1" />
        </div>
        <div class="field">
          <label for="height">Height</label>
          <input id="height" data-field="height" type="number" min="80" step="1" />
        </div>
      </div>
      <div class="actions">
        <button type="button" data-save>저장</button>
        <button type="button" data-generate>생성</button>
        <button type="button" data-generate-all>일괄생성</button>
        <button type="button" class="secondary" data-reset>기본값</button>
      </div>
      <p class="status" data-status></p>
    </aside>
  </main>
`;

const stage = mustQuery<HTMLDivElement>('[data-stage]');
const artImageElement = mustQuery<HTMLImageElement>('[data-art-image]');
const referenceImageElement = mustQuery<HTMLImageElement>('[data-reference-image]');
const textAreaElement = mustQuery<HTMLDivElement>('[data-text-area]');
const resizeHandle = mustQuery<HTMLSpanElement>('[data-resize-handle]');
const nameTextAreaElement = mustQuery<HTMLDivElement>('[data-name-text-area]');
const nameResizeHandle = mustQuery<HTMLSpanElement>('[data-name-resize-handle]');
const bbcodePreviewElement = mustQuery<HTMLDivElement>('[data-bbcode-preview]');
const nameBbcodePreviewElement = mustQuery<HTMLDivElement>('[data-name-bbcode-preview]');
const cardSummaryElement = mustQuery<HTMLDivElement>('[data-card-summary]');
const textPreviewElement = mustQuery<HTMLPreElement>('[data-text-preview]');
const statusElement = mustQuery<HTMLParagraphElement>('[data-status]');
const saveButton = mustQuery<HTMLButtonElement>('[data-save]');
const generateButton = mustQuery<HTMLButtonElement>('[data-generate]');
const generateAllButton = mustQuery<HTMLButtonElement>('[data-generate-all]');
const resetButton = mustQuery<HTMLButtonElement>('[data-reset]');
const deckSelect = mustQuery<HTMLSelectElement>('[data-deck-select]');
const artSelect = mustQuery<HTMLSelectElement>('[data-art-select]');
const referenceSelect = mustQuery<HTMLSelectElement>('[data-reference-select]');
const artOffsetYInput = mustQuery<HTMLInputElement>('[data-art-offset-y]');
const fields = {
  x: mustQuery<HTMLInputElement>('[data-field="x"]'),
  y: mustQuery<HTMLInputElement>('[data-field="y"]'),
  width: mustQuery<HTMLInputElement>('[data-field="width"]'),
  height: mustQuery<HTMLInputElement>('[data-field="height"]'),
};
const areaTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-area-tab]'));

let editorData: EditorData | null = null;
let abilityArea: TextAreaRegion | null = null;
let nameArea: TextAreaRegion | null = null;
let defaultAbilityArea: TextAreaRegion | null = null;
let defaultNameArea: TextAreaRegion | null = null;
let selectedArtImage = '';
let selectedReferenceImage = '';
let artOffsetY = 0;
let defaultArtOffsetY = 0;
let currentDeckId = INITIAL_DECK_ID ?? '';
let currentCardId = INITIAL_CARD_ID ?? '';
let activeAreaKey: AreaKey = 'ability';
let dragState: DragState | null = null;

void initialize();

/**
 * 편집기 초기 데이터와 폰트를 준비한 뒤, 상호작용 가능한 화면 상태를 만든다.
 * 폰트 로드에 실패해도 폴백 표시로 계속 진행하고, 이벤트 바인딩은 반드시 유지한다.
 */
async function initialize(): Promise<void> {
  window.__CARD_TEXT_TOOL_READY = false;
  document.body.classList.toggle('capture', isCaptureMode);
  setBusy(true);
  setStatus('데이터를 불러오는 중입니다.');

  try {
    const initialData = await fetchEditorData({
      deckId: INITIAL_DECK_ID,
      cardId: INITIAL_CARD_ID,
      captureId,
      artImage: urlParams.get('artImage'),
      referenceImage: urlParams.get('referenceImage'),
      artOffsetY: urlParams.get('artOffsetY'),
    });
    applyEditorData(initialData, { resetAreas: true, resetDefaults: true });
    if (!abilityArea) {
      throw new Error('Ability text area was not initialized.');
    }
    bindEvents();
    try {
      await loadRuntimeFont(abilityArea.fontFile);
      await document.fonts.ready;
      syncBBCodePreviews();
      setStatus('마우스로 흰색 영역을 드래그하거나 우하단 핸들로 크기를 조정할 수 있습니다.');
    } catch {
      syncBBCodePreviews();
      setStatus(
        '기본 폰트로 표시 중입니다. 마우스로 흰색 영역을 드래그하거나 우하단 핸들로 크기를 조정할 수 있습니다.',
      );
    }
  } catch (error) {
    setStatus(formatError(error));
  } finally {
    setBusy(false);
  }
}

/**
 * 드래그, 선택, 생성, 저장에 필요한 UI 이벤트를 한 번에 연결한다.
 * 초기화 이후 재호출하지 않는다는 전제로 직접 DOM 상태를 갱신한다.
 */
function bindEvents(): void {
  bindAreaDrag('ability', textAreaElement, resizeHandle);
  bindAreaDrag('name', nameTextAreaElement, nameResizeHandle);

  deckSelect.addEventListener('change', () => {
    void selectDeck(deckSelect.value);
  });

  artSelect.addEventListener('change', () => {
    void selectArtImage(artSelect.value);
  });

  referenceSelect.addEventListener('change', () => {
    selectedReferenceImage = referenceSelect.value;
    renderImageLayers();
  });

  artOffsetYInput.addEventListener('input', () => {
    artOffsetY = readNumber(artOffsetYInput);
    renderImageLayers();
  });

  Object.values(fields).forEach((field) => {
    field.addEventListener('input', () => {
      const area = getActiveArea();
      if (!editorData || !area) {
        return;
      }

      area.x = clamp(readNumber(fields.x), 0, editorData.canvas.width - area.width);
      area.y = clamp(readNumber(fields.y), 0, editorData.canvas.height - area.height);
      area.width = clamp(readNumber(fields.width), 120, editorData.canvas.width - area.x);
      area.height = clamp(readNumber(fields.height), 48, editorData.canvas.height - area.y);
      renderAreas();
    });
  });

  areaTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.areaTab;
      if (key === 'ability' || key === 'name') {
        setActiveArea(key);
      }
    });
  });

  saveButton.addEventListener('click', () => {
    void saveArea();
  });

  generateButton.addEventListener('click', () => {
    void generateCard();
  });

  generateAllButton.addEventListener('click', () => {
    void generateAllCards();
  });

  resetButton.addEventListener('click', () => {
    if (!defaultAbilityArea || !defaultNameArea) {
      return;
    }
    abilityArea = cloneArea(defaultAbilityArea);
    nameArea = cloneArea(defaultNameArea);
    artOffsetY = defaultArtOffsetY;
    renderImageLayers();
    renderAreas();
    setStatus('두 텍스트 영역을 기본 위치로 되돌렸습니다. 저장을 누르면 메타 파일에 반영됩니다.');
  });
}

function bindAreaDrag(
  key: AreaKey,
  areaElement: HTMLDivElement,
  handleElement: HTMLSpanElement,
): void {
  areaElement.addEventListener('pointerdown', (event) => {
    const area = getArea(key);
    if (!area || event.target === handleElement) {
      return;
    }

    setActiveArea(key);
    const point = toCanvasPoint(event);
    dragState = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originalX: area.x,
      originalY: area.y,
    };
    areaElement.setPointerCapture(event.pointerId);
  });

  handleElement.addEventListener('pointerdown', (event) => {
    const area = getArea(key);
    if (!area) {
      return;
    }

    event.stopPropagation();
    setActiveArea(key);
    const point = toCanvasPoint(event);
    dragState = {
      mode: 'resize',
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originalWidth: area.width,
      originalHeight: area.height,
    };
    areaElement.setPointerCapture(event.pointerId);
  });

  areaElement.addEventListener('pointermove', (event) => {
    const area = getArea(key);
    if (!editorData || !area || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const point = toCanvasPoint(event);
    const deltaX = Math.round(point.x - dragState.startX);
    const deltaY = Math.round(point.y - dragState.startY);

    if (dragState.mode === 'move') {
      area.x = clamp(dragState.originalX + deltaX, 0, editorData.canvas.width - area.width);
      area.y = clamp(dragState.originalY + deltaY, 0, editorData.canvas.height - area.height);
    } else {
      area.width = clamp(dragState.originalWidth + deltaX, 120, editorData.canvas.width - area.x);
      area.height = clamp(dragState.originalHeight + deltaY, 48, editorData.canvas.height - area.y);
    }

    renderAreas();
  });

  areaElement.addEventListener('pointerup', (event) => finishDrag(event, areaElement));
  areaElement.addEventListener('pointercancel', (event) => finishDrag(event, areaElement));
}

function finishDrag(event: PointerEvent, areaElement: HTMLDivElement): void {
  if (dragState?.pointerId === event.pointerId) {
    dragState = null;
    areaElement.releasePointerCapture(event.pointerId);
  }
}

/**
 * 현재 편집 중인 텍스트 영역을 서버의 `card_frame_meta.json`에 저장한다.
 * 두 영역이 모두 준비되지 않으면 아무 작업도 하지 않는다.
 */
async function saveArea(): Promise<void> {
  if (!abilityArea || !nameArea) {
    return;
  }

  setBusy(true);
  setStatus('card_frame_meta.json에 텍스트 영역을 저장하는 중입니다.');

  try {
    const response = await postJson('/api/card-text-tool/save-area', {
      deckId: currentDeckId,
      cardId: currentCardId,
      area: abilityArea,
      nameArea,
    });
    const result = (await response.json()) as { savedPath: string };
    setStatus(`${result.savedPath}에 저장했습니다.`);
  } catch (error) {
    setStatus(formatError(error));
  } finally {
    setBusy(false);
  }
}

/**
 * 현재 선택된 카드와 텍스트 영역을 서버에 보내 PNG와 WEBP 생성을 요청한다.
 * 저장된 편집 상태를 기준으로 합성하므로, UI에 보이는 값이 그대로 결과물에 반영된다.
 */
async function generateCard(): Promise<void> {
  if (!abilityArea || !nameArea) {
    return;
  }

  setBusy(true);
  setStatus('텍스트 영역을 합성한 PNG를 생성하는 중입니다.');

  try {
    const result = await generateCardImage({
      cardId: currentCardId,
      deckId: currentDeckId,
      artImage: selectedArtImage,
      area: cloneArea(abilityArea),
      nameArea: cloneArea(nameArea),
      referenceImage: selectedReferenceImage,
      artOffsetY,
    });
    setStatus(`생성 완료: ${result.outputPath}\n`);
    const link = document.createElement('a');
    link.className = 'output-link';
    link.href = `${result.outputUrl}?t=${Date.now()}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = '생성된 PNG 열기';
    statusElement.append(link);
  } catch (error) {
    setStatus(formatError(error));
  } finally {
    setBusy(false);
  }
}

/**
 * 현재 art 목록 전체를 순회하며 카드 이미지를 일괄 생성한다.
 * 개별 카드 실패는 중단하지 않고 수집만 하며, 마지막 성공 결과는 별도 링크로 남긴다.
 */
async function generateAllCards(): Promise<void> {
  if (!editorData || !abilityArea || !nameArea) {
    return;
  }

  const artImages = editorData.artImages;
  if (artImages.length === 0) {
    setStatus('일괄 생성할 art 이미지를 찾지 못했습니다.');
    return;
  }

  const area = cloneArea(abilityArea);
  const nameAreaSnapshot = cloneArea(nameArea);
  const referenceImage = selectedReferenceImage;
  const artOffsetYSnapshot = artOffsetY;

  setBusy(true);
  setStatus(`art list 전체를 생성하는 중입니다. 0 / ${artImages.length}`);

  const failures: string[] = [];
  let processed = 0;
  let successes = 0;
  let lastResult: { outputPath: string; outputUrl: string } | null = null;

  try {
    for (const artImage of artImages) {
      processed += 1;
      const cardId = cardIdFromAssetPath(artImage.path);

      try {
        const result = await generateCardImage({
          deckId: currentDeckId,
          cardId,
          artImage: artImage.path,
          area,
          nameArea: nameAreaSnapshot,
          referenceImage,
          artOffsetY: artOffsetYSnapshot,
        });
        successes += 1;
        lastResult = result;
        setStatus(`일괄 생성 중입니다. ${processed} / ${artImages.length} (${cardId})`);
      } catch (error) {
        failures.push(`${cardId}: ${formatError(error)}`);
      }
    }

    if (failures.length === 0) {
      setStatus(`일괄 생성 완료: ${successes} / ${artImages.length}`);
    } else {
      setStatus(
        `일괄 생성 완료: ${successes} / ${artImages.length}, 실패 ${failures.length}건\n${failures.join('\n')}`,
      );
    }

    if (lastResult) {
      const link = document.createElement('a');
      link.className = 'output-link';
      link.href = `${lastResult.outputUrl}?t=${Date.now()}`;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = '마지막 생성된 PNG 열기';
      statusElement.append(link);
    }
  } finally {
    setBusy(false);
  }
}

/**
 * 단일 카드의 합성을 서버에 요청하고 결과 경로를 돌려받는다.
 * 클라이언트는 실제 이미지 생성 대신 요청 payload만 구성한다.
 */
async function generateCardImage(input: {
  deckId: string;
  cardId: string;
  artImage: string;
  area: TextAreaRegion;
  nameArea: TextAreaRegion;
  referenceImage: string;
  artOffsetY: number;
}): Promise<{ outputPath: string; outputUrl: string }> {
  const response = await postJson('/api/card-text-tool/generate', {
    deckId: input.deckId,
    cardId: input.cardId,
    area: input.area,
    nameArea: input.nameArea,
    artImage: input.artImage,
    referenceImage: input.referenceImage,
    artOffsetY: input.artOffsetY,
  });

  return (await response.json()) as { outputPath: string; outputUrl: string };
}

/**
 * JSON 요청을 보내고 실패 응답은 본문까지 포함해 예외로 올린다.
 * 서버 오류 메시지를 그대로 상태줄에 보여주기 위한 얇은 래퍼다.
 */
async function postJson(path: string, body: unknown): Promise<Response> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response;
}

/**
 * 현재 카드 ID와 선택 상태를 기준으로 서버에서 편집 데이터를 다시 읽는다.
 * query string이 결과를 결정하므로, 변경된 선택값은 모두 여기에 반영해야 한다.
 */
async function fetchEditorData(input: {
  deckId?: string | null;
  cardId?: string | null;
  captureId?: string | null;
  artImage?: string | null;
  referenceImage?: string | null;
  artOffsetY?: string | number | null;
}): Promise<EditorData> {
  const query = new URLSearchParams();
  setOptionalQueryParam(query, 'deckId', input.deckId);
  setOptionalQueryParam(query, 'cardId', input.cardId);
  setOptionalQueryParam(query, 'captureId', input.captureId);
  setOptionalQueryParam(query, 'artImage', input.artImage);
  setOptionalQueryParam(query, 'referenceImage', input.referenceImage);
  setOptionalQueryParam(query, 'artOffsetY', input.artOffsetY);

  const response = await fetch(`/api/card-text-tool/data?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as EditorData;
}

/**
 * 서버 응답을 현재 편집 상태에 반영하고, 필요하면 기본값 스냅샷도 다시 잡는다.
 * 같은 카드로 돌아오는 경우에는 기존 드래그 상태보다 서버값을 우선한다.
 */
function applyEditorData(
  data: EditorData,
  options: { resetAreas: boolean; resetDefaults: boolean },
): void {
  editorData = data;
  currentDeckId = data.selectedDeckId;
  currentCardId = data.card.id;
  if (options.resetAreas || !abilityArea || !nameArea) {
    abilityArea = cloneArea(data.textArea);
    nameArea = cloneArea(data.nameTextArea);
  }
  selectedArtImage = data.selectedArtImage;
  selectedReferenceImage = data.selectedReferenceImage;
  artOffsetY = data.artOffsetY;

  if (options.resetDefaults) {
    defaultArtOffsetY = data.artOffsetY;
    defaultAbilityArea = {
      ...cloneArea(data.textArea),
      x: 128,
      y: 1010,
      width: 768,
      height: 270,
    };
    defaultNameArea = cloneArea(data.nameTextArea);
  }

  renderCardText(data);
  renderAssetControls(data);
  renderImageLayers();
  renderAreas();
}

/**
 * 드롭다운에서 선택한 일러스트에 맞는 카드 정보를 다시 불러온다.
 * 카드 ID는 파일명에서 유도하므로, 없는 카드를 고르면 서버에서 바로 거절된다.
 */
async function selectArtImage(artImage: string): Promise<void> {
  setBusy(true);
  setStatus('선택한 일러스트의 카드 정보를 불러오는 중입니다.');

  try {
    const nextCardId = cardIdFromAssetPath(artImage);
    const nextData = await fetchEditorData({
      deckId: currentDeckId,
      cardId: nextCardId,
      artImage,
      referenceImage: selectedReferenceImage,
      artOffsetY,
    });
    applyEditorData(nextData, { resetAreas: false, resetDefaults: false });
    setStatus(`${nextData.card.name} / ${nextData.card.id} 정보를 반영했습니다.`);
  } catch (error) {
    setStatus(formatError(error));
  } finally {
    setBusy(false);
  }
}

/**
 * 선택한 덱의 첫 번째 사용 가능한 일러스트와 카드 정보를 불러온다.
 * 텍스트 영역 좌표는 덱과 무관한 프레임 메타이므로 현재 편집값을 유지한다.
 */
async function selectDeck(deckId: string): Promise<void> {
  setBusy(true);
  setStatus('선택한 덱 정보를 불러오는 중입니다.');

  try {
    const nextData = await fetchEditorData({
      deckId,
      referenceImage: selectedReferenceImage,
      artOffsetY,
    });
    applyEditorData(nextData, { resetAreas: false, resetDefaults: false });
    setStatus(`${nextData.selectedDeckId} / ${nextData.card.name} 정보를 반영했습니다.`);
  } catch (error) {
    setStatus(formatError(error));
  } finally {
    setBusy(false);
  }
}

/**
 * 현재 카드와 활성 영역의 텍스트를 화면에 다시 그린다.
 * 카드 이름, BBCode 미리보기, 활성 입력 필드를 함께 맞춘다.
 */
function renderCardText(data: EditorData): void {
  cardSummaryElement.textContent = `${data.card.name} / ${data.card.id}`;
  renderActiveAreaFields();
  syncBBCodePreviews();
}

/**
 * 일러스트, 레퍼런스, Y 오프셋 선택 상태를 컨트롤 UI에 동기화한다.
 * 실제 렌더링은 별도 함수에서 처리하므로 여기서는 입력값만 맞춘다.
 */
function renderAssetControls(data: EditorData): void {
  renderDeckOptions(deckSelect, data.deckOptions, currentDeckId);
  renderAssetOptions(artSelect, data.artImages, selectedArtImage);
  renderAssetOptions(referenceSelect, data.referenceImages, selectedReferenceImage);
  artOffsetYInput.value = String(artOffsetY);
}

function renderDeckOptions(
  select: HTMLSelectElement,
  deckOptions: DeckOption[],
  selectedDeckId: string,
): void {
  select.replaceChildren(
    ...deckOptions.map((deck) => {
      const option = document.createElement('option');
      option.value = deck.id;
      option.textContent = `${deck.name} (${deck.cardCount})`;
      option.selected = deck.id === selectedDeckId;
      return option;
    }),
  );
}

function renderAssetOptions(
  select: HTMLSelectElement,
  images: AssetImage[],
  selectedPath: string,
): void {
  select.replaceChildren(
    ...images.map((image) => {
      const option = document.createElement('option');
      option.value = image.path;
      option.textContent = image.name;
      option.selected = image.path === selectedPath;
      return option;
    }),
  );
}

/**
 * 카드 아트와 레퍼런스 프레임을 현재 선택값으로 다시 배치한다.
 * 캔버스 비율과 실제 이미지 비율이 다를 수 있으므로, DOM 레이어는 화면 크기에 맞춘다.
 */
function renderImageLayers(): void {
  if (!editorData) {
    return;
  }

  artImageElement.src = toAssetUrl(editorData.assetBaseUrl, selectedArtImage);
  referenceImageElement.src = toAssetUrl(editorData.assetBaseUrl, selectedReferenceImage);

  const scaledArtOffsetY = editorData
    ? artOffsetY * (stage.clientHeight / editorData.canvas.height)
    : artOffsetY;

  artImageElement.style.transform = `translateY(${scaledArtOffsetY}px)`;
  artOffsetYInput.value = String(artOffsetY);
}

/**
 * 편집 중인 텍스트 영역의 위치와 미리보기를 다시 계산한다.
 * 레이아웃 변경 뒤에는 BBCode 렌더가 다음 프레임에서 다시 수행된다.
 */
function renderAreas(): void {
  if (!editorData || !abilityArea || !nameArea) {
    return;
  }

  renderAreaElement(textAreaElement, abilityArea);
  renderAreaElement(nameTextAreaElement, nameArea);
  renderActiveAreaFields();

  requestAnimationFrame(syncBBCodePreviews);
}

function renderAreaElement(element: HTMLDivElement, area: TextAreaRegion): void {
  if (!editorData) {
    return;
  }

  const canvas = editorData.canvas;
  element.style.left = `${(area.x / canvas.width) * 100}%`;
  element.style.top = `${(area.y / canvas.height) * 100}%`;
  element.style.width = `${(area.width / canvas.width) * 100}%`;
  element.style.height = `${(area.height / canvas.height) * 100}%`;
  element.style.borderRadius = `${(area.cornerRadius / canvas.width) * 100}%`;
  element.style.padding = `${(area.paddingY / canvas.height) * stage.clientHeight}px ${
    (area.paddingX / canvas.width) * stage.clientWidth
  }px`;
  element.style.background = rgbaFromHex(area.fill, area.opacity);
  element.style.borderColor = area.stroke;
}

/**
 * 현재 활성 영역과 탭 상태를 다시 그린다.
 * 숫자 입력과 미리보기 텍스트는 활성 영역 기준으로만 맞춘다.
 */
function renderActiveAreaFields(): void {
  const area = getActiveArea();
  if (!area) {
    return;
  }

  fields.x.value = String(area.x);
  fields.y.value = String(area.y);
  fields.width.value = String(area.width);
  fields.height.value = String(area.height);
  textAreaElement.classList.toggle('active', activeAreaKey === 'ability');
  nameTextAreaElement.classList.toggle('active', activeAreaKey === 'name');
  areaTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.areaTab === activeAreaKey);
  });
  textPreviewElement.textContent = getActiveTextPreview();
}

/**
 * 사용자가 편집 중인 영역을 바꾸고, 그에 맞는 입력 필드를 다시 표시한다.
 */
function setActiveArea(key: AreaKey): void {
  activeAreaKey = key;
  renderActiveAreaFields();
}

/**
 * 현재 활성화된 텍스트 영역을 돌려준다.
 * 탭 상태에 따라 능력치 영역 또는 이름 영역을 선택한다.
 */
function getActiveArea(): TextAreaRegion | null {
  return getArea(activeAreaKey);
}

/**
 * 지정된 키에 해당하는 편집 영역을 찾는다.
 * 두 영역 외의 키는 허용하지 않는다.
 */
function getArea(key: AreaKey): TextAreaRegion | null {
  return key === 'ability' ? abilityArea : nameArea;
}

/**
 * 활성 영역에 대응하는 미리보기 텍스트를 꺼낸다.
 * 화면 표시용 텍스트와 실제 편집 좌표를 분리해 둔다.
 */
function getActiveTextPreview(): string {
  if (!editorData) {
    return '';
  }

  return activeAreaKey === 'ability' ? editorData.abilityText : editorData.nameText;
}

/**
 * BBCode 미리보기를 양쪽 영역 모두 다시 렌더링하고 준비 상태를 갱신한다.
 * 캡처 모드에서는 폰트가 완전히 올라간 뒤에만 완료 플래그를 세운다.
 */
function syncBBCodePreviews(): void {
  syncAbilityBBCodePreview();
  syncNameBBCodePreview();
  requestAnimationFrame(() => {
    window.__CARD_TEXT_TOOL_READY = true;
  });
}

/**
 * 능력치 텍스트 영역의 미리보기를 실제 렌더링 폰트 규칙에 맞춰 출력한다.
 * 글자 외곽선은 화면 축소 비율에 맞춰 다시 계산한다.
 */
function syncAbilityBBCodePreview(): void {
  if (!editorData || !abilityArea) {
    return;
  }

  const fontSize = readScaledFontSize(abilityArea.fontSize);
  const lineSpacing = Math.max(1, Math.round(fontSize * 0.18));

  bbcodePreviewElement.style.fontFamily = RUNTIME_FONT_FAMILY;
  bbcodePreviewElement.style.fontSize = `${fontSize}px`;
  bbcodePreviewElement.style.fontWeight = '700';
  bbcodePreviewElement.style.color = abilityArea.textColor;
  bbcodePreviewElement.style.lineHeight = `${fontSize + lineSpacing}px`;
  bbcodePreviewElement.style.textAlign = 'left';
  bbcodePreviewElement.style.display = 'block';
  applyTextStroke(bbcodePreviewElement, abilityArea);

  renderInlineBBCode(bbcodePreviewElement, editorData.abilityText);
}

/**
 * 이름 텍스트 영역의 미리보기를 가운데 정렬 규칙에 맞춰 출력한다.
 * 카드 이름은 능력치 텍스트와 달리 수직 중앙 배치를 유지한다.
 */
function syncNameBBCodePreview(): void {
  if (!editorData || !nameArea) {
    return;
  }

  const fontSize = readScaledFontSize(nameArea.fontSize);

  nameBbcodePreviewElement.style.fontFamily = RUNTIME_FONT_FAMILY;
  nameBbcodePreviewElement.style.fontSize = `${fontSize}px`;
  nameBbcodePreviewElement.style.fontWeight = '700';
  nameBbcodePreviewElement.style.color = nameArea.textColor;
  nameBbcodePreviewElement.style.lineHeight = `${Math.round(fontSize * 1.18)}px`;
  nameBbcodePreviewElement.style.textAlign = 'center';
  nameBbcodePreviewElement.style.display = 'flex';
  nameBbcodePreviewElement.style.alignItems = 'center';
  nameBbcodePreviewElement.style.justifyContent = 'center';
  applyTextStroke(nameBbcodePreviewElement, nameArea);

  renderInlineBBCode(nameBbcodePreviewElement, editorData.nameText);
}

function applyTextStroke(element: HTMLElement, area: TextAreaRegion): void {
  const strokeWidth = readScaledStrokeWidth(area.textStrokeWidth);
  const strokeColor = isSafeColor(area.textStrokeColor) ? area.textStrokeColor : 'transparent';

  if (strokeWidth <= 0 || strokeColor === 'transparent') {
    element.style.removeProperty('-webkit-text-stroke');
    element.style.removeProperty('-webkit-text-stroke-color');
    element.style.removeProperty('-webkit-text-stroke-width');
    element.style.textShadow = '';
    return;
  }

  element.style.setProperty('-webkit-text-stroke', `${strokeWidth}px ${strokeColor}`);
  element.style.textShadow = buildTextStrokeShadow(strokeWidth, strokeColor);
}

function buildTextStrokeShadow(strokeWidth: number, strokeColor: string): string {
  const offset = Math.max(1, Math.ceil(strokeWidth));
  return TEXT_STROKE_SHADOW_DIRECTIONS.map(
    ([x, y]) => `${x * offset}px ${y * offset}px 0 ${strokeColor}`,
  ).join(', ');
}

function readScaledFontSize(fontSize: number): number {
  if (!editorData) {
    return fontSize;
  }

  const stageRect = stage.getBoundingClientRect();
  const scale = stageRect.width / editorData.canvas.width;
  return Math.max(10, Math.round(fontSize * scale));
}

function readScaledStrokeWidth(strokeWidth: number): number {
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    return 0;
  }

  if (!editorData) {
    return strokeWidth;
  }

  const stageRect = stage.getBoundingClientRect();
  const scale = stageRect.width / editorData.canvas.width;
  return Number(Math.max(0.5, strokeWidth * scale).toFixed(2));
}

function renderInlineBBCode(target: HTMLElement, source: string): void {
  const fragment = document.createDocumentFragment();
  const colorStack: HTMLElement[] = [];
  const lowerSource = source.toLowerCase();
  let index = 0;

  const append = (node: Node): void => {
    const parent = colorStack[colorStack.length - 1];
    if (parent) {
      parent.append(node);
    } else {
      fragment.append(node);
    }
  };

  while (index < source.length) {
    if (lowerSource.startsWith(COLOR_OPEN_TAG, index)) {
      const tagEnd = source.indexOf(']', index);
      if (tagEnd !== -1) {
        const color = source.slice(index + COLOR_OPEN_TAG.length, tagEnd).trim();
        if (isSafeColor(color)) {
          const span = document.createElement('span');
          span.style.color = color;
          append(span);
          colorStack.push(span);
          index = tagEnd + 1;
          continue;
        }
      }
    }

    if (lowerSource.startsWith(COLOR_CLOSE_TAG, index)) {
      colorStack.pop();
      index += COLOR_CLOSE_TAG.length;
      continue;
    }

    if (lowerSource.startsWith(ESC_OPEN_TAG, index)) {
      index += ESC_OPEN_TAG.length;
      continue;
    }

    if (lowerSource.startsWith(ESC_CLOSE_TAG, index)) {
      index += ESC_CLOSE_TAG.length;
      continue;
    }

    if (source[index] === '\n') {
      append(document.createElement('br'));
      index += 1;
      continue;
    }

    const nextIndex = findNextBBCodeBoundary(lowerSource, index + 1);
    append(document.createTextNode(source.slice(index, nextIndex)));
    index = nextIndex;
  }

  target.replaceChildren(fragment);
}

function findNextBBCodeBoundary(source: string, fromIndex: number): number {
  const candidates = [
    source.indexOf(COLOR_OPEN_TAG, fromIndex),
    source.indexOf(COLOR_CLOSE_TAG, fromIndex),
    source.indexOf(ESC_OPEN_TAG, fromIndex),
    source.indexOf(ESC_CLOSE_TAG, fromIndex),
    source.indexOf('\n', fromIndex),
  ].filter((value) => value !== -1);

  if (candidates.length === 0) {
    return source.length;
  }

  return Math.min(...candidates);
}

function isSafeColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value);
}

function toCanvasPoint(event: PointerEvent): { x: number; y: number } {
  if (!editorData) {
    return { x: 0, y: 0 };
  }

  const rect = stage.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * editorData.canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * editorData.canvas.height,
  };
}

function readNumber(input: HTMLInputElement): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function cloneArea(area: TextAreaRegion): TextAreaRegion {
  return { ...area };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * 현재 선택된 폰트를 브라우저에서 사용할 수 있도록 등록한다.
 * 로컬 파일이 없거나 손상된 경우에는 호출자에서 폴백 처리한다.
 */
async function loadRuntimeFont(fontFile: string): Promise<void> {
  if (!editorData) {
    return;
  }

  const fontUrl = toAssetUrl(editorData.assetBaseUrl, fontFile);
  const font = new FontFace(RUNTIME_FONT_FAMILY, `url("${encodeURI(fontUrl)}")`);
  await font.load();
  document.fonts.add(font);
}

function setBusy(isBusy: boolean): void {
  saveButton.disabled = isBusy;
  generateButton.disabled = isBusy;
  generateAllButton.disabled = isBusy;
  resetButton.disabled = isBusy;
  deckSelect.disabled = isBusy;
  artSelect.disabled = isBusy;
  referenceSelect.disabled = isBusy;
  artOffsetYInput.disabled = isBusy;
}

function setStatus(message: string): void {
  statusElement.textContent = message;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toAssetUrl(assetBaseUrl: string, projectPath: string): string {
  const normalizedBaseUrl = assetBaseUrl.startsWith('/')
    ? assetBaseUrl.replace(/\/+$/, '')
    : `/${assetBaseUrl.replace(/^\/+/, '')}`;

  return `${normalizedBaseUrl}/${projectPath.replace(/^\/+/, '')}`;
}

function setOptionalQueryParam(
  target: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value !== null && value !== undefined && String(value) !== '') {
    target.set(key, String(value));
  }
}

function cardIdFromAssetPath(assetPath: string): string {
  const fileName = assetPath.split('/').pop() ?? assetPath;
  return fileName.replace(/\.(?:png|webp|jpe?g)$/i, '');
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`${selector} element not found`);
  }
  return element;
}
