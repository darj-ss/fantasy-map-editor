// Левая панель, всплывающие панели (кисть, условные обозначения), подсказка режима,
// кнопки «отменить / повторить / удалить».
import {
  SYMBOLS,
  TERRAINS,
  LEGEND_IDS,
  QUICK_SYMBOLS,
  customTerrainId,
  isCustomTerrain,
} from './config.js';
import { state } from './state.js';
import { on } from './bus.js';
import { setTool, deleteSelected } from './tools.js';
import { createSymbolPreview } from './objects.js';
import { undo, redo, canUndo, canRedo } from './history.js';
import { persistCustomTerrains, removeCustomTerrain } from './storage.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const hint = $('#map-hint');
const brushFlyout = $('#flyout-brush');
const legendFlyout = $('#flyout-legend');
const legendButton = $('[data-action="toggle-legend"]');

// ---------- Подсказка режима ----------

let flashTimer = 0;

const hintFor = () => {
  switch (state.tool) {
    case 'hand':
      return 'Рука: перетаскивайте карту. Её же двигает зажатое колесо мыши или Пробел.';
    case 'brush':
      return 'Кисть: зажмите кнопку мыши и закрашивайте клетки.';
    case 'text':
      return 'Текст: нажмите на карту, чтобы поставить подпись.';
    case 'ruler':
      return 'Линейка: зажмите и протяните — покажем расстояние в клетках.';
    case 'symbol': {
      const def = SYMBOLS[state.symbol];

      return def.kind === 'line'
        ? `${def.label}: кликайте, чтобы задать точки. Двойной клик — завершить, Esc — отмена.`
        : `${def.label}: нажмите на карту, чтобы поставить.`;
    }
    default:
      return '';
  }
};

const showHint = (text) => {
  hint.textContent = text;
  hint.classList.toggle('map-hint--visible', Boolean(text));
};

// ---------- Легенда ----------

const buildLegend = () => {
  const list = $('#legend-list');

  LEGEND_IDS.forEach((id) => {
    const def = SYMBOLS[id];
    const item = document.createElement('li');
    const button = document.createElement('button');
    const text = document.createElement('span');
    const name = document.createElement('span');

    button.className = 'legend__item';
    button.type = 'button';
    button.dataset.symbol = id;
    button.setAttribute('aria-pressed', 'false');
    name.className = 'legend__name';
    name.textContent = def.label;
    text.append(name);

    if (def.note) {
      const note = document.createElement('span');

      note.className = 'legend__note';
      note.textContent = def.note;
      text.append(note);
    }

    button.append(createSymbolPreview(id), text);
    button.addEventListener('click', () => {
      setTool('symbol', id);
      closeLegend();
    });

    item.append(button);
    list.append(item);
  });
};

// ---------- Кисть ----------

// Рисует список цветов кисти (базовые + кастомные). Вызывается при старте и после изменений.
const renderBrushList = () => {
  const swatches = $('#brush-terrains');

  swatches.replaceChildren();

  TERRAINS.forEach((terrain) => {
    const button = document.createElement('button');
    const color = document.createElement('span');
    const label = document.createElement('span');

    button.className = 'swatch';
    button.type = 'button';
    button.dataset.terrain = terrain.id;
    button.setAttribute('aria-pressed', String(state.brush.terrain === terrain.id));

    // У базовых цвет берётся из CSS-класса, у кастомных — inline
    if (isCustomTerrain(terrain.id)) {
      color.className = 'swatch__color';
      color.style.background = terrain.color;
    } else {
      color.className = `swatch__color terrain terrain--${terrain.id}`;
    }

    label.textContent = terrain.label;
    button.append(color, label);

    // У кастомного — крестик удаления в углу
    if (isCustomTerrain(terrain.id)) {
      const remove = document.createElement('button');
      remove.className = 'swatch__remove';
      remove.type = 'button';
      remove.title = 'Удалить цвет';
      remove.setAttribute('aria-label', `Удалить цвет «${terrain.label}»`);
      remove.textContent = '×';

      remove.addEventListener('click', (event) => {
        event.stopPropagation(); // не выбираем цвет кликом по крестику
        removeCustomTerrain(terrain.id);
      });

      button.append(remove);
    }

    button.addEventListener('click', () => {
      state.brush.terrain = terrain.id;
      renderBrush();
    });

    swatches.append(button);
  });
};

