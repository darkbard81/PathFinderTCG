import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE_PATH = path.resolve('documents/UI_Template.png');
const OUTPUT_DIR = path.resolve('src/assets/ui/icons/lobby');
const ICON_SIZE = 64;

// UI_Template 10번 영역의 아이콘별 안전한 crop 영역이다. 원본은 1254x1254 기준이다.
// 위쪽 행의 상단과 아래쪽 행의 하단 구분선은 crop에서 제외한다.
const ICONS = [
  ['battle', 720, 758, 790, 817],
  ['card', 780, 758, 852, 817],
  ['deck', 846, 758, 914, 817],
  ['currency', 915, 762, 978, 817],
  ['quest', 976, 764, 1040, 817],
  ['gift', 1042, 764, 1090, 808],
  ['notice', 1105, 766, 1150, 808],
  ['menu', 1168, 768, 1212, 808],
  ['mail', 724, 818, 766, 870],
  ['friends', 776, 818, 822, 870],
  ['settings', 838, 818, 898, 870],
  ['shield', 903, 818, 956, 870],
  ['rank', 968, 818, 1027, 870],
  ['gem-blue', 1038, 817, 1090, 870],
  ['gem-blue-bright', 1101, 817, 1151, 870],
  ['gem-purple', 1165, 817, 1211, 870],
];

await fs.mkdir(OUTPUT_DIR, { recursive: true });

for (const [name, left, top, right, bottom] of ICONS) {
  const { data, info } = await sharp(SOURCE_PATH)
    .extract({
      left,
      top,
      width: right - left,
      height: bottom - top,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const backgroundColor = averageCornerColor(data, info.width, info.height, info.channels);
  const background = findConnectedBackground(
    data,
    info.width,
    info.height,
    info.channels,
    backgroundColor,
  );

  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    data[pixel * info.channels + 3] = background[pixel] ? 0 : 255;
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .resize({
      width: ICON_SIZE,
      height: ICON_SIZE,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 100, effort: 6, alphaQuality: 100 })
    .toFile(path.join(OUTPUT_DIR, `${name}.webp`));
}

console.log(`Built ${ICONS.length} lobby icons in ${path.relative(process.cwd(), OUTPUT_DIR)}`);

function averageCornerColor(data, width, height, channels) {
  const samples = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const total = samples.reduce(
    (sum, [x, y]) => {
      const offset = (y * width + x) * channels;
      return [sum[0] + data[offset], sum[1] + data[offset + 1], sum[2] + data[offset + 2]];
    },
    [0, 0, 0],
  );

  return total.map((value) => value / samples.length);
}

function findConnectedBackground(data, width, height, channels, backgroundColor) {
  const background = new Uint8Array(width * height);
  const queue = [];

  for (let x = 0; x < width; x += 1) {
    queue.push([x, 0], [x, height - 1]);
  }
  for (let y = 1; y < height - 1; y += 1) {
    queue.push([0, y], [width - 1, y]);
  }

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const pixel = y * width + x;
    if (background[pixel] || !isBackgroundPixel(data, pixel, channels, backgroundColor)) {
      continue;
    }

    background[pixel] = 1;
    if (x > 0) queue.push([x - 1, y]);
    if (x < width - 1) queue.push([x + 1, y]);
    if (y > 0) queue.push([x, y - 1]);
    if (y < height - 1) queue.push([x, y + 1]);
  }

  return background;
}

function isBackgroundPixel(data, pixel, channels, backgroundColor) {
  const offset = pixel * channels;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const distance = Math.hypot(
    red - backgroundColor[0],
    green - backgroundColor[1],
    blue - backgroundColor[2],
  );

  return luminance < 58 && distance < 58;
}
