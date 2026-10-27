// Инструменты: один обработчик указателя на SVG, дальше раздаём по активному инструменту.
import { GRID, SYMBOLS } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';
import {
  svg,
  canvas,
  layers,
  getSvgPoint,
  cellAt,
  cellIndex,
  paintCell,
  panByPixels,
  clampToMap,
  MAP_W,
  MAP_H,
} from './map.js';
import {
  createObject,
  createLine,
  createSvgElement,
  buildPath,
  isLine,
  getPoints,
  setPoints,
  select,
  deselect,
  setPosition,
  addObjectWithHistory,
  deleteObjectWithHistory,
  moveObjectWithHistory,
  moveLineWithHistory,
} from './objects.js';
import { pushCommand } from './history.js';

const EDIT_TOOLS = ['brush', 'symbol', 'text'];
const DRAG_THRESHOLD = 3; // пикселей экрана

let gesture = null; // текущий жест: перетаскивание, кисть, перемещение карты
let lineDraft = null; // линия, которая рисуется сейчас
let rulerGroup = null; // линейка на карте
let brushPreview = null; // квадрат под кистью

// ---------- Выбор инструмента ----------

export const setTool = (tool, symbol = null) => {
  const needsEditing = EDIT_TOOLS.includes(tool);

  if (needsEditing && state.locked) {
    emit('hint:flash', 'Карта заблокирована — сначала разблокируй её внизу справа.');
    return;
  }

  cancelDrawing();
  clearRuler();
  hideBrushPreview();

  state.tool = tool;
  state.symbol = tool === 'symbol' ? symbol : null;

  canvas.dataset.tool = tool;
  emit('tool:change');
};

// ---------- Перемещение карты ----------

const startPan = (event) => {
  gesture = { type: 'pan', x: event.clientX, y: event.clientY };
  canvas.classList.add('is-panning');
  svg.setPointerCapture(event.pointerId);
};

// ---------- Выбор и перетаскивание ----------

const startSelect = (event, point) => {
  const target = event.target.closest('.map-object');

  if (!target) {
    deselect();
    return;
  }

  select(target);

  if (state.locked) {
    return;
  }

  const line = isLine(target);
  const points = line ? getPoints(target) : [];

  if (line && points.length < 2) {
    return;
  }

  gesture = {
    type: 'drag',
    el: target,
    line,
    start: point,
    // у точечного объекта — позиция, у линии — все её точки
    origin: line ? points : { x: Number(target.dataset.x), y: Number(target.dataset.y) },
    moved: false,
    startClient: { x: event.clientX, y: event.clientY },
  };

  svg.setPointerCapture(event.pointerId);
};

// Сдвиг линии, при котором она целиком остаётся внутри карты
const clampShift = (points, dx, dy) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  return {
    x: Math.min(Math.max(dx, -Math.min(...xs)), MAP_W - Math.max(...xs)),
    y: Math.min(Math.max(dy, -Math.min(...ys)), MAP_H - Math.max(...ys)),
  };
};

// Так же округляет сохранение (storage.js), чтобы после перезагрузки линия лежала там же
const round1 = (n) => Math.round(n * 10) / 10;

const moveDrag = (event) => {
  const point = getSvgPoint(event);
  const { el, line, start, origin, startClient } = gesture;

  if (!gesture.moved) {
    const distance = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);

    if (distance < DRAG_THRESHOLD) {
      return;
    }

    gesture.moved = true;
    canvas.classList.add('is-dragging');
  }

  if (line) {
    const shift = clampShift(origin, point.x - start.x, point.y - start.y);

    setPoints(
      el,
      origin.map((p) => ({ x: round1(p.x + shift.x), y: round1(p.y + shift.y) })),
    );
    return;
  }

  const next = clampToMap({ x: origin.x + point.x - start.x, y: origin.y + point.y - start.y });

  setPosition(el, next.x, next.y);
};

const endDrag = () => {
  const { el, line, origin, moved } = gesture;

  canvas.classList.remove('is-dragging');

  if (!moved) {
    return;
  }

  if (line) {
    moveLineWithHistory(el, origin, getPoints(el));
    return;
  }

  moveObjectWithHistory(el, origin, {
    x: Number(el.dataset.x),
    y: Number(el.dataset.y),
  });
};

// ---------- Кисть ----------

