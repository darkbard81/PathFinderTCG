import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from './web-audio-backend';

type FakeGainNode = {
  gain: {
    value: number;
    cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    setTargetAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type FakeBufferSource = {
  buffer: AudioBuffer | null;
  loop: boolean;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function createFakeAudioContext() {
  const gains: FakeGainNode[] = [];
  const bufferSources: FakeBufferSource[] = [];
  const decodedBuffer = {} as AudioBuffer;
  const context = {
    currentTime: 12.5,
    destination: {},
    state: 'running',
    createGain: () => {
      const gain: FakeGainNode = {
        gain: {
          value: 1,
          cancelAndHoldAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    },
    createBufferSource: () => {
      const source: FakeBufferSource = {
        buffer: null,
        loop: false,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(source);
      return source;
    },
    decodeAudioData: vi.fn(async () => decodedBuffer),
    close: vi.fn(async () => undefined),
  };

  return { context, gains, bufferSources, decodedBuffer };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebAudioBackend 채널 게인', () => {
  it('현재 자동화 값을 보존한 뒤 짧은 선형 램프로 옮긴다', () => {
    const fake = createFakeAudioContext();
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);

    backend.setChannelGain('bgm', 0.25);

    const bgm = fake.gains[1];
    expect(bgm?.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(12.5);
    expect(bgm?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 12.52);
    expect(bgm?.gain.setTargetAtTime).not.toHaveBeenCalled();
  });
});

describe('WebAudioBackend BGM 임시 버퍼 경로', () => {
  it('BGM을 내려받아 decodeAudioData로 풀고 BufferSource에서 반복한다', async () => {
    const encoded = new ArrayBuffer(8);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => encoded,
      })),
    );
    const fake = createFakeAudioContext();
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);

    const handle = backend.playStream({
      url: '/tcg/sound/bgm/main.webm',
      channel: 'bgm',
      gain: 0.5,
      loop: true,
    });

    await vi.waitFor(() => expect(fake.bufferSources).toHaveLength(1));
    const source = fake.bufferSources[0];
    expect(fetch).toHaveBeenCalledWith('/tcg/sound/bgm/main.webm');
    expect(fake.context.decodeAudioData).toHaveBeenCalledWith(encoded);
    expect(source?.buffer).toBe(fake.decodedBuffer);
    expect(source?.loop).toBe(true);
    expect(source?.start).toHaveBeenCalledOnce();

    handle.stop();
    expect(source?.stop).toHaveBeenCalledOnce();
    expect(source?.disconnect).toHaveBeenCalledOnce();
  });

  it('BGM 디코드 실패를 알리고 만든 게인 노드를 정리한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
    const fake = createFakeAudioContext();
    const error = new Error('decode 실패');
    fake.context.decodeAudioData.mockRejectedValue(error);
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);
    const onError = vi.fn();

    backend.playStream({
      url: '/tcg/sound/bgm/main.webm',
      channel: 'bgm',
      gain: 0.5,
      loop: true,
      onError,
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(fake.gains[4]?.disconnect).toHaveBeenCalledOnce();
    expect(fake.bufferSources).toHaveLength(0);
  });

  it('디코드가 끝나기 전에 멈춘 BGM은 나중에 소스 노드를 만들지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
    const fake = createFakeAudioContext();
    let finishDecode: (buffer: AudioBuffer) => void = () => undefined;
    fake.context.decodeAudioData.mockReturnValue(
      new Promise<AudioBuffer>((resolve) => {
        finishDecode = resolve;
      }),
    );
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);
    const handle = backend.playStream({
      url: '/tcg/sound/bgm/main.webm',
      channel: 'bgm',
      gain: 0.5,
      loop: true,
    });
    await vi.waitFor(() => expect(fake.context.decodeAudioData).toHaveBeenCalledOnce());

    handle.stop();
    finishDecode(fake.decodedBuffer);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.bufferSources).toHaveLength(0);
    expect(fake.gains[4]?.disconnect).toHaveBeenCalledOnce();
  });
});
