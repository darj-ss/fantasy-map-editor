// Диалог с выбором: показывает вопрос и кнопки, возвращает выбранное значение (или null, если закрыли).
const dialog = document.querySelector('#choice-dialog');
const title = document.querySelector('#choice-title');
const text = document.querySelector('#choice-text');
const actions = document.querySelector('#choice-actions');

// buttons: [{ label, value, variant }], variant: 'primary' | 'danger' | undefined
export const askChoice = ({ title: heading, text: message, buttons }) =>
  new Promise((resolve) => {
    title.textContent = heading;
    text.textContent = message;
    actions.replaceChildren();

    buttons.forEach(({ label, value, variant }) => {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = `btn${variant ? ` btn--${variant}` : ''}`;
      button.textContent = label;
      button.addEventListener('click', () => dialog.close(value));
      actions.append(button);
    });

    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue || null), { once: true });
    dialog.showModal();
  });