const brushCells = (point) => {
  const cell = cellAt(point);

  if (!cell) {
    return [];
  }

  const size = state.brush.size;
  const first = -Math.floor((size - 1) / 2);
  const cells = [];

  for (let dr = first; dr < first + size; dr += 1) {
    for (let dc = first; dc < first + size; dc += 1) {
      const col = cell.col + dc;
      const row = cell.row + dr;

      if (col >= 0 && row >= 0 && col < GRID.cols && row < GRID.rows) {
        cells.push({ col, row });
      }
    }
  }

  return cells;
};

const paintAt = (point) => {
  brushCells(point).forEach(({ col, row }) => {
    const index = cellIndex(col, row);
    const terrain = state.brush.terrain;
    const previous = paintCell(index, terrain);

    if (previous === null) {
      return;
    }

    if (!gesture.changes.has(index)) {
      gesture.changes.set(index, { from: previous });
    }

    gesture.changes.get(index).to = terrain;
  });
};

// Закрашиваем всё между прошлой и текущей точкой, чтобы быстрый мазок не оставлял дыр
const paintLine = (from, to) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (GRID.cell / 2)));

  for (let i = 1; i <= steps; i += 1) {
    paintAt({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  }
};

const startBrush = (event, point) => {
  gesture = { type: 'brush', changes: new Map(), last: point };
  svg.setPointerCapture(event.pointerId);
  paintAt(point);
};

const endBrush = () => {
  const { changes } = gesture;

  if (changes.size === 0) {
    return;
  }

  pushCommand({
    undo: () => changes.forEach(({ from }, index) => paintCell(index, from)),
    redo: () => changes.forEach(({ to }, index) => paintCell(index, to)),
  });
};

const showBrushPreview = (point) => {
  const cells = brushCells(point);

  if (cells.length === 0) {
    hideBrushPreview();
    return;
  }

  if (!brushPreview) {
    brushPreview = createSvgElement('rect', { class: 'brush-preview', 'pointer-events': 'none' });
    layers.overlay.append(brushPreview);
  }

  const cols = cells.map((c) => c.col);
  const rows = cells.map((c) => c.row);
  const minCol = Math.min(...cols);
  const minRow = Math.min(...rows);

  brushPreview.setAttribute('x', minCol * GRID.cell);
  brushPreview.setAttribute('y', minRow * GRID.cell);
  brushPreview.setAttribute('width', (Math.max(...cols) - minCol + 1) * GRID.cell);
  brushPreview.setAttribute('height', (Math.max(...rows) - minRow + 1) * GRID.cell);
};

const hideBrushPreview = () => {
  brushPreview?.remove();
  brushPreview = null;
};

// ---------- Постановка объектов ----------

const placeObject = (event, point) => {
  // Поверх другого значка не ставим, а поверх линии (дороги, границы) — можно
  if (event.target.closest('.map-object--point')) {
    return;
  }

  const { x, y } = clampToMap(point);
  const isText = state.tool === 'text';
  const symbolId = isText ? 'text' : state.symbol;
  const el = createObject(symbolId, x, y, isText ? { name: 'Текст' } : {});

  addObjectWithHistory(el);
  setTool('select');

  if (isText) {
    emit('panel:focus-name');
  }
};

// ---------- Рисование линий ----------

const updateDraft = (cursor) => {
  if (!lineDraft) {
    return;
  }

  const points = cursor ? [...lineDraft.points, cursor] : lineDraft.points;

  lineDraft.path.setAttribute('d', buildPath(points));
};

const addLinePoint = (point) => {
  const clamped = clampToMap(point);

  if (!lineDraft) {
    const dashed = SYMBOLS[state.symbol].dashed;

    lineDraft = {
      symbol: state.symbol,
      points: [],
      path: createSvgElement('path', {
        class: `draw-preview${dashed ? ' draw-preview--dashed' : ''}`,
        'pointer-events': 'none',
      }),
    };

    layers.overlay.append(lineDraft.path);
  }

  lineDraft.points.push(clamped);
  updateDraft(null);
};

export const isDrawingLine = () => Boolean(lineDraft);

export const finishLine = () => {
  if (!lineDraft) {
    return;
  }

  const { symbol, points } = lineDraft;

  lineDraft.path.remove();
  lineDraft = null;

  if (points.length < 2) {
    return;
  }

  addObjectWithHistory(createLine(symbol, points));
  setTool('select');
};

export const removeLastLinePoint = () => {
  if (!lineDraft) {
    return;
  }

  lineDraft.points.pop();

  if (lineDraft.points.length === 0) {
    cancelDrawing();
    return;
  }

  updateDraft(null);
};

export const cancelDrawing = () => {
  lineDraft?.path.remove();
  lineDraft = null;
};

// ---------- Линейка ----------

const formatCells = (distance) => {
  const cells = distance / GRID.cell;

  return `${cells.toFixed(1).replace('.', ',')} кл.`;
};

export const clearRuler = () => {
  rulerGroup?.group.remove();
  rulerGroup = null;
};

const startRuler = (event, point) => {
  clearRuler();

  const group = createSvgElement('g', { class: 'ruler', 'pointer-events': 'none' });
  const line = createSvgElement('line', { class: 'ruler__line' });
  const dotA = createSvgElement('circle', { class: 'ruler__dot', r: 5 });
  const dotB = createSvgElement('circle', { class: 'ruler__dot', r: 5 });
  const label = createSvgElement('text', { class: 'ruler__label', 'text-anchor': 'middle' });

  group.append(line, dotA, dotB, label);
  layers.overlay.append(group);

  rulerGroup = { group, line, dotA, dotB, label, start: point };
  gesture = { type: 'ruler' };
  svg.setPointerCapture(event.pointerId);
  moveRuler(point);
};

const moveRuler = (point) => {
  const { line, dotA, dotB, label, start } = rulerGroup;

  line.setAttribute('x1', start.x);
  line.setAttribute('y1', start.y);
  line.setAttribute('x2', point.x);
  line.setAttribute('y2', point.y);
  dotA.setAttribute('cx', start.x);
  dotA.setAttribute('cy', start.y);
  dotB.setAttribute('cx', point.x);
  dotB.setAttribute('cy', point.y);
  label.setAttribute('x', (start.x + point.x) / 2);
  label.setAttribute('y', (start.y + point.y) / 2 - 14);
  label.textContent = formatCells(Math.hypot(point.x - start.x, point.y - start.y));
};

// ---------- Удаление ----------

export const deleteSelected = () => {
  if (!state.selected || state.locked) {
    return;
  }

  deleteObjectWithHistory(state.selected);
};

// ---------- Единый обработчик указателя ----------

const onPointerDown = (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) {
    return;
  }

  if (event.button === 1) {
    event.preventDefault();
  }

  if (event.button === 1 || state.spaceDown || state.tool === 'hand') {
    startPan(event);
    return;
  }

  const point = getSvgPoint(event);

  switch (state.tool) {
    case 'select':
      startSelect(event, point);
      break;
    case 'brush':
      startBrush(event, point);
      break;
    case 'text':
      placeObject(event, point);
      break;
    case 'ruler':
      startRuler(event, point);
      break;
    case 'symbol':
      if (SYMBOLS[state.symbol].kind === 'line') {
        addLinePoint(point);
      } else {
        placeObject(event, point);
      }
      break;
    default:
      break;
  }
};

