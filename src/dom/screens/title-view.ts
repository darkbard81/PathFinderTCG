import './title.css';

export type TitleCredentials = {
  id: string;
  password: string;
};

export type TitleViewOptions = {
  backgroundImageUrl: string;
  onSubmit: (credentials: TitleCredentials, register: boolean) => void;
};

export type TitleViewModel = {
  status: string;
  statusIsError: boolean;
  busy: boolean;
};

/**
 * 타이틀 화면의 DOM 루트와 갱신 API다.
 *
 * 상태는 `render` 한 방향으로만 들어온다.
 * 아래 셋은 상태가 아니라 **사건**이라 render로 표현하지 않는다.
 * 포커스는 한 번 일어나는 일이고, 입력값을 매 렌더마다 되돌리면 사용자가 타이핑할 수 없다.
 */
export type TitleView = {
  element: HTMLElement;
  render: (model: TitleViewModel) => void;
  clearPassword: () => void;
  focusId: () => void;
  focusPassword: () => void;
};

/**
 * 타이틀 배경과 계정 로그인 폼을 만든다.
 * 입력 검증은 브라우저 기본 제약(minlength, pattern, required)에 맡긴다.
 */
export function createTitleView(options: TitleViewOptions): TitleView {
  const element = document.createElement('section');
  element.className = 'pf-title';
  element.style.setProperty('--pf-title-background-image', `url("${options.backgroundImageUrl}")`);

  const heading = document.createElement('h1');
  heading.className = 'pf-title__heading';
  heading.textContent = 'PATHFINDER TCG';

  const panel = document.createElement('section');
  panel.className = 'pf-title__panel';
  panel.setAttribute('aria-labelledby', 'pf-title-panel-heading');

  const panelHeading = document.createElement('h2');
  panelHeading.id = 'pf-title-panel-heading';
  panelHeading.className = 'pf-title__panel-heading';
  panelHeading.textContent = 'Sign in';

  const helper = document.createElement('p');
  helper.className = 'pf-title__helper';
  helper.textContent = 'Use your ID and password, or create a new account.';

  const form = document.createElement('form');
  form.className = 'pf-title__form';
  form.autocomplete = 'on';

  const idField = createField({
    label: 'ID',
    name: 'id',
    type: 'text',
    autocomplete: 'username',
    minLength: 4,
    maxLength: 20,
    pattern: '[A-Za-z0-9_\\-]{4,20}',
  });
  const passwordField = createField({
    label: 'Password',
    name: 'password',
    type: 'password',
    autocomplete: 'current-password',
    minLength: 8,
    maxLength: 64,
  });

  const actions = document.createElement('div');
  actions.className = 'pf-title__actions';
  const loginButton = createActionButton('Login', 'login');
  const registerButton = createActionButton('Create Account', 'register');
  actions.append(loginButton, registerButton);

  const status = document.createElement('p');
  status.className = 'pf-title__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  form.append(idField.label, passwordField.label, actions, status);
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!idField.input.reportValidity() || !passwordField.input.reportValidity()) {
      return;
    }

    const submitter = (event as SubmitEvent).submitter;
    const intent = submitter instanceof HTMLButtonElement ? submitter.value : 'login';

    options.onSubmit(
      { id: idField.input.value, password: passwordField.input.value },
      intent === 'register',
    );
  });

  panel.append(panelHeading, helper, form);
  element.append(heading, panel);

  return {
    element,
    render: (model) => {
      status.textContent = model.status;
      status.dataset.error = String(model.statusIsError);
      idField.input.disabled = model.busy;
      passwordField.input.disabled = model.busy;
      loginButton.disabled = model.busy;
      registerButton.disabled = model.busy;
    },
    clearPassword: () => {
      passwordField.input.value = '';
    },
    focusId: () => idField.input.focus(),
    focusPassword: () => passwordField.input.focus(),
  };
}

function createField(options: {
  label: string;
  name: string;
  type: 'text' | 'password';
  autocomplete: string;
  minLength: number;
  maxLength: number;
  pattern?: string;
}): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement('label');
  label.className = 'pf-title__field';

  const labelText = document.createElement('span');
  labelText.textContent = options.label;

  const input = document.createElement('input');
  input.name = options.name;
  input.type = options.type;
  input.setAttribute('autocomplete', options.autocomplete);
  input.minLength = options.minLength;
  input.maxLength = options.maxLength;
  input.required = true;

  if (options.pattern) {
    input.pattern = options.pattern;
  }

  label.append(labelText, input);
  return { label, input };
}

function createActionButton(label: string, intent: 'login' | 'register'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'submit';
  button.name = 'intent';
  button.value = intent;
  button.textContent = label;
  return button;
}
