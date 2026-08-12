import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BgmTrack, SoundTrack, VoiceTrack } from './playlist';
import type { SoundTrackSource } from './playlist-loader';
import type {
  PlayBufferOptions,
  PlayStreamOptions,
  SoundBackend,
  SoundVoiceHandle,
} from './sound-backend';
import { DEFAULT_CROSSFADE_SECONDS, SoundPlayer } from './sound-player';
import { createDefaultVolumeState, decibelToGain, levelToGain } from './volume';

type FakeHandle = SoundVoiceHandle & {
  setGain: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function createFakeBackend() {
  let running = true;
  const streams: (PlayStreamOptions & { handle: FakeHandle })[] = [];
  const buffers: (PlayBufferOptions & { handle: FakeHandle })[] = [];
  const channelGains = new Map<string, number>();

  const createHandle = (): FakeHandle => ({ setGain: vi.fn(), stop: vi.fn() });

  const backend: SoundBackend = {
    resume: vi.fn(() => {
      running = true;
      return Promise.resolve(true);
    }),
    isRunning: () => running,
    setChannelGain: vi.fn((channel: string, gain: number) => {
      channelGains.set(channel, gain);
    }),
    playStream: vi.fn((options: PlayStreamOptions) => {
      const handle = createHandle();
      streams.push({ ...options, handle });
      return handle;
    }),
    playBuffer: vi.fn((options: PlayBufferOptions) => {
      const handle = createHandle();
      buffers.push({ ...options, handle });
      return Promise.resolve(handle);
    }),
    destroy: vi.fn(),
  };

  return {
    backend,
    streams,
    buffers,
    channelGains,
    lock: () => {
      running = false;
    },
    /** resume을 직접 대역으로 갈아 끼운 경우에 상태만 따로 풀어 준다. */
    unlockBackend: () => {
      running = true;
    },
  };
}

const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function bgm(id: string, gainDb = 0): SoundTrackSource<BgmTrack> {
  return {
    id,
    sortSeq: 1,
    title: id,
    file: `${id}.mp3`,
    gainDb,
    durationSec: 100,
    loopStart: null,
    loopEnd: null,
    url: `/tcg/sound/bgm/${id}.mp3`,
  };
}

function voice(id: string): SoundTrackSource<VoiceTrack> {
  return {
    id,
    sortSeq: 1,
    title: id,
    file: `${id}.webm`,
    gainDb: 0,
    durationSec: 2,
    speakerId: null,
    subtitle: null,
    url: `/tcg/sound/voice/${id}.webm`,
  };
}

function sfx(id: string): SoundTrackSource<SoundTrack> {
  return {
    id,
    sortSeq: 1,
    title: id,
    file: `${id}.webm`,
    gainDb: 0,
    durationSec: 1,
    url: `/tcg/sound/sfx/${id}.webm`,
  };
}

describe('SoundPlayer BGM', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('같은 곡을 다시 요청하면 아무것도 하지 않는다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('intro'));
    player.requestBgm(bgm('intro'));

    expect(fake.streams).toHaveLength(1);
    expect(player.getPlayingBgmId()).toBe('intro');
  });

  it('첫 곡은 겹칠 것이 없으므로 제 크기로 바로 시작한다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('intro', -2));

    expect(fake.streams[0]).toMatchObject({
      url: '/tcg/sound/bgm/intro.mp3',
      channel: 'bgm',
      loop: true,
      gain: decibelToGain(-2),
    });
  });

  it('곡을 바꾸면 새 곡은 0에서 올리고 이전 곡은 0으로 내린다', () => {
    vi.useFakeTimers();
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('intro'));
    player.requestBgm(bgm('comic', -6));

    const [first, second] = fake.streams;
    expect(second?.gain).toBe(0);
    expect(second?.handle.setGain).toHaveBeenCalledWith(
      decibelToGain(-6),
      DEFAULT_CROSSFADE_SECONDS,
    );
    expect(first?.handle.setGain).toHaveBeenCalledWith(0, DEFAULT_CROSSFADE_SECONDS);

    // 페이드가 끝나기 전에 끊으면 소리가 잘린다.
    expect(first?.handle.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEFAULT_CROSSFADE_SECONDS * 1000);
    expect(first?.handle.stop).toHaveBeenCalled();
    expect(player.getPlayingBgmId()).toBe('comic');
  });

  it('null을 요청하면 음악을 끈다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('intro'));
    player.requestBgm(null);

    expect(fake.streams[0]?.handle.stop).toHaveBeenCalled();
    expect(player.getPlayingBgmId()).toBeNull();
  });

  it('비동기 BGM 재생이 실패하면 알리고 같은 곡을 다시 요청할 수 있다', () => {
    const fake = createFakeBackend();
    const onError = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onError });

    player.requestBgm(bgm('intro'));
    fake.streams[0]?.onError?.(new Error('media 재생 실패'));

    expect(player.getPlayingBgmId()).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('intro'), expect.any(Error));

    player.requestBgm(bgm('intro'));
    expect(fake.streams).toHaveLength(2);
  });
});

