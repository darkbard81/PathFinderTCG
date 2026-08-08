/**
 * assets/cards/badge/source_badge.png 한 장을 카드 수치 배지 4개로 자른다.
 *
 * 원본은 1254x1254 2x2 시트이고 사분면마다 마젠타 또는 그린 크로마키가
 * 깔려 있다. 배경을 알파로 바꾸고 256x256 webp로 내린다.
 *
 * 사분면 배치는 원본 시트의 읽는 순서를 그대로 따른다.
 *   좌상 왕관 -> dominance    우상 청색 보석 -> cost
 *   좌하 하트 -> hp           우하 교차검     -> attack
 *
 * 실행: npm run build:badges
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BADGE_DIR = path.join(PROJECT_ROOT, 'assets/cards/badge');
const SOURCE_PATH = path.join(BADGE_DIR, 'source_badge.png');

const OUTPUT_SIZE = 256;
const WEBP_QUALITY = 92;

/**
 * 사분면마다 가장자리에서 잘라내는 여백이다.
 * 마젠타 면과 그린 면이 맞닿는 이음새 2~3px는 두 키의 중간색이라
 * 어느 우세도에도 걸리지 않고 반투명 색선으로 남는다. 실제 아트는
 * 어느 방향으로도 15px 넘게 떨어져 있어 이만큼 버려도 잘리지 않는다.
 */
const EXTRACT_INSET = 8;

/**
 * 배경 후보로 볼 최소 키 우세도다.
 *
 * 임계값만으로 배경을 가를 수는 없다. 왕관 내부의 보라 면은 우세도가
 * 60~99라 마젠타 배경과 같은 방향이고, 순수 배경은 220을 넘는다.
 * 그래서 이 값은 "배경일 수 있다"는 후보만 고르고, 실제 판정은
 * 가장자리에서 이어져 있는지로 한다.
 */
const BACKGROUND_CANDIDATE_DOMINANCE = 40;

/** 이보다 옅은 알파는 화면에 보이지 않으면서 파일만 키워 0으로 눌러 버린다. */
const MINIMUM_VISIBLE_COVERAGE = 0.04;

/** 사분면 배경으로 쓰인 두 키 색의 실측값이다. */
const KEY_COLORS = {
  green: [14, 242, 3],
  magenta: [242, 3, 241],
};

/** 시트에서 잘라낼 사분면과 배지 이름이다. */
const QUADRANTS = [
  { name: 'dominance', column: 0, row: 0, label: '지배력 · 왕관' },
  { name: 'cost', column: 1, row: 0, label: '코스트 · 청색 보석' },
  { name: 'hp', column: 0, row: 1, label: '체력 · 하트' },
  { name: 'attack', column: 1, row: 1, label: '공격력 · 교차검' },
];

/**
 * 픽셀이 얼마나 키 색에 가까운지를 0~255로 잰다.
 * 그린 키는 G가 R·B보다 얼마나 솟았는지, 마젠타 키는 R과 B가 G보다
 * 얼마나 솟았는지를 본다. 밝기에 휘둘리지 않아 노이즈가 있어도 견딘다.
 */
function readKeyDominance(red, green, blue, key) {
  if (key === 'green') {
    return green - Math.max(red, blue);
  }

  return Math.min(red, blue) - green;
}

/**
 * 사분면마다 배경색이 하나씩이지만 두 키를 모두 본다.
 * 마젠타 면과 그린 면이 맞닿는 이음새 픽셀은 어느 한쪽 키만 보면
 * 걸러지지 않아 잘라낸 배지 가장자리에 색선으로 남는다.
 */
function readStrongestKey(red, green, blue) {
  const greenDominance = readKeyDominance(red, green, blue, 'green');
  const magentaDominance = readKeyDominance(red, green, blue, 'magenta');
  return greenDominance >= magentaDominance
    ? { key: 'green', dominance: greenDominance }
    : { key: 'magenta', dominance: magentaDominance };
}

/**
 * 반투명 픽셀에서 배경색이 섞인 몫을 역산해 걷어낸다.
 *
 * 관측색 P는 전경 F가 coverage만큼 덮인 결과 P = a·F + (1-a)·K 이므로
 * F = (P - (1-a)·K) / a 로 되돌린다. 이렇게 해야 검과 왕관 둘레의
 * 어두운 그림자가 보라색 띠가 아니라 원래의 어두운 그림자로 남는다.
 */
function unmixKeyColor(pixel, coverage, key) {
  if (coverage >= 1) {
    return pixel;
  }

  const keyColor = KEY_COLORS[key];
  return pixel.map((channel, index) =>
    Math.round(Math.min(255, Math.max(0, (channel - (1 - coverage) * keyColor[index]) / coverage))),
  );
}

/**
 * 가장자리에서 시작해 키 색 후보를 따라 번져 나가며 진짜 배경을 고른다.
 *
 * 배경은 반드시 사분면 테두리와 이어져 있다. 왕관 내부의 보라 면처럼
 * 금테로 둘러싸인 영역은 여기에 닿지 못하므로 배경으로 오인되지 않는다.
 */
