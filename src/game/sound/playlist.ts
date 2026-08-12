/**
 * 소리 플레이리스트를 읽어 런타임 구조로 정규화한다.
 *
 * 플레이리스트는 `assets/sound/<채널>/playlist.json`에 있고 손으로 고친다.
 * `assets.json`이 배달(path, revision)을 맡는 것과 나눠, 이쪽은 의미를 맡는다.
 * 자산 트리는 저장소 밖에 있어 타입 검사가 닿지 않으므로 경계에서 전부 확인한다.
 */

export const SOUND_PLAYLIST_SCHEMA_VERSION = 1 as const;

/** 게인 그래프의 채널이다. 폴더 이름과 같다. */
export const SOUND_CHANNELS = ['bgm', 'sfx', 'voice'] as const;
export type SoundChannel = (typeof SOUND_CHANNELS)[number];

/**
 * 트랙별 보정 게인을 잴 때 쓴 기준 라우드니스다.
 * `gainDb`는 이 값에 맞추는 차이라 재보정할 때 기준을 알아야 한다.
 */
export const DEFAULT_REFERENCE_LOUDNESS_LUFS = -16;

/** 보정 게인의 허용 범위다. 벗어난 값은 재는 과정이 틀어진 것으로 본다. */
export const GAIN_DB_RANGE = { min: -60, max: 20 } as const;

/** 채널과 무관하게 모든 트랙이 갖는 값이다. */
export type SoundTrack = {
  id: string;
  /** 목록에 보여줄 순서다. 정규화가 이 값으로 정렬해 돌려준다. */
  sortSeq: number;
  title: string;
  /** 플레이리스트가 놓인 폴더 기준 파일 이름이다. 경로 구분자를 담지 않는다. */
  file: string;
  /** 기준 라우드니스에 맞추는 보정 게인이다. 재생기가 게인 노드에 적용한다. */
  gainDb: number;
  durationSec: number;
};

/** bgm 트랙이다. 루프 구간은 작곡 쪽에서 받아 적는다. 없으면 파일 전체를 반복한다. */
export type BgmTrack = SoundTrack & {
  loopStart: number | null;
  loopEnd: number | null;
};

/** voice 트랙이다. 화자와 자막은 아직 비어 있을 수 있다. */
export type VoiceTrack = SoundTrack & {
  speakerId: string | null;
  subtitle: string | null;
};

export type SoundPlaylist<TTrack extends SoundTrack = SoundTrack> = {
  schemaVersion: typeof SOUND_PLAYLIST_SCHEMA_VERSION;
  channel: SoundChannel;
  referenceLoudnessLufs: number;
  tracks: TTrack[];
};

type JsonRecord = Record<string, unknown>;

/**
 * `title`이 `01. `처럼 순번을 달고 있으면 그 숫자가 `sortSeq`와 같아야 한다.
 *
 * 같은 번호가 두 곳에 있으니 한쪽만 고치면 목록에 적힌 번호와 정렬이 따로 논다.
 * 순번을 달지 않은 제목(voice가 그렇다)은 이 검사를 건너뛴다. 규칙을 강요하지 않고
 * 쓰는 곳에서만 어긋남을 잡는다. 제목이 정말 "숫자. "로 시작하면 순번으로 오해하는데,
 * 그때는 조용히 넘어가지 않고 불일치로 걸리므로 제목을 바꾸면 된다.
 */
const TITLE_SEQUENCE_PREFIX = /^(\d+)\.\s+/;

/** bgm 플레이리스트를 정규화한다. */
export function normalizeBgmPlaylist(value: unknown): SoundPlaylist<BgmTrack> {
  return normalizeSoundPlaylist(value, 'bgm', readBgmTrack);
}

/** voice 플레이리스트를 정규화한다. */
export function normalizeVoicePlaylist(value: unknown): SoundPlaylist<VoiceTrack> {
  return normalizeSoundPlaylist(value, 'voice', readVoiceTrack);
}

/**
 * 플레이리스트의 공통부를 확인하고 채널별 트랙 해석기를 태운다.
 *
 * `expectedChannel`을 함께 받는다. 폴더와 파일 안의 `channel`이 어긋나면
 * bgm 플레이리스트를 voice 폴더에 복사해 놓고 못 알아채는 일이 생긴다.
 */