describe('SoundPlayer 자동재생 잠금', () => {
  it('잠긴 동안에는 재생하지 않고 마지막 요청만 기억한다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('intro'));
    player.requestBgm(bgm('comic'));
    expect(fake.streams).toHaveLength(0);

    await player.unlock();

    expect(fake.streams).toHaveLength(1);
    expect(player.getPlayingBgmId()).toBe('comic');
  });

  it('잠긴 동안에는 대사와 효과음을 내지 않는다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    const player = new SoundPlayer({ backend: fake.backend });

    await player.playVoice(voice('title-intro'));
    await player.playSfx(sfx('hit'));

    expect(fake.buffers).toHaveLength(0);
  });

  it('잠긴 동안 들어온 대사를 담아 두었다가 풀릴 때 낸다', async () => {
    // 쿠키 세션이 살아 있으면 로그인 화면이 입력 없이 지나가, 메뉴에 닿을 때까지
    // 제스처가 한 번도 없다. 버리면 대사가 영영 나지 않는다.
    const fake = createFakeBackend();
    fake.lock();
    const player = new SoundPlayer({ backend: fake.backend });

    await player.playVoice(voice('title-intro'));
    expect(fake.buffers).toHaveLength(0);

    await player.unlock();

    expect(fake.buffers).toHaveLength(1);
    expect(fake.buffers[0]?.channel).toBe('voice');
  });

  it('제스처와 같은 틱에 들어온 대사도 놓치지 않는다', async () => {
    // pointerdown이 unlock을 걸고, 같은 틱의 click이 대사를 요청하는 순서다.
    const fake = createFakeBackend();
    fake.lock();
    let resolveResume: (value: boolean) => void = () => undefined;
    fake.backend.resume = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveResume = resolve;
        }),
    );
    const player = new SoundPlayer({ backend: fake.backend });

    const unlocking = player.unlock();
    await player.playVoice(voice('title-intro'));
    expect(fake.buffers).toHaveLength(0);

    fake.unlockBackend();
    resolveResume(true);
    await unlocking;
    await flushMicrotasks();

    expect(fake.buffers).toHaveLength(1);
  });

  it('효과음은 담아 두지 않고 건너뛴 이유만 알린다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    const onError = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onError });

    await player.playSfx(sfx('hit'));
    await player.unlock();

    // 늦게 터지면 화면과 어긋난 자리에서 난다.
    expect(fake.buffers).toHaveLength(0);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('sfx 건너뜀'), null);
  });

  it('잠금이 풀리지 않으면 걸었던 곡을 접고 다음 기회를 남긴다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    fake.backend.resume = vi.fn(() => Promise.resolve(false));
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('intro'));

    await expect(player.unlock()).resolves.toBe(false);
    expect(fake.streams[0]?.handle.stop).toHaveBeenCalled();
    expect(player.getPlayingBgmId()).toBeNull();

    // 다시 시도하면 같은 곡을 건다. 요청을 잃어버리지 않는다.
    fake.backend.resume = vi.fn(() => Promise.resolve(true));
    await expect(player.unlock()).resolves.toBe(true);
    expect(player.getPlayingBgmId()).toBe('intro');
  });

  it('resume을 기다리기 전에 재생을 건다. iOS는 await 뒤를 제스처로 쳐주지 않는다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    let resolveResume: (value: boolean) => void = () => undefined;
    fake.backend.resume = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveResume = resolve;
        }),
    );
    const player = new SoundPlayer({ backend: fake.backend });
    player.requestBgm(bgm('intro'));

    const unlocking = player.unlock();

    // resume이 아직 끝나지 않았는데도 재생이 이미 걸려 있어야 한다.
    expect(fake.streams).toHaveLength(1);

    resolveResume(true);
    await expect(unlocking).resolves.toBe(true);
  });
});

