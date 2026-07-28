import * as Phaser from 'phaser';

import type { AuthDomLayout } from '../../../ui/layout/authDomLayout.js';

export interface PF2eAuthCredentials {
  readonly username: string;
  readonly password: string;
}

export type PF2eAuthStatusTone = 'normal' | 'danger';

export interface PF2eAuthDomEventTargets {
  readonly form: EventTarget;
  readonly registerButton: EventTarget;
}

export interface PF2eAuthDomElementConfig {
  readonly initialStatus: string;
}

interface AuthDomNodes {
  readonly root: HTMLElement;
  readonly form: HTMLFormElement;
  readonly usernameInput: HTMLInputElement;
  readonly passwordInput: HTMLInputElement;
  readonly loginButton: HTMLButtonElement;
  readonly registerButton: HTMLButtonElement;
  readonly status: HTMLElement;
}

let authDomInstance = 0;

function createField(
  id: string,
  labelText: string,
  inputType: 'text' | 'password',
  maximumLength: number,
): { readonly field: HTMLElement; readonly input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'pf2e-auth__field';
  field.htmlFor = id;

  const label = document.createElement('span');
  label.className = 'pf2e-auth__label';
  label.textContent = labelText;

  const control = document.createElement('span');
  control.className = 'pf2e-auth__control';

  const input = document.createElement('input');
  input.className = 'pf2e-auth__input';
  input.id = id;
  input.name = inputType === 'password' ? 'password' : 'username';
  input.type = inputType;
  input.required = true;
  input.maxLength = maximumLength;
  input.autocomplete = inputType === 'password' ? 'current-password' : 'username';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('enterkeyhint', inputType === 'password' ? 'go' : 'next');

  control.append(input);
  field.append(label, control);

  return Object.freeze({ field, input });
}

function createButton(type: 'submit' | 'button', text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'pf2e-auth__button';
  button.type = type;
  button.textContent = text;
  return button;
}

function createAuthDomNodes(initialStatus: string): AuthDomNodes {
  authDomInstance += 1;
  const idPrefix = `pf2e-auth-${authDomInstance}`;

  const root = document.createElement('section');
  root.className = 'pf2e-auth';
  root.dataset.pf2eAuth = 'true';
  root.setAttribute('aria-labelledby', `${idPrefix}-title`);

  const layout = document.createElement('div');
  layout.className = 'pf2e-auth__layout';

  const header = document.createElement('header');
  header.className = 'pf2e-auth__header';

  const title = document.createElement('h1');
  title.className = 'pf2e-auth__title';
  title.id = `${idPrefix}-title`;
  title.textContent = 'Pathfinder TCG';

  const subtitle = document.createElement('p');
  subtitle.className = 'pf2e-auth__subtitle';
  subtitle.textContent = '로컬 계정으로 로그인하거나 새 계정을 만든 뒤 세이브 슬롯을 선택하세요.';

  header.append(title, subtitle);

  const status = document.createElement('p');
  status.className = 'pf2e-auth__status';
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.textContent = initialStatus;

  const formPanel = document.createElement('div');
  formPanel.className = 'pf2e-auth__form-panel';

  const form = document.createElement('form');
  form.className = 'pf2e-auth__form';
  form.noValidate = true;

  const username = createField(`${idPrefix}-username`, '사용자명', 'text', 24);
  username.input.minLength = 3;
  username.input.pattern = '[a-z0-9_\\-]{3,24}';

  const password = createField(`${idPrefix}-password`, '비밀번호', 'password', 128);
  password.input.minLength = 12;

  const actions = document.createElement('div');
  actions.className = 'pf2e-auth__actions';

  const loginButton = createButton('submit', '로그인');
  loginButton.dataset.authAction = 'login';

  const registerButton = createButton('button', '가입 후 로그인');
  registerButton.dataset.authAction = 'register';

  actions.append(loginButton, registerButton);
  form.append(username.field, password.field, actions);
  formPanel.append(form);
  layout.append(header, status, formPanel);
  root.append(layout);

  return Object.freeze({
    root,
    form,
    usernameInput: username.input,
    passwordInput: password.input,
    loginButton,
    registerButton,
    status,
  });
}

export class PF2eAuthDomElement extends Phaser.GameObjects.DOMElement {
  private readonly root: HTMLElement;
  private readonly usernameInput: HTMLInputElement;
  private readonly passwordInput: HTMLInputElement;
  private readonly loginButton: HTMLButtonElement;
  private readonly registerButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly eventTargets: PF2eAuthDomEventTargets;

  constructor(scene: Phaser.Scene, config: PF2eAuthDomElementConfig) {
    const nodes = createAuthDomNodes(config.initialStatus);
    super(scene, 0, 0, nodes.root);

    scene.add.existing(this);
    this.root = nodes.root;
    this.usernameInput = nodes.usernameInput;
    this.passwordInput = nodes.passwordInput;
    this.loginButton = nodes.loginButton;
    this.registerButton = nodes.registerButton;
    this.status = nodes.status;
    this.eventTargets = Object.freeze({
      form: nodes.form,
      registerButton: nodes.registerButton,
    });
    this.setOrigin(0.5);
  }

  getCredentials(): PF2eAuthCredentials {
    return Object.freeze({
      username: this.usernameInput.value,
      password: this.passwordInput.value,
    });
  }

  getEventTargets(): PF2eAuthDomEventTargets {
    return this.eventTargets;
  }

  setEnabled(enabled: boolean): this {
    this.usernameInput.disabled = !enabled;
    this.passwordInput.disabled = !enabled;
    this.loginButton.disabled = !enabled;
    this.registerButton.disabled = !enabled;
    this.root.setAttribute('aria-busy', String(!enabled));
    return this;
  }

  setStatus(message: string, tone: PF2eAuthStatusTone = 'normal'): this {
    this.status.textContent = message;
    this.status.dataset.tone = tone;
    return this;
  }

  updateLayout(layout: AuthDomLayout): this {
    this.root.style.setProperty('--pf2e-auth-layout-width', `${layout.width}px`);
    this.root.style.setProperty('--pf2e-auth-layout-height', `${layout.height}px`);
    this.root.dataset.compact = String(layout.compact);
    this.root.dataset.orientation = layout.orientation;
    this.setPosition(layout.centerX, layout.centerY);
    this.updateSize();
    return this;
  }
}
