import type { PF2eAuthDomEventTargets } from '../components/PF2eAuthDomElement.js';

export type PF2eAuthAction = 'login' | 'register';

export interface PF2eAuthDomControllerConfig {
  readonly onSubmit: (action: PF2eAuthAction) => void;
}

export class PF2eAuthDomController {
  private readonly eventTargets: PF2eAuthDomEventTargets;
  private readonly onSubmit: (action: PF2eAuthAction) => void;

  constructor(eventTargets: PF2eAuthDomEventTargets, config: PF2eAuthDomControllerConfig) {
    this.eventTargets = eventTargets;
    this.onSubmit = config.onSubmit;
    this.eventTargets.form.addEventListener('submit', this.handleLoginSubmit);
    this.eventTargets.registerButton.addEventListener('click', this.handleRegisterClick);
  }

  destroy(): void {
    this.eventTargets.form.removeEventListener('submit', this.handleLoginSubmit);
    this.eventTargets.registerButton.removeEventListener('click', this.handleRegisterClick);
  }

  private readonly handleLoginSubmit = (event: Event): void => {
    event.preventDefault();
    this.onSubmit('login');
  };

  private readonly handleRegisterClick = (event: Event): void => {
    event.preventDefault();
    this.onSubmit('register');
  };
}
