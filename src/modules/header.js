// Верхняя панель: меню мира, поиск, списки записей всего мира, настройки.
import { RECORD_CATEGORIES } from './config.js';
import { state } from './state.js';
import { on, emit } from './bus.js';
import { centerOn } from './map.js';
import { select, getTitle, getAllObjects, getRecords, getPoints, isLine, searchObjects } from './objects.js';
import { renameCurrentMap } from './maps.js';

const $ = (selector) => document.querySelector(selector);

const menuButton = $('#world-menu-button');
const menu = $('#world-menu');
const worldName = $('#world-name');
const searchInput = $('#search-input');
const searchResults = $('#search-results');
const worldDialog = $('#world-dialog');
const settingsDialog = $('#settings-dialog');

// ---------- Меню мира ----------

const setMenu = (open) => {
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
};

// ---------- Переход к объекту ----------

const focusObject = (el) => {
  const [first] = getPoints(el);
  const x = isLine(el) ? first?.x : Number(el.dataset.x);
  const y = isLine(el) ? first?.y : Number(el.dataset.y);

  select(el);

  if (Number.isFinite(x) && Number.isFinite(y)) {
    centerOn(x, y);
  }
};

// ---------- Поиск ----------

const renderSearch = () => {
  const found = searchObjects(searchInput.value).slice(0, 8);

  searchResults.replaceChildren();
  searchResults.hidden = searchInput.value.trim() === '';

  if (found.length === 0 && !searchResults.hidden) {
    const empty = document.createElement('li');

    empty.className = 'search__empty';
    empty.textContent = 'Ничего не найдено';
    searchResults.append(empty);
    return;
  }

  found.forEach((el) => {
    const item = document.createElement('li');
    const button = document.createElement('button');

    button.className = 'search__item';
    button.type = 'button';
    button.textContent = getTitle(el);
    button.addEventListener('click', () => {
      focusObject(el);
      searchInput.value = '';
      searchResults.hidden = true;
    });

    item.append(button);
    searchResults.append(item);
  });
};

// ---------- Записи всего мира ----------

const openWorldDialog = (categoryId) => {
  const category = RECORD_CATEGORIES.find((c) => c.id === categoryId);
  const list = $('#world-dialog-list');

  $('#world-dialog-title').textContent = `${category.label} — вся карта`;
  list.replaceChildren();

  getAllObjects().forEach((el) => {
    (getRecords(el)[categoryId] || []).forEach((text) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const main = document.createElement('span');
      const where = document.createElement('span');

      button.className = 'dialog__entry';
      button.type = 'button';
      main.textContent = text;
      where.className = 'dialog__where';
      where.textContent = getTitle(el);
      button.append(main, where);
      button.addEventListener('click', () => {
        worldDialog.close();
        focusObject(el);
      });

      item.append(button);
      list.append(item);
    });
  });

  if (!list.children.length) {
    const empty = document.createElement('li');

    empty.className = 'dialog__empty';
    empty.textContent = 'Пока нет записей.';
    list.append(empty);
  }

  worldDialog.showModal();
};

// ---------- Настройки ----------

const openSettings = () => {
  $('#settings-world').value = state.worldName;
  $('#settings-map').value = state.map.name;
  $('#settings-labels').checked = state.showLabels;
  settingsDialog.showModal();
};

export const initHeader = () => {
  menuButton.addEventListener('click', () => setMenu(menu.hidden));

  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !event.target.closest('.world-menu')) {
      setMenu(false);
    }

    if (!searchResults.hidden && !event.target.closest('.search')) {
      searchResults.hidden = true;
    }
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('.menu__item:not(:disabled)')) {
      setMenu(false);
    }
  });

  document.querySelectorAll('[data-action="settings"]').forEach((button) => {
    button.addEventListener('click', () => {
      setMenu(false);
      openSettings();
    });
  });

  document.querySelectorAll('[data-world]').forEach((button) => {
    button.addEventListener('click', () => openWorldDialog(button.dataset.world));
  });

  // Закрытие диалогов крестиком и кликом по затемнению
  document.querySelectorAll('.dialog').forEach((dialog) => {
    dialog.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => dialog.close());
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });
  });

  $('#settings-world').addEventListener('input', (event) => {
    state.worldName = event.target.value.trim() || 'Новый мир';
    worldName.textContent = state.worldName;
    emit('settings:change');
  });

  $('#settings-map').addEventListener('input', (event) => renameCurrentMap(event.target.value));

  $('#settings-labels').addEventListener('change', (event) => {
    state.showLabels = event.target.checked;
    $('#map').classList.toggle('map-editor__svg--labels', state.showLabels);
    emit('settings:change');
  });

  $('#settings-form').addEventListener('submit', () => settingsDialog.close());

  searchInput.addEventListener('input', renderSearch);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchInput.value = '';
      searchResults.hidden = true;
      searchInput.blur();
    }

    if (event.key === 'Enter') {
      const first = searchResults.querySelector('.search__item');

      first?.click();
    }
  });

  // При смене карты результаты поиска устаревают
  on('map:change', () => {
    searchResults.hidden = true;
  });

  // Название мира и подписи могли прийти из файла или из браузера
  on('world:settings', () => {
    worldName.textContent = state.worldName;
    $('#map').classList.toggle('map-editor__svg--labels', state.showLabels);
  });

  worldName.textContent = state.worldName;
};
