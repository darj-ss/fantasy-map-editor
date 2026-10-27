// Объекты карты: создание, внешний вид, выбор, перемещение, удаление.
// Данные объекта лежат в data-атрибутах самого SVG-элемента.
import { SYMBOLS } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { layers } from './map.js';
import { pushCommand } from './history.js';

const NS = 'http://www.w3.org/2000/svg';

export const createSvgElement = (tag, attributes = {}) => {
  const element = document.createElementNS(NS, tag);

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });

  return element;
};

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- Чтение данных ----------

export const isLine = (el) => SYMBOLS[el.dataset.symbol]?.kind === 'line';

export const getPoints = (el) => {
  try {
    return JSON.parse(el.dataset.points || '[]');
  } catch {
    return [];
  }
};

// Записывает точки линии и перерисовывает её
export const setPoints = (el, points) => {
  el.dataset.points = JSON.stringify(points);
  refreshObject(el);
};

export const getRecords = (el) => {
  try {
    return JSON.parse(el.dataset.records || '{}');
  } catch {
    return {};
  }
};

export const setRecords = (el, records) => {
  el.dataset.records = JSON.stringify(records);
};

// «Город Астар» — тип и название. Для текста — просто сам текст
export const getTitle = (el) => {
  const name = (el.dataset.name || '').trim();
  const symbol = SYMBOLS[el.dataset.symbol];

  if (el.dataset.symbol === 'text') {
    return name || 'Текст';
  }

  return `${symbol.label} ${name}`.trim();
};

export const getAllObjects = () => [
  ...layers.lines.querySelectorAll('.map-object'),
  ...layers.objects.querySelectorAll('.map-object'),
];

// ---------- Внешний вид ----------

// Рисует значок обозначения в точке (0, 0)
const buildMarker = (symbolId, name) => {
  const def = SYMBOLS[symbolId];
  const className = 'map-object__marker';

  switch (def.shape) {
    case 'circle':
      return [createSvgElement('circle', { class: className, r: 11 })];
    case 'triangle':
      return [createSvgElement('polygon', { class: className, points: '0,-13 12,9 -12,9' })];
    case 'dot':
      return [createSvgElement('circle', { class: className, r: 4.5 })];
    case 'square':
      return [createSvgElement('rect', { class: className, x: -10, y: -10, width: 20, height: 20 })];
    case 'letter': {
      const letter = createSvgElement('text', { class: className, x: 0, y: 8, 'text-anchor': 'middle' });

      letter.textContent = def.glyph;
      return [letter];
    }
    case 'peace':
      return [
        createSvgElement('circle', { class: className, r: 11 }),
        createSvgElement('path', { class: className, d: 'M0 -11V11M0 0L-7.800 7.800M0 0L7.800 7.800' }),
      ];
    case 'text': {
      const text = createSvgElement('text', {
        class: 'map-object__text',
        x: 0,
        y: 0,
        'text-anchor': 'middle',
      });

      text.textContent = name || 'Текст';
      return [text];
    }
    default:
      return [];
  }
};

// Маленький значок обозначения для списка «Условные обозначения»
export const createSymbolPreview = (symbolId) => {
  const def = SYMBOLS[symbolId];
  const svg = createSvgElement('svg', { class: 'symbol-preview', 'aria-hidden': 'true' });

  if (def.kind === 'line') {
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.append(
      createSvgElement('path', {
        class: `symbol-preview__line${def.dashed ? ' symbol-preview__line--dashed' : ''}`,
        d: 'M3 24C10 24 12 8 18 8S26 20 29 8',
      }),
    );

    return svg;
  }

  svg.setAttribute('viewBox', '-16 -16 32 32');
  svg.classList.add(`symbol-preview--${def.shape}`);
  svg.append(...buildMarker(symbolId, ''));

  return svg;
};

// Сглаженная линия по точкам: каждая внутренняя точка — «изгиб»
export const buildPath = (points) => {
  if (points.length < 2) {
    return '';
  }

  const fmt = (n) => Math.round(n * 10) / 10;
  const first = points[0];
  const last = points[points.length - 1];

  if (points.length === 2) {
    return `M${fmt(first.x)} ${fmt(first.y)}L${fmt(last.x)} ${fmt(last.y)}`;
  }

  let d = `M${fmt(first.x)} ${fmt(first.y)}`;

  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    const next = points[i + 1];
    const midX = (p.x + next.x) / 2;
    const midY = (p.y + next.y) / 2;

    d += `Q${fmt(p.x)} ${fmt(p.y)} ${fmt(midX)} ${fmt(midY)}`;
  }

  return `${d}L${fmt(last.x)} ${fmt(last.y)}`;
};

// Перерисовать объект по его data-атрибутам
export const refreshObject = (el) => {
  const symbolId = el.dataset.symbol;
  const def = SYMBOLS[symbolId];
  const size = Number(el.dataset.size || 100) / 100;

  // Класс типа: убираем старый, ставим новый (выделение не трогаем)
  [...el.classList]
    .filter((name) => name.startsWith('map-object--') && name !== 'map-object--selected')
    .forEach((name) => el.classList.remove(name));
  el.classList.add(`map-object--${symbolId}`, def.kind === 'line' ? 'map-object--line' : 'map-object--point');

  if (el.dataset.color) {
    el.style.setProperty('--obj-color', el.dataset.color);
  } else {
    el.style.removeProperty('--obj-color');
  }

  el.setAttribute('aria-label', getTitle(el));

  if (def.kind === 'line') {
    const d = buildPath(getPoints(el));

    el.querySelector('.map-object__line').setAttribute('d', d);
    el.querySelector('.map-object__hit-line').setAttribute('d', d);
    el.style.setProperty('--line-width', 2 * size);
    el.classList.toggle('map-object--dashed', Boolean(def.dashed));
    return;
  }

  const shape = el.querySelector('.map-object__shape');
  const label = el.querySelector('.map-object__label');

  shape.setAttribute('transform', `scale(${size})`);
  shape.querySelectorAll('.map-object__marker, .map-object__text').forEach((node) => node.remove());
  shape.append(...buildMarker(symbolId, el.dataset.name));
  label.textContent = el.dataset.name || '';
};

