/**
 * 자동재생 잠금을 첫 사용자 입력에서 푸는 장치다.
 *
 * AudioContext는 `suspended`로 시작하고 사용자 제스처 전에는 소리가 나지 않는다.
 * 제스처 안에서 `resume()`을 불러야 풀린다.
 */

/** 잠금을 풀 기회로 삼는 입력이다. 포인터가 없는 기기도 있어 키 입력을 함께 본다. */
export const UNLOCK_GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

export type UnlockGestureTarget = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export type UnlockOnGestureOptions = {
  target: UnlockGestureTarget;
  /** 풀렸으면 true를 돌려준다. 던지더라도 다음 입력에서 다시 시도한다. */
  unlock: () => Promise<boolean>;
};

/**
 * 잠금이 풀릴 때까지 입력을 계속 듣는다. 풀리면 스스로 떨어진다.
 *
 * `{ once: true }`로 달면 안 된다. 첫 시도가 거절되면 다시 기회가 없어 그 판이
 * 끝날 때까지 소리가 나지 않는다. 브라우저는 제스처의 종류나 시점에 따라 거절하므로
 * 한 번 실패하는 일이 드물지 않다.
 *
 * @returns 더 듣지 않게 떼는 함수다.
 */
export function unlockSoundOnGesture(options: UnlockOnGestureOptions): () => void {
  let unlocked = false;

  const detach = (): void => {
    for (const event of UNLOCK_GESTURE_EVENTS) {
      options.target.removeEventListener(event, handleGesture);
    }
  };

  /*
   * 진행 중인 시도가 있어도 막지 않는다.
   *
   * `AudioContext.resume()`은 컨텍스트를 끝내 시작할 수 없으면 **약속을 결정하지 않고
   * 매달아 둔다.** 그래서 "시도 중이면 건너뛴다"는 빗장을 걸면, 첫 시도가 그렇게 걸린
   * 순간 빗장이 영영 내려가지 않아 이후 모든 입력이 무시된다. 어디를 눌러도 소리가
   * 나지 않는 상태가 된다.
   *
   * 겹쳐 부르는 비용은 없다. `resume()`은 여러 번 불러도 되고, `unlock()`은 이미 걸린
   * 곡을 다시 걸지 않는다.
   */
  function handleGesture(): void {
    if (unlocked) {
      return;
    }

    options.unlock().then(
      (result) => {
        if (result) {
          unlocked = true;
          detach();
        }
      },
      () => undefined,
    );
  }

  for (const event of UNLOCK_GESTURE_EVENTS) {
    options.target.addEventListener(event, handleGesture);
  }

  return detach;
}
