// История действий. Каждая команда — пара функций { undo, redo }.
// У каждой карты своя история.
import { HISTORY_LIMIT } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';

export const createHistory = () => ({ undo: [], redo: [] });

const current = () => state.map.history;

export const pushCommand = (command) => {
  const history = current();

  history.undo.push(command);

  if (history.undo.length > HISTORY_LIMIT) {
    history.undo.shift();
  }

  history.redo.length = 0;
  emit('history:change');
};

export const undo = () => {
  const command = current().undo.pop();

  if (!command) {
    return;
  }

  command.undo();
  current().redo.push(command);
  emit('history:change');
};

export const redo = () => {
  const command = current().redo.pop();

  if (!command) {
    return;
  }

  command.redo();
  current().undo.push(command);
  emit('history:change');
};

export const canUndo = () => Boolean(state.map) && current().undo.length > 0;
export const canRedo = () => Boolean(state.map) && current().redo.length > 0;
