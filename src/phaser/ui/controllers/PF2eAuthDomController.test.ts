import { describe, expect, it, vi } from 'vitest';

import { PF2eAuthDomController } from './PF2eAuthDomController.js';

describe('PF2eAuthDomController', () => {
  it('maps native form submit and register click events to auth actions', () => {
    const form = new EventTarget();
    const registerButton = new EventTarget();
    const onSubmit = vi.fn();
    const controller = new PF2eAuthDomController(
      { form, registerButton },
      {
        onSubmit,
      },
    );
    const loginEvent = new Event('submit', { cancelable: true });
    const registerEvent = new Event('click', { cancelable: true });

    form.dispatchEvent(loginEvent);
    registerButton.dispatchEvent(registerEvent);

    expect(loginEvent.defaultPrevented).toBe(true);
    expect(registerEvent.defaultPrevented).toBe(true);
    expect(onSubmit.mock.calls).toEqual([['login'], ['register']]);

    controller.destroy();
  });

  it('removes native listeners when destroyed', () => {
    const form = new EventTarget();
    const registerButton = new EventTarget();
    const onSubmit = vi.fn();
    const controller = new PF2eAuthDomController(
      { form, registerButton },
      {
        onSubmit,
      },
    );

    controller.destroy();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    registerButton.dispatchEvent(new Event('click', { cancelable: true }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
