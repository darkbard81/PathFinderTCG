/**
 * documents/9SLICE_BUTTON.png 한 장을 9슬라이스 버튼 에셋으로 자른다.
 *
 * 원본 시트는 버튼 2종을 세로로 5상태씩 늘어놓았다.
 *   왼쪽 열  4. MAIN MENU BUTTON  -> menu
 *   오른쪽 열 11. 9-SLICE BUTTON  -> standard
 *   행 순서  normal, hover, pressed, selected, disabled
 *
 * 프레임 바깥은 시트 배경이라 걷어내고, 그림 자체는 불투명하게 둔다.
 * 테두리 80%·가운데 50%라는 투명도는 CSS가 두 겹으로 얹어 만든다.
 * 알파를 파일에 구우면 슬라이스 경계가 밝은 배경에서 사각형 이음매로 드러나고,
 * 나중에 값을 바꿀 때 에셋을 다시 만들어야 한다.
 *
 * 실행: npm run build:buttons
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = path.join(PROJECT_ROOT, 'documents/9SLICE_BUTTON.png');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'src/assets/ui/buttons');

const WEBP_QUALITY = 92;

/**
 * 프레임 바깥을 가려낼 때 배경으로 볼 밝기 상한이다.
 * 시트 배경은 8 언저리이고 프레임선은 55를 넘는다. 그 사이 어디를 잡아도
 * 프레임이 닫힌 고리라 안쪽 채움까지 번지지 않는다.
 */
const BACKGROUND_LUMINANCE = 40;

const STATES = ['normal', 'hover', 'pressed', 'selected', 'disabled'];

/**
 * 시트에서 읽어낸 상태별 프레임 위치다.
 * 가로는 열마다 일정하고, 세로만 상태별로 다르다.
 */
const BUTTONS = [
  {
    name: 'menu',
    label: '4. MAIN MENU BUTTON',
    left: 203,
    width: 657,
    /** 코너 장식이 36px이라 그보다 넉넉하게 잡는다. */
    slice: 44,
    rows: [
      [93, 243],
      [269, 412],
      [445, 586],
      [619, 759],
      [792, 927],
    ],
  },
  {
    name: 'standard',
    label: '11. 9-SLICE BUTTON',
    left: 945,
    width: 423,
    slice: 42,
    rows: [
      [110, 232],
      [282, 407],
      [458, 579],
      [632, 752],
      [806, 920],
    ],
  },
];

function readLuminance(data, channels, index) {
  const offset = index * channels;
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

/**
 * 가장자리에서 어두운 픽셀을 따라 번져 나가며 프레임 바깥을 가려낸다.
 * 프레임은 끊긴 데 없는 고리라 안쪽 채움에는 닿지 못한다.
 */
function floodFillOutside(data, channels, width, height) {
  const isOutside = new Uint8Array(width * height);
  const queue = [];

  const enqueue = (index) => {
    if (isOutside[index] || readLuminance(data, channels, index) > BACKGROUND_LUMINANCE) {
      return;
    }
    isOutside[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  return isOutside;
}

/** 잘라낸 한 상태를 알파가 구워진 RGBA 버퍼로 만든다. */
async function buildState(source, button, rowIndex) {
  const [top, bottom] = button.rows[rowIndex];
  const height = bottom - top + 1;
  const { width } = button;

  const { data, info } = await source
    .clone()
    .extract({ left: button.left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const isOutside = floodFillOutside(data, info.channels, width, height);
  const rgba = Buffer.alloc(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const source3 = index * info.channels;
    const target = index * 4;

    rgba[target] = data[source3];
    rgba[target + 1] = data[source3 + 1];
    rgba[target + 2] = data[source3 + 2];
    rgba[target + 3] = isOutside[index] ? 0 : 255;
  }

  return { rgba, width, height };
}

async function main() {
  const source = sharp(SOURCE_PATH);
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const button of BUTTONS) {
    const states = [];
    for (let rowIndex = 0; rowIndex < STATES.length; rowIndex += 1) {
      states.push(await buildState(source, button, rowIndex));
    }

    // 다섯 상태를 같은 크기로 맞춰야 상태가 바뀌어도 자리가 흔들리지 않는다.
    const canvasHeight = Math.max(...states.map((state) => state.height));
    console.log(
      `## ${button.label} -> ${button.name}  ${button.width}x${canvasHeight} slice ${button.slice}`,
    );

    for (let index = 0; index < STATES.length; index += 1) {
      const state = states[index];
      const offsetTop = Math.round((canvasHeight - state.height) / 2);
      const targetPath = path.join(OUTPUT_DIR, `${button.name}-${STATES[index]}.webp`);

      const output = await sharp({
        create: {
          width: state.width,
          height: canvasHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          {
            input: state.rgba,
            raw: { width: state.width, height: state.height, channels: 4 },
            left: 0,
            top: offsetTop,
          },
        ])
        .webp({ quality: WEBP_QUALITY, alphaQuality: 100 })
        .toFile(targetPath);

      console.log(
        `   ${STATES[index].padEnd(9)} ${state.width}x${state.height} -> ` +
          `${state.width}x${canvasHeight} (위 여백 ${offsetTop})  ${output.size}B`,
      );
    }
  }
}

await main();