describe('SoundPlayer 동시 발음', () => {
  it('새 대사가 이전 대사를 끊는다', async () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    await player.playVoice(voice('first'));
    await player.playVoice(voice('second'));

    expect(fake.buffers[0]?.handle.stop).toHaveBeenCalled();
    expect(fake.buffers[1]?.handle.stop).not.toHaveBeenCalled();
  });

  it('효과음이 한도를 넘으면 가장 오래된 것부터 끊는다', async () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend, sfxPolyphony: 2 });

    await player.playSfx(sfx('a'));
    await player.playSfx(sfx('b'));
    await player.playSfx(sfx('c'));

    expect(fake.buffers[0]?.handle.stop).toHaveBeenCalled();
    expect(fake.buffers[1]?.handle.stop).not.toHaveBeenCalled();
    expect(fake.buffers[2]?.handle.stop).not.toHaveBeenCalled();
  });

  it('끝난 효과음은 자리를 비워 준다', async () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend, sfxPolyphony: 1 });

    await player.playSfx(sfx('a'));
    fake.buffers[0]?.onEnded?.();
    await player.playSfx(sfx('b'));

    // 자리가 비었으므로 두 번째를 넣느라 첫 번째를 끊을 필요가 없다.
    expect(fake.buffers[0]?.handle.stop).not.toHaveBeenCalled();
  });

  it('받아 오는 사이에 끝난 효과음은 자리를 차지하지 않는다', async () => {
    const fake = createFakeBackend();
    // playBuffer가 손잡이를 돌려주기 전에 끝나는 상황이다.
    fake.backend.playBuffer = vi.fn((options: PlayBufferOptions) => {
      options.onEnded?.();
      return Promise.resolve({ setGain: vi.fn(), stop: vi.fn() });
    });
    const player = new SoundPlayer({ backend: fake.backend, sfxPolyphony: 1 });

    await player.playSfx(sfx('a'));
    await player.playSfx(sfx('b'));

    // 죽은 손잡이가 남아 있으면 두 번째가 첫 번째를 끊어야 했을 것이다.
    expect(fake.backend.playBuffer).toHaveBeenCalledTimes(2);
  });

  it('소리 하나를 못 받아도 던지지 않는다', async () => {
    const fake = createFakeBackend();
    fake.backend.playBuffer = vi.fn(() => Promise.reject(new Error('404')));
    const player = new SoundPlayer({ backend: fake.backend });

    await expect(player.playSfx(sfx('missing'))).resolves.toBeUndefined();
  });
});

describe('SoundPlayer 볼륨', () => {
  it('만들 때 채널 게인을 모두 반영한다', () => {
    const fake = createFakeBackend();
    new SoundPlayer({ backend: fake.backend });

    const state = createDefaultVolumeState();
    expect(fake.channelGains.get('master')).toBe(levelToGain(state.master.level));
    expect(fake.channelGains.get('bgm')).toBe(levelToGain(state.bgm.level));
  });

  it('볼륨을 바꾸면 곧바로 게인에 반영하고 바깥에 알린다', () => {
    const fake = createFakeBackend();
    const onVolumeChange = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onVolumeChange });

    player.setVolume('bgm', { level: 50 });

    expect(fake.channelGains.get('bgm')).toBe(levelToGain(50));
    expect(onVolumeChange).toHaveBeenCalledWith(
      expect.objectContaining({ bgm: { level: 50, muted: false } }),
    );
  });

  it('음소거는 게인을 0으로 두되 level은 남긴다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.setVolume('bgm', { level: 70 });
    player.setVolume('bgm', { muted: true });
    expect(fake.channelGains.get('bgm')).toBe(0);

    player.setVolume('bgm', { muted: false });
    expect(fake.channelGains.get('bgm')).toBe(levelToGain(70));
    expect(player.getVolume().bgm.level).toBe(70);
  });
});