const onPointerMove = (event) => {
  if (!gesture) {
    if (state.tool === 'brush') {
      showBrushPreview(getSvgPoint(event));
    }

    if (lineDraft) {
      updateDraft(clampToMap(getSvgPoint(event)));
    }

    return;
  }

  switch (gesture.type) {
    case 'pan':
      panByPixels(event.clientX - gesture.x, event.clientY - gesture.y);
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      break;
    case 'drag':
      moveDrag(event);
      break;
    case 'brush': {
      const point = getSvgPoint(event);

      showBrushPreview(point);
      paintLine(gesture.last, point);
      gesture.last = point;
      break;
    }
    case 'ruler':
      moveRuler(getSvgPoint(event));
      break;
    default:
      break;
  }
};

const onPointerEnd = () => {
  if (!gesture) {
    return;
  }

  if (gesture.type === 'pan') {
    canvas.classList.remove('is-panning');
  } else if (gesture.type === 'drag') {
    endDrag();
  } else if (gesture.type === 'brush') {
    endBrush();
  }

  gesture = null;
};

export const initTools = () => {
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerEnd);
  svg.addEventListener('pointercancel', onPointerEnd);
  svg.addEventListener('pointerleave', () => {
    if (!gesture) {
      hideBrushPreview();
    }
  });

  // Двойной клик завершает линию (второй клик успел добавить лишнюю точку — убираем)
  svg.addEventListener('dblclick', () => {
    if (!lineDraft) {
      return;
    }

    lineDraft.points.pop();
    finishLine();
  });

  // Выбор с клавиатуры: Enter или пробел на объекте
  svg.addEventListener('keydown', (event) => {
    const target = event.target.closest?.('.map-object');

    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      select(target);
    }
  });
};