function floodFillBackground(dominances, size) {
  const isBackground = new Uint8Array(size * size);
  const queue = [];

  const enqueue = (index) => {
    if (isBackground[index] || dominances[index] < BACKGROUND_CANDIDATE_DOMINANCE) {
      return;
    }
    isBackground[index] = 1;
    queue.push(index);
  };

  for (let edge = 0; edge < size; edge += 1) {
    enqueue(edge);
    enqueue((size - 1) * size + edge);
    enqueue(edge * size);
    enqueue(edge * size + size - 1);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % size;
    const y = (index - x) / size;

    if (x > 0) enqueue(index - 1);
    if (x < size - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - size);
    if (y < size - 1) enqueue(index + size);
  }

  return isBackground;
}

/** 사분면 하나를 잘라 크로마키를 걷어낸 RGBA 버퍼로 만든다. */
async function extractQuadrant(source, quadrant, quadrantSize) {
  const size = quadrantSize - EXTRACT_INSET * 2;
  const { data, info } = await source
    .clone()
    .extract({
      left: quadrant.column * quadrantSize + EXTRACT_INSET,
      top: quadrant.row * quadrantSize + EXTRACT_INSET,
      width: size,
      height: size,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = size * size;
  const dominances = new Int16Array(pixelCount);
  const keys = new Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * info.channels;
    const { key, dominance } = readStrongestKey(data[offset], data[offset + 1], data[offset + 2]);
    dominances[index] = dominance;
    keys[index] = key;
  }

  const isBackground = floodFillBackground(dominances, size);

  // 순수 배경의 우세도를 사분면마다 실측해 반투명 정도의 기준으로 삼는다.
  const backgroundDominances = [];
  for (let index = 0; index < pixelCount; index += 1) {
    if (isBackground[index]) {
      backgroundDominances.push(dominances[index]);
    }
  }
  backgroundDominances.sort((left, right) => left - right);
  // 배경 대부분은 순수 키 색이므로 중앙값을 "완전히 비어 있는" 기준으로 삼는다.
  const pureDominance = backgroundDominances[Math.floor(backgroundDominances.length * 0.5)];

  const rgba = Buffer.alloc(pixelCount * 4);
  let clearedPixels = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * info.channels;
    const pixel = [data[offset], data[offset + 1], data[offset + 2]];
    const target = index * 4;

    if (!isBackground[index]) {
      rgba[target] = pixel[0];
      rgba[target + 1] = pixel[1];
      rgba[target + 2] = pixel[2];
      rgba[target + 3] = 255;
      continue;
    }

    // 배경으로 확정된 픽셀은 키 색이 얼마나 남았는지로 덮인 정도를 되짚는다.
    const rawCoverage = Math.min(1, Math.max(0, 1 - dominances[index] / pureDominance));
    // 키 색 노이즈 때문에 순수 배경도 0에 딱 떨어지지 않는다. 눈에 보이지
    // 않는 잔여 알파는 0으로 눌러 배경을 완전히 비운다.
    const coverage = rawCoverage < MINIMUM_VISIBLE_COVERAGE ? 0 : rawCoverage;
    const [red, green, blue] = unmixKeyColor(pixel, coverage, keys[index]);
    const alpha = Math.round(coverage * 255);

    rgba[target] = red;
    rgba[target + 1] = green;
    rgba[target + 2] = blue;
    rgba[target + 3] = alpha;

    if (alpha === 0) {
      clearedPixels += 1;
    }
  }

  return { rgba, size, clearedRatio: clearedPixels / pixelCount };
}

async function main() {
  const source = sharp(SOURCE_PATH);
  const metadata = await source.metadata();

  if (metadata.width !== metadata.height || metadata.width % 2 !== 0) {
    throw new Error(
      `source_badge.png must be a square 2x2 sheet, got ${metadata.width}x${metadata.height}`,
    );
  }

  const quadrantSize = metadata.width / 2;
  await mkdir(BADGE_DIR, { recursive: true });

  for (const quadrant of QUADRANTS) {
    const { rgba, size, clearedRatio } = await extractQuadrant(source, quadrant, quadrantSize);
    const targetPath = path.join(BADGE_DIR, `${quadrant.name}.webp`);

    const output = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
      .resize(OUTPUT_SIZE, OUTPUT_SIZE)
      .webp({ quality: WEBP_QUALITY, alphaQuality: 100 })
      .toFile(targetPath);

    console.log(
      `${quadrant.name.padEnd(9)} ${quadrant.label.padEnd(18)} ` +
        `${OUTPUT_SIZE}x${OUTPUT_SIZE} ${String(output.size).padStart(6)}B  ` +
        `배경 제거 ${(clearedRatio * 100).toFixed(1)}%`,
    );
  }
}

await main();