// Обработчик формы «свой цвет»
const bindBrushAdd = () => {
  const form = $('#brush-add-form');
  const colorInput = $('#brush-add-color');
  const nameInput = $('#brush-add-name');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const color = colorInput.value.toLowerCase();
    const name = nameInput.value.trim();

    if (!name) {
      nameInput.focus();
      return;
    }

    const id = customTerrainId(color);
    const existing = TERRAINS.find((t) => t.id === id);

    if (existing) {
      // Тот же цвет уже есть — просто переименовываем
      existing.label = name;
    } else {
      TERRAINS.push({ id, label: name, color, custom: true });
    }

    persistCustomTerrains();
    renderBrushList();

    state.brush.terrain = id;
    renderBrush();

    nameInput.value = '';
  });
};

// Первичная инициализация кисти при запуске (вызывается из initToolbar)
const buildBrush = () => {
  renderBrushList();
  bindBrushAdd();

  $$('[data-size]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.brush.size = Number(chip.dataset.size);
      renderBrush();
    });
  });
};

const renderBrush = () => {
  $$('.swatch').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.terrain === state.brush.terrain));
  });

  $$('[data-size]').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(Number(chip.dataset.size) === state.brush.size));
  });
};

// ---------- Легенда: открытие/закрытие ----------

const closeLegend = () => {
  legendFlyout.hidden = true;
  legendButton.setAttribute('aria-expanded', 'false');
  legendButton.setAttribute('aria-pressed', 'false');
};

const toggleLegend = () => {
  const open = legendFlyout.hidden;

  legendFlyout.hidden = !open;
  legendButton.setAttribute('aria-expanded', String(open));
  legendButton.setAttribute('aria-pressed', String(open));
};

// ---------- Подсветка активных кнопок ----------

const renderTools = () => {
  $$('.sidebar__tool[data-tool]').forEach((button) => {
    const active = button.dataset.tool === state.tool;

    button.classList.toggle('sidebar__tool--active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  $$('.quick').forEach((button) => {
    const active = state.tool === 'symbol' && state.symbol === button.dataset.symbol;

    button.classList.toggle('quick--active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  $$('.legend__item').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(state.tool === 'symbol' && state.symbol === button.dataset.symbol),
    );
  });

  brushFlyout.hidden = state.tool !== 'brush';
  showHint(hintFor());
};

const renderActions = () => {
  $('.undo-button').disabled = !canUndo();
  $('.redo-button').disabled = !canRedo();
  $('.delete-button').disabled = !state.selected || state.locked;
};

// ---------- Запуск ----------

export const initToolbar = () => {
  buildLegend();
  buildBrush();

  // Обычные инструменты: повторный клик возвращает «Выбор»
  $$('.sidebar__tool[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      const tool = button.dataset.tool;

      setTool(state.tool === tool && tool !== 'select' ? 'select' : tool);
    });
  });

  $$('.quick').forEach((button) => {
    button.addEventListener('click', () => {
      const symbol = button.dataset.symbol;
      const same = state.tool === 'symbol' && state.symbol === symbol;

      setTool(same ? 'select' : 'symbol', same ? null : symbol);
    });
  });

  legendButton.addEventListener('click', toggleLegend);

  // «Карта» показывает и скрывает колонку карт и масштаба
  const mapsButton = $('[data-action="toggle-maps"]');

  // На телефоне колонка карт по умолчанию спрятана
  if (window.matchMedia('(max-width: 576px)').matches) {
    document.body.classList.add('maps-hidden');
    mapsButton.setAttribute('aria-pressed', 'false');
  }

  mapsButton.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('maps-hidden');

    mapsButton.setAttribute('aria-pressed', String(!hidden));
  });

  // Закрываем легенду кликом мимо неё
  document.addEventListener('pointerdown', (event) => {
    if (
      !legendFlyout.hidden &&
      !event.target.closest('#flyout-legend, [data-action="toggle-legend"]')
    ) {
      closeLegend();
    }
  });

  $('.undo-button').addEventListener('click', undo);
  $('.redo-button').addEventListener('click', redo);
  $('.delete-button').addEventListener('click', deleteSelected);

  on('tool:change', renderTools);
  on('history:change', renderActions);
  on('selection:change', renderActions);
  on('lock:change', () => {
    renderActions();
    renderTools();
  });
  on('map:change', renderActions);

  // Кастомные цвета добавили/удалили/пришли из файла — перерисовать палитру
  on('terrains:change', () => {
    renderBrushList();
    renderBrush();
  });

  // Короткое сообщение поверх карты: строка или { text, ms }
  on('hint:flash', (message) => {
    const { text, ms = 3000 } = typeof message === 'string' ? { text: message } : message;

    showHint(text);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => showHint(hintFor()), ms);
  });

  on('legend:close', closeLegend);

  renderTools();
  renderActions();
};