describe('SoundPlayer destroy', () => {
  it('울리던 소리를 모두 끊고 backend를 정리한다', async () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('intro'));
    await player.playVoice(voice('line'));
    await player.playSfx(sfx('hit'));
    player.destroy();

    expect(fake.streams[0]?.handle.stop).toHaveBeenCalled();
    expect(fake.buffers[0]?.handle.stop).toHaveBeenCalled();
    expect(fake.buffers[1]?.handle.stop).toHaveBeenCalled();
    expect(fake.backend.destroy).toHaveBeenCalled();
  });

  it('destroy 뒤의 요청은 무시한다', async () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.destroy();
    player.requestBgm(bgm('intro'));
    await player.playSfx(sfx('hit'));

    expect(fake.streams).toHaveLength(0);
    expect(fake.buffers).toHaveLength(0);
  });
});

describe('SoundPlayer 실패 알림', () => {
  it('재생에 실패하면 이유를 알린다', async () => {
    const fake = createFakeBackend();
    fake.backend.playBuffer = vi.fn(() => Promise.reject(new Error('decode 실패')));
    const onError = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onError });

    await player.playVoice(voice('title-intro'));

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('title-intro'), expect.any(Error));
  });

  it('잠금이 안 풀린 것과 재생 실패를 구분해 알린다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    const onError = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onError });

    await player.playSfx(sfx('hit'));

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('잠금'), null);
    expect(fake.backend.playBuffer).not.toHaveBeenCalled();
  });

  it('담아 둔 대사는 건너뜀으로 알리지 않는다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    const onError = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onError });

    await player.playVoice(voice('title-intro'));

    // 나중에 낼 것이므로 실패가 아니다.
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('SoundPlayer 로비 플레이리스트', () => {
  const list = (ids: string[]) => ids.map((id) => bgm(id));

  it('첫 곡을 걸고, 여러 곡이면 반복을 끈다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b', 'c']), 'sequential');

    // loop가 참이면 ended가 오지 않아 다음 곡으로 넘어갈 수 없다.
    expect(fake.streams[0]).toMatchObject({ url: '/tcg/sound/bgm/a.mp3', loop: false });
    expect(player.getPlayingBgmId()).toBe('a');
  });

  it('곡이 하나뿐이면 반복시켜 이음매를 만들지 않는다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a']), 'sequential');

    expect(fake.streams[0]?.loop).toBe(true);
  });

  it('곡이 끝나면 적힌 다음 곡으로 넘어간다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b', 'c']), 'sequential');
    fake.streams[0]?.onEnded?.();

    expect(player.getPlayingBgmId()).toBe('b');
  });

  it('마지막 곡이 끝나면 처음으로 돌아간다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');
    fake.streams[0]?.onEnded?.();
    fake.streams[1]?.onEnded?.();

    expect(player.getPlayingBgmId()).toBe('a');
  });

  it('한 곡을 못 받아도 목록이 멈추지 않는다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');
    fake.streams[0]?.onError?.(new Error('404'));

    expect(player.getPlayingBgmId()).toBe('b');
  });

  it('같은 목록을 다시 요청하면 되감지 않는다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');
    fake.streams[0]?.onEnded?.();
    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');

    expect(player.getPlayingBgmId()).toBe('b');
    expect(fake.streams).toHaveLength(2);
  });

  it('재생 방식이 바뀌면 목록을 다시 건다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');
    player.requestBgmPlaylist(list(['a', 'b']), 'shuffle');

    expect(fake.streams.length).toBeGreaterThan(1);
  });

  it('빈 목록은 울리던 것을 그대로 둔다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('main'));
    player.requestBgmPlaylist([], 'sequential');

    // 로비 목록이 비면 Main BGM이 이어져야 한다.
    expect(player.getPlayingBgmId()).toBe('main');
    expect(player.getPlaylistTrackIds()).toBeNull();
  });

  it('한 곡 요청으로 돌아가면 목록에서 빠진다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');
    expect(player.getPlaylistTrackIds()).toEqual(['a', 'b']);

    player.requestBgm(bgm('main'));

    expect(player.getPlaylistTrackIds()).toBeNull();
    expect(player.getPlayingBgmId()).toBe('main');
  });

  it('잠긴 동안 들어온 목록도 풀릴 때 시작한다', async () => {
    const fake = createFakeBackend();
    fake.lock();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');
    expect(fake.streams).toHaveLength(0);

    await player.unlock();

    expect(player.getPlayingBgmId()).toBe('a');
  });
});

