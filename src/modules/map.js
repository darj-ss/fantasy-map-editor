// Карта: видимая область (масштаб и перемещение), координаты и клетки ландшафта.
import { GRID, ZOOM, TERRAINS, isCustomTerrain } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';

export const svg = document.querySelector('#map');
export const canvas = document.querySelector('#canvas');

export const layers = {
  terrain: document.querySelector('#layer-terrain'),
  lines: document.querySelector('#layer-lines'),
  objects: document.querySelector('#layer-objects'),
  overlay: document.querySelector('#layer-overlay'),
};

export const MAP_W = GRID.cols * GRID.cell;
export const MAP_H = GRID.rows * GRID.cell;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Сколько единиц карты помещается в одном пикселе экрана
const unitsPerPixel = () => 1 / (ZOOM.pxPerUnit * (state.zoom / 100));

// ---------- Видимая область (viewBox) ----------

// Центр видимой области не может уйти за границы карты — карту нельзя «потерять»
const clampView = () => {
  const view = state.view;

  view.x = clamp(view.x, -view.w / 2, MAP_W - view.w / 2);
  view.y = clamp(view.y, -view.h / 2, MAP_H - view.h / 2);
};

const applyView = () => {
  const { x, y, w, h } = state.view;

  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  emit('view:change');
};

// Подгоняем viewBox под размер окна, сохраняя центр
export const fitViewToCanvas = () => {
  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return;
  }

  const view = state.view;
  const k = unitsPerPixel();
  const centerX = view.x + view.w / 2;
  const centerY = view.y + view.h / 2;

  view.w = rect.width * k;
  view.h = rect.height * k;
  view.x = centerX - view.w / 2;
  view.y = centerY - view.h / 2;

  clampView();
  applyView();
};

// anchor — точка на экране ({x, y} в clientX/clientY), вокруг которой масштабируем.
// Без anchor масштабируем вокруг центра.
export const setZoom = (percent, anchor) => {
  const next = clamp(Math.round(percent), ZOOM.min, ZOOM.max);
  const rect = canvas.getBoundingClientRect();
  const view = state.view;

  const anchorX = anchor ? anchor.x - rect.left : rect.width / 2;
  const anchorY = anchor ? anchor.y - rect.top : rect.height / 2;

  // Какая точка карты сейчас под якорем
  const before = unitsPerPixel();
  const worldX = view.x + anchorX * before;
  const worldY = view.y + anchorY * before;

  state.zoom = next;

  const after = unitsPerPixel();

  view.w = rect.width * after;
  view.h = rect.height * after;
  view.x = worldX - anchorX * after;
  view.y = worldY - anchorY * after;

  clampView();
  applyView();
  emit('zoom:change', next);
};

export const zoomBy = (factor, anchor) => setZoom(state.zoom * factor, anchor);

export const panByPixels = (dx, dy) => {
  const k = unitsPerPixel();

  state.view.x -= dx * k;
  state.view.y -= dy * k;

  clampView();
  applyView();
};

export const centerOn = (x, y) => {
  state.view.x = x - state.view.w / 2;
  state.view.y = y - state.view.h / 2;

  clampView();
  applyView();
};

// ---------- Координаты ----------

// Из координат мыши в координаты карты (работает при любом масштабе)
export const getSvgPoint = (event) => {
  const point = svg.createSVGPoint();

  point.x = event.clientX;
  point.y = event.clientY;

  return point.matrixTransform(svg.getScreenCTM().inverse());
};

// Клетка под точкой или null, если точка вне карты
export const cellAt = (point) => {
  const col = Math.floor(point.x / GRID.cell);
  const row = Math.floor(point.y / GRID.cell);

  if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) {
    return null;
  }

  return { col, row };
};

export const cellIndex = (col, row) => row * GRID.cols + col;

export const clampToMap = (point) => ({
  x: clamp(point.x, 0, MAP_W),
  y: clamp(point.y, 0, MAP_H),
});

// ---------- Ландшафт ----------

const rects = [];

// Ставит клетке класс и, для кастомных цветов, inline-fill
const applyTerrainStyle = (rect, terrainId) => {
  const def = TERRAINS.find((t) => t.id === terrainId);

  rect.setAttribute('class', `terrain terrain--${terrainId}`);

  if (def?.color && isCustomTerrain(terrainId)) {
    rect.style.fill = def.color;
  } else {
    rect.style.removeProperty('fill');
  }
};

// Создаём все клетки один раз. Потом только меняем их класс
export const initTerrain = () => {
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

      rect.setAttribute('x', col * GRID.cell);
      rect.setAttribute('y', row * GRID.cell);
      rect.setAttribute('width', GRID.cell);
      rect.setAttribute('height', GRID.cell);
      rect.setAttribute('class', 'terrain terrain--water');

      rects.push(rect);
      fragment.append(rect);
    }
  }

  layers.terrain.append(fragment);
};

export const createBlankCells = (terrainId = 'water') =>
  new Array(GRID.cols * GRID.rows).fill(terrainId);

// Показать ландшафт карты
export const showCells = (cells) => {
  cells.forEach((terrainId, index) => {
    applyTerrainStyle(rects[index], terrainId);
  });
};

// Перекрасить одну клетку, вернуть прежний ландшафт (или null, если ничего не изменилось)
export const paintCell = (index, terrainId) => {
  const cells = state.map.cells;
  const previous = cells[index];

  if (previous === terrainId) {
    return null;
  }

  cells[index] = terrainId;
  applyTerrainStyle(rects[index], terrainId);

  return previous;
};

// ---------- Колесо мыши ----------
export const initNavigation = () => {
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();

      // Ctrl + колесо (и щипок на тачпаде) — масштаб вокруг курсора
      if (event.ctrlKey || event.metaKey) {
        zoomBy(Math.exp(-event.deltaY * 0.0025), { x: event.clientX, y: event.clientY });
        return;
      }

      // Обычное колесо — прокрутка карты
      panByPixels(-event.deltaX, -event.deltaY);
    },
    { passive: false },
  );

  new ResizeObserver(fitViewToCanvas).observe(canvas);
};