export function normalizeSoundPlaylist<TTrack extends SoundTrack>(
  value: unknown,
  expectedChannel: SoundChannel,
  readTrack: (track: JsonRecord, label: string) => TTrack,
): SoundPlaylist<TTrack> {
  if (!isRecord(value)) {
    throw new Error('playlist must be an object');
  }

  if (value.schemaVersion !== SOUND_PLAYLIST_SCHEMA_VERSION) {
    throw new Error(`playlist.schemaVersion must be ${SOUND_PLAYLIST_SCHEMA_VERSION}`);
  }

  if (value.channel !== expectedChannel) {
    throw new Error(`playlist.channel must be ${expectedChannel}`);
  }

  const referenceLoudnessLufs =
    value.referenceLoudnessLufs === undefined
      ? DEFAULT_REFERENCE_LOUDNESS_LUFS
      : readFiniteNumber(value.referenceLoudnessLufs, 'playlist.referenceLoudnessLufs');

  if (!Array.isArray(value.tracks)) {
    throw new Error('playlist.tracks must be an array');
  }

  const tracks = value.tracks.map((track, index) => {
    const label = `playlist.tracks[${index}]`;
    if (!isRecord(track)) {
      throw new Error(`${label} must be an object`);
    }

    return readTrack(track, label);
  });

  assertUnique(
    tracks.map((track) => track.id),
    'playlist.tracks[].id',
  );
  assertUnique(
    tracks.map((track) => track.sortSeq),
    'playlist.tracks[].sortSeq',
  );

  return {
    schemaVersion: SOUND_PLAYLIST_SCHEMA_VERSION,
    channel: expectedChannel,
    referenceLoudnessLufs,
    // 배열 순서가 아니라 sortSeq가 순서를 정한다. 쓰는 쪽이 다시 정렬하지 않게 한다.
    tracks: [...tracks].sort((left, right) => left.sortSeq - right.sortSeq),
  };
}

/**
 * 플레이리스트의 `file`을 assets 루트 기준 경로로 바꾼다.
 * 이 경로로 `assets.json`에서 자산을 찾는다.
 */
export function resolveSoundAssetPath(channel: SoundChannel, file: string): string {
  return `sound/${channel}/${file}`;
}

/** 채널의 플레이리스트가 놓인 assets 루트 기준 경로다. */
export function resolveSoundPlaylistPath(channel: SoundChannel): string {
  return `sound/${channel}/playlist.json`;
}

function readSoundTrack(track: JsonRecord, label: string): SoundTrack {
  const id = readNonEmptyString(track.id, `${label}.id`);
  const sortSeq = readPositiveInteger(track.sortSeq, `${label}.sortSeq`);
  const title = readNonEmptyString(track.title, `${label}.title`);
  const durationSec = readFiniteNumber(track.durationSec, `${label}.durationSec`);
  if (durationSec <= 0) {
    throw new Error(`${label}.durationSec must be greater than 0`);
  }

  const titleSequence = TITLE_SEQUENCE_PREFIX.exec(title);
  if (titleSequence && Number(titleSequence[1]) !== sortSeq) {
    throw new Error(
      `${label}.title starts with ${titleSequence[1]} but sortSeq is ${sortSeq}. 두 값을 함께 고친다`,
    );
  }

  const gainDb = readFiniteNumber(track.gainDb, `${label}.gainDb`);
  if (gainDb < GAIN_DB_RANGE.min || gainDb > GAIN_DB_RANGE.max) {
    throw new Error(
      `${label}.gainDb must be between ${GAIN_DB_RANGE.min} and ${GAIN_DB_RANGE.max}`,
    );
  }

  return {
    id,
    sortSeq,
    title,
    file: readFileName(track.file, `${label}.file`),
    gainDb,
    durationSec,
  };
}

function readBgmTrack(track: JsonRecord, label: string): BgmTrack {
  const base = readSoundTrack(track, label);
  const loopStart = readNullableFiniteNumber(track.loopStart, `${label}.loopStart`);
  const loopEnd = readNullableFiniteNumber(track.loopEnd, `${label}.loopEnd`);

  // 한쪽만 있으면 어디서 어디까지 반복할지 정해지지 않는다. 조용히 무시하지 않는다.
  if ((loopStart === null) !== (loopEnd === null)) {
    throw new Error(`${label} must set both loopStart and loopEnd, or neither`);
  }

  if (loopStart !== null && loopEnd !== null) {
    if (loopStart < 0) {
      throw new Error(`${label}.loopStart must not be negative`);
    }
    if (loopStart >= loopEnd) {
      throw new Error(`${label}.loopStart must be less than loopEnd`);
    }
    if (loopEnd > base.durationSec) {
      throw new Error(`${label}.loopEnd must not exceed durationSec`);
    }
  }

  return { ...base, loopStart, loopEnd };
}

function readVoiceTrack(track: JsonRecord, label: string): VoiceTrack {
  return {
    ...readSoundTrack(track, label),
    speakerId: readNullableNonEmptyString(track.speakerId, `${label}.speakerId`),
    subtitle: readNullableNonEmptyString(track.subtitle, `${label}.subtitle`),
  };
}

/**
 * 파일 이름이 폴더를 벗어나지 않는지 본다.
 * 이 값은 그대로 URL 경로가 되므로 구분자와 상위 이동을 막는다.
 */
function readFileName(value: unknown, field: string): string {
  const file = readNonEmptyString(value, field);
  if (file.includes('/') || file.includes('\\') || file.split('.').includes('..')) {
    throw new Error(`${field} must be a file name without a path`);
  }

  return file;
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const text = value.trim();
  if (text.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return text;
}

function readNullableNonEmptyString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readNonEmptyString(value, field);
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }

  return value;
}

function readNullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readFiniteNumber(value, field);
}

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be an integer of 1 or more`);
  }

  return value;
}

function assertUnique(values: (string | number)[], field: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${field} must be unique, but ${String(value)} appears twice`);
    }
    seen.add(value);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
