// Горячие клавиши. Не срабатывают, пока пользователь печатает в поле формы.
import { state } from './state.js';
import { undo, redo } from './history.js';
import { select, deselect } from './objects.js';
import { setTool, deleteSelected, isDrawingLine, cancelDrawing, finishLine, removeLastLinePoint, clearRuler } from './tools.js';
import { emit } from './bus.js';

const isTyping = (event) => {
  const target = event.target;

  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
};

export const initShortcuts = () => {
  document.addEventListener('keydown', (event) => {
    const ctrl = event.ctrlKey || event.metaKey;

    if (event.key === 'Escape') {
      if (isTyping(event)) {
        event.target.blur();
        return;
      }

      emit('legend:close');

      if (isDrawingLine()) {
        cancelDrawing();
      } else if (state.tool !== 'select') {
        setTool('select');
      } else {
        clearRuler();
        deselect();
      }

      return;
    }

    if (isTyping(event)) {
      return;
    }

    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
    if (ctrl && event.code === 'KeyZ') {
      event.preventDefault();
      (event.shiftKey ? redo : undo)();
      return;
    }

    if (ctrl && event.code === 'KeyY') {
      event.preventDefault();
      redo();
      return;
    }

    // Ctrl+S: сохранения пока нет, но страницу браузера сохранять не нужно
    if (ctrl && event.code === 'KeyS') {
      event.preventDefault();
      return;
    }

    if (event.key === 'Delete') {
      deleteSelected();
      return;
    }

    if (event.key === 'Backspace' && isDrawingLine()) {
      event.preventDefault();
      removeLastLinePoint();
      return;
    }

    if (event.key === 'Enter' && isDrawingLine()) {
      finishLine();
      return;
    }

    // Пробел зажат — карта двигается перетаскиванием
    if (event.code === 'Space' && !event.repeat) {
      if (event.target.closest?.('button, a, .map-object')) {
        return;
      }

      event.preventDefault();
      state.spaceDown = true;
      document.body.classList.add('is-space');
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      state.spaceDown = false;
      document.body.classList.remove('is-space');
    }
  });

  window.addEventListener('blur', () => {
    state.spaceDown = false;
    document.body.classList.remove('is-space');
  });
};