export const setPosition = (el, x, y) => {
  el.dataset.x = x;
  el.dataset.y = y;
  el.setAttribute('transform', `translate(${x} ${y})`);
};

// ---------- Создание ----------

const applyProps = (el, props) => {
  const fields = ['name', 'description', 'tooltip', 'tooltipOff', 'color', 'size'];

  fields.forEach((field) => {
    if (props[field]) {
      el.dataset[field] = props[field];
    }
  });

  if (props.records) {
    setRecords(el, props.records);
  }
};

// Точечный объект: город, пещера, деревня, текст…
export const createObject = (symbolId, x, y, props = {}) => {
  const el = createSvgElement('g', {
    class: 'map-object',
    'data-id': makeId(symbolId),
    'data-symbol': symbolId,
    tabindex: 0,
    role: 'button',
  });

  const shape = createSvgElement('g', { class: 'map-object__shape' });

  shape.append(
    createSvgElement('circle', { class: 'map-object__ring', r: 22 }),
    createSvgElement('circle', { class: 'map-object__hit', r: 18 }),
    createSvgElement('text', { class: 'map-object__label', x: 0, y: 40, 'text-anchor': 'middle' }),
  );

  el.append(shape);
  applyProps(el, props);
  setPosition(el, x, y);
  refreshObject(el);

  return el;
};

// Линия: points — массив {x, y}
export const createLine = (symbolId, points, props = {}) => {
  const el = createSvgElement('g', {
    class: 'map-object',
    'data-id': makeId(symbolId),
    'data-symbol': symbolId,
    tabindex: 0,
    role: 'button',
  });

  el.dataset.points = JSON.stringify(points);
  el.append(
    createSvgElement('path', { class: 'map-object__hit-line' }),
    createSvgElement('path', { class: 'map-object__line' }),
  );

  applyProps(el, props);
  refreshObject(el);

  return el;
};

// ---------- Добавление и удаление ----------

const layerFor = (el) => (isLine(el) ? layers.lines : layers.objects);

export const attachObject = (el) => {
  layerFor(el).append(el);
};

export const detachObject = (el) => {
  if (state.selected === el) {
    deselect();
  }

  el.remove();
};

// ---------- Выбор ----------

export const select = (el) => {
  if (state.selected === el) {
    return;
  }

  state.selected?.classList.remove('map-object--selected');
  state.selected = el;
  el?.classList.add('map-object--selected');

  emit('selection:change', el);
};

export const deselect = () => select(null);

// ---------- Изменения с историей ----------

export const addObjectWithHistory = (el) => {
  attachObject(el);
  select(el);

  pushCommand({
    undo: () => detachObject(el),
    redo: () => {
      attachObject(el);
      select(el);
    },
  });
};

export const deleteObjectWithHistory = (el) => {
  detachObject(el);

  pushCommand({
    undo: () => {
      attachObject(el);
      select(el);
    },
    redo: () => detachObject(el),
  });
};

export const moveObjectWithHistory = (el, from, to) => {
  pushCommand({
    undo: () => {
      setPosition(el, from.x, from.y);
      emit('object:change', el);
    },
    redo: () => {
      setPosition(el, to.x, to.y);
      emit('object:change', el);
    },
  });
};

// Линия сдвигается целиком: from и to — массивы точек {x, y}
export const moveLineWithHistory = (el, from, to) => {
  pushCommand({
    undo: () => {
      setPoints(el, from);
      emit('object:change', el);
    },
    redo: () => {
      setPoints(el, to);
      emit('object:change', el);
    },
  });
};

// ---------- Редактирование свойств ----------

const FIELDS = ['symbol', 'name', 'description', 'tooltip', 'tooltipOff', 'color', 'size', 'records'];

export const takeSnapshot = (el) => {
  const snapshot = {};

  FIELDS.forEach((field) => {
    snapshot[field] = el.dataset[field] || '';
  });

  return snapshot;
};

// Записать значения в объект, перерисовать и сообщить интерфейсу
export const updateObject = (el, patch) => {
  Object.entries(patch).forEach(([field, value]) => {
    if (value === '' || value === undefined || value === null) {
      delete el.dataset[field];
    } else {
      el.dataset[field] = String(value);
    }
  });

  refreshObject(el);
  emit('object:change', el);
};

export const applySnapshot = (el, snapshot) => updateObject(el, snapshot);

export const commitEdit = (el, before, after) => {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }

  pushCommand({
    undo: () => applySnapshot(el, before),
    redo: () => applySnapshot(el, after),
  });
};

// ---------- Поиск ----------

export const searchObjects = (query) => {
  const text = query.trim().toLowerCase();

  if (!text) {
    return [];
  }

  return getAllObjects().filter((el) => {
    const haystack = [getTitle(el), el.dataset.description || '', el.dataset.records || '']
      .join(' ')
      .toLowerCase();

    return haystack.includes(text);
  });
};
