/** blocking은 다음 timer 그룹 진행을 막고, detached는 막지 않는다. */
export type SequencePlayMode = 'blocking' | 'detached';

/** 같은 timer 그룹 안에서 동시에 시작할지, 앞뒤 step과 순차 실행할지 정한다. */
export type SequencePlaybackMode = 'parallel' | 'sequential';

export type SequenceStepAction = 'wait' | 'shake' | 'video' | 'custom';

export type SequencePoint = {
  x: number;
  y: number;
};

/**
 * 흔들 수 있는 대상이다. PixiJS Container가 그대로 만족한다.
 * 구조 타입이라 테스트에서 Pixi 없이 대역을 넘길 수 있다.
 */
export type SequenceTarget = {
  x: number;
  y: number;
  readonly destroyed: boolean;
  readonly parent: unknown;
};

/** Ticker 한 프레임이다. deltaTime은 프레임 비율이므로 반드시 deltaMS를 쓴다. */
export type SequenceTickerFrame = {
  deltaMS: number;
};

/** PixiJS Ticker가 그대로 만족하는 구조 타입이다. */
export type SequenceTicker = {
  add(fn: (ticker: SequenceTickerFrame) => void): unknown;
  remove(fn: (ticker: SequenceTickerFrame) => void): unknown;
};

export type SequenceStep = {
  /** 시퀀스 시작 후 실행 시점(ms)이다. */
  timer: number;

  /** 연출 또는 표시 지속 시간(ms)이다. */
  duration?: number;

  /** blocking은 완료 대기, detached는 자율 재생한다. */
  mode?: SequencePlayMode;

  /** 같은 timer 그룹 안에서 병렬 실행할지, 앞뒤 step과 순차 실행할지 정한다. */
  playback?: SequencePlaybackMode;

  /** shake action이 흔들 대상이다. */
  target?: SequenceTarget;

  /** video action이 표시될 좌표다. */
  x?: number;
  y?: number;

  /** video action의 표시 크기다. */
  width?: number;
  height?: number;

  from?: SequencePoint;
  to?: SequencePoint;

  /** video action이 재생할 자산 alias다. */
  assetId?: string;

  /** 흔들림 강도(px)다. shake action에서 사용한다. */
  intensity?: number;

  /** 흔들림 반복 횟수다. shake action에서 사용한다. */
  repeat?: number;

  /** 이징 이름이다. `Sine.easeInOut` 형식을 쓰며 대소문자를 가리지 않는다. */
  ease?: string;

  action: SequenceStepAction;

  /** 특수 연출이 필요할 때만 실행하는 사용자 정의 처리다. */
  run?: () => Promise<void> | void;
};

export type SequencePlayOptions = {
  /** true이면 play 중 입력 잠금 콜백을 호출한다. */
  lockInput?: boolean;
  onLockChange?: (locked: boolean) => void;
};

export type SequenceVideoRequest = {
  assetId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  playbackRate: number;
};

/**
 * 재생 중인 비디오 하나를 다루는 손잡이다.
 * `done`은 자연 종료 시 resolve하고, `stop`은 시간 초과나 중단 시 정리한다.
 */
export type SequenceVideoHandle = {
  done: Promise<void>;
  stop: () => void;
};

export type SequenceVideoPlayer = (request: SequenceVideoRequest) => SequenceVideoHandle;
