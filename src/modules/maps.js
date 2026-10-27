// Список карт мира: у каждой карты свой ландшафт, объекты, история и положение камеры.
import { GRID } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { layers, createBlankCells, showCells, fitViewToCanvas, centerOn, setZoom } from './map.js';
import { deselect } from './objects.js';
import { createHistory } from './history.js';
import { setTool } from './tools.js';
import { buildSampleCells, buildSampleNodes } from './sample.js';
import { askChoice } from './dialogs.js';

const list = document.querySelector('#maps-list');
const addButton = document.querySelector('#map-add');
const deleteButton = document.querySelector('[data-action="delete-map"]');
let counter = 0;

const defaultView = () => ({
  zoom: 100,
  centerX: (GRID.cols * GRID.cell) / 2,
  centerY: (GRID.rows * GRID.cell) / 2,
});

const createMap = (name, cells, nodes = { lines: [], objects: [] }, view = defaultView()) => {
  counter += 1;

  return {
    id: `map-${counter}`,
    name: name || `Карта ${counter}`,
    cells,
    nodes,
    history: createHistory(),
    view,
  };
};

const renderList = () => {
  list.replaceChildren();
  deleteButton.disabled = state.maps.length <= 1; // последнюю карту удалять нельзя
  state.maps.forEach((map) => {
    const item = document.createElement('li');
    const button = document.createElement('button');

    button.className = 'maps-list__item';
    button.type = 'button';
    button.textContent = map.name;
    button.setAttribute('aria-current', String(map === state.map));
    button.addEventListener('click', () => switchMap(map));

    item.append(button);
    list.append(item);
  });
};

// Запоминаем, что лежит на текущей карте, и где стояла камера
const stashCurrent = () => {
  const map = state.map;

  if (!map) {
    return;
  }

  map.nodes = {
    lines: [...layers.lines.querySelectorAll('.map-object')],
    objects: [...layers.objects.querySelectorAll('.map-object')],
  };

  map.view = {
    zoom: state.zoom,
    centerX: state.view.x + state.view.w / 2,
    centerY: state.view.y + state.view.h / 2,
  };
};

export const switchMap = (map) => {
  if (map === state.map) {
    return;
  }

  deselect();
  setTool('select');
  stashCurrent();

  layers.lines.replaceChildren();
  layers.objects.replaceChildren();

  state.map = map;
  showCells(map.cells);
  layers.lines.append(...map.nodes.lines);
  layers.objects.append(...map.nodes.objects);

  state.zoom = map.view.zoom;
  fitViewToCanvas();
  setZoom(map.view.zoom);
  centerOn(map.view.centerX, map.view.centerY);

  renderList();
  emit('map:change');
  emit('history:change');
};

export const addMap = () => {
  const map = createMap(null, createBlankCells('water'));

  state.maps.push(map);
  switchMap(map);
};
export const deleteCurrentMap = async () => {
  const map = state.map;

  if (state.maps.length <= 1) {
    emit('hint:flash', 'Нельзя удалить единственную карту.');
    return;
  }

  if (state.locked) {
    emit('hint:flash', 'Карта заблокирована: сначала разблокируй её.');
    return;
  }

  const choice = await askChoice({
    title: `Удалить карту «${map.name}»?`,
    text: 'Ландшафт, линии и объекты этой карты будут удалены без возможности отмены.',
    buttons: [
      { label: 'Удалить карту', value: 'delete', variant: 'danger' },
      { label: 'Отмена', value: null },
    ],
  });

  // Пока висел диалог, текущая карта могла смениться
  if (choice !== 'delete' || map !== state.map) {
    return;
  }

  const index = state.maps.indexOf(map);

  state.maps.splice(index, 1);
  state.map = null; // сохранять объекты удалённой карты уже не нужно
  switchMap(state.maps[Math.min(index, state.maps.length - 1)]); // соседняя карта

  emit('hint:flash', `Карта «${map.name}» удалена.`);
};
// Карты из файла: ландшафт и объекты уже готовы. Добавляем к текущему миру и открываем первую
export const addMapsFromData = (items) => {
  const created = items.map((item) => createMap(item.name, item.cells, item.nodes, item.view));

  state.maps.push(...created);
  switchMap(created[0]);
};

// Заменить весь мир (загрузка из файла или из браузера)
export const replaceWorld = (items, activeIndex = 0) => {
  deselect();
  setTool('select');

  state.map = null; // сохранять объекты старой карты уже не нужно
  state.maps = items.map((item) => createMap(item.name, item.cells, item.nodes, item.view));

  switchMap(state.maps[Math.min(Math.max(activeIndex, 0), state.maps.length - 1)]);
};

// Положение камеры текущей карты: у остальных карт оно уже запомнено
export const getView = (map) =>
  map === state.map
    ? {
        zoom: state.zoom,
        centerX: state.view.x + state.view.w / 2,
        centerY: state.view.y + state.view.h / 2,
      }
    : map.view;

export const renameCurrentMap = (name) => {
  state.map.name = name.trim() || state.map.name;
  renderList();
  emit('map:change');
};

export const initMaps = () => {
  const first = createMap('Карта 1', buildSampleCells(), buildSampleNodes(), {
    zoom: 100,
    centerX: 560, // стартуем рядом с городом Астар
    centerY: 620,
  });

  state.maps.push(
    first,
    createMap('Карта 2', createBlankCells('water')),
    createMap('Карта 3', createBlankCells('water')),
    createMap('Карта 4', createBlankCells('water')),
  );

  addButton.addEventListener('click', addMap);
  deleteButton.addEventListener('click', deleteCurrentMap);
  switchMap(first);
};