describe('SoundPlayer 재생 곡 알림', () => {
  it('곡이 바뀔 때마다 알린다', () => {
    const fake = createFakeBackend();
    const onBgmTrackChange = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onBgmTrackChange });

    player.requestBgmPlaylist([bgm('a'), bgm('b')], 'sequential');
    expect(onBgmTrackChange).toHaveBeenLastCalledWith('a');

    fake.streams[0]?.onEnded?.();
    expect(onBgmTrackChange).toHaveBeenLastCalledWith('b');
  });

  it('같은 곡을 다시 요청하면 알리지 않는다', () => {
    const fake = createFakeBackend();
    const onBgmTrackChange = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onBgmTrackChange });

    player.requestBgm(bgm('intro'));
    onBgmTrackChange.mockClear();
    player.requestBgm(bgm('intro'));

    // 듣는 쪽이 쓸데없이 다시 그리지 않게 한다.
    expect(onBgmTrackChange).not.toHaveBeenCalled();
  });

  it('음악을 끄면 null로 알린다', () => {
    const fake = createFakeBackend();
    const onBgmTrackChange = vi.fn();
    const player = new SoundPlayer({ backend: fake.backend, onBgmTrackChange });

    player.requestBgm(bgm('intro'));
    player.requestBgm(null);

    expect(onBgmTrackChange).toHaveBeenLastCalledWith(null);
  });
});

describe('SoundPlayer 곡 건너뛰기', () => {
  const list = (ids: string[]) => ids.map((id) => bgm(id));

  it('다음 곡으로 건너뛴다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b', 'c']), 'sequential');
    player.skipBgm(1);

    expect(player.getPlayingBgmId()).toBe('b');
  });

  it('이전 곡으로 되돌아간다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b', 'c']), 'sequential');
    player.skipBgm(1);
    player.skipBgm(-1);

    expect(player.getPlayingBgmId()).toBe('a');
  });

  it('첫 곡에서 이전을 누르면 마지막 곡으로 간다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b', 'c']), 'sequential');
    player.skipBgm(-1);

    expect(player.getPlayingBgmId()).toBe('c');
  });

  it('마지막 곡에서 다음을 누르면 처음으로 돌아간다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b']), 'sequential');
    player.skipBgm(1);
    player.skipBgm(1);

    expect(player.getPlayingBgmId()).toBe('a');
  });

  it('목록을 돌고 있지 않으면 아무것도 하지 않는다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgm(bgm('main'));
    player.skipBgm(1);

    // 한 곡만 거는 요청에는 건너뛸 곳이 없다.
    expect(player.getPlayingBgmId()).toBe('main');
    expect(fake.streams).toHaveLength(1);
  });

  it('건너뛴 뒤에도 곡이 끝나면 그 자리에서 이어 간다', () => {
    const fake = createFakeBackend();
    const player = new SoundPlayer({ backend: fake.backend });

    player.requestBgmPlaylist(list(['a', 'b', 'c']), 'sequential');
    player.skipBgm(1);
    fake.streams.at(-1)?.onEnded?.();

    expect(player.getPlayingBgmId()).toBe('c');
  });
});
