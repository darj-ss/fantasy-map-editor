// Сохранение мира: файл карты, файл всего мира и автосохранение в localStorage.
//
// Формат файла — обычный JSON:
//   карта: { format, version, kind: 'map',   exportedAt, map:   { name, cols, rows, terrains, cells, lines, objects, view } }
//   мир:   { format, version, kind: 'world', exportedAt, world: { name, showLabels, activeIndex, maps: [ …как map… ] } }
// Поле version нужно, чтобы в будущем можно было читать старые файлы.
//
// terrains — массив id ('water', 'meadow', …). Для кастомных цветов кисти
// вместо строки пишется объект { id, label, color }, чтобы файл был самодостаточным.
import { GRID, SYMBOLS, TERRAINS, RECORD_CATEGORIES, ZOOM, isCustomTerrain } from './config.js';
import { state } from './state.js';
import { emit, on } from './bus.js';
import { layers, canvas, createBlankCells, showCells } from './map.js';
import { createObject, createLine, getPoints, getRecords, isLine } from './objects.js';
import { addMapsFromData, replaceWorld, getView } from './maps.js';
import { askChoice } from './dialogs.js';

const FORMAT = 'fantasy-map-editor';
const VERSION = 1;

const STORAGE_KEY = 'fantasy-map-editor:world';
const BACKUP_KEY = `${STORAGE_KEY}:corrupt`; // сюда уходит копия, если сохранение не удалось прочитать
const CUSTOM_TERRAINS_KEY = 'fantasy-map-editor:terrains'; // кастомные цвета кисти
const SAVE_DELAY = 600; // мс: не пишем на каждое движение мыши

const MAP_W = GRID.cols * GRID.cell;
const MAP_H = GRID.rows * GRID.cell;

// Ограничения: файл приходит снаружи, ему нельзя доверять
const LIMITS = {
  fileBytes: 5 * 1024 * 1024,
  maps: 50,
  nodes: 5000,
  points: 2000,
  worldName: 60,
  name: 200,
  mapName: 40,
  description: 5000,
  tooltip: 1000,
  record: 1000,
  recordsPerCategory: 200,
};

// ---------- Свои цвета кисти ----------

// Сохранить кастомные цвета в localStorage (базовые не пишем — они в коде)
export const persistCustomTerrains = () => {
  const custom = TERRAINS.filter((t) => t.custom);

  try {
    localStorage.setItem(CUSTOM_TERRAINS_KEY, JSON.stringify(custom));
  } catch (error) {
    console.error(error);
  }
};

// Прочитать кастомные цвета при запуске. Вызывается до initTerrain / initToolbar
export const loadCustomTerrains = () => {
  let list;

  try {
    list = JSON.parse(localStorage.getItem(CUSTOM_TERRAINS_KEY) || '[]');
  } catch (error) {
    console.error(error);
    return;
  }

  if (!Array.isArray(list)) {
    return;
  }

  list.forEach((item) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(item.color)
    ) {
      return;
    }

    if (TERRAINS.some((t) => t.id === item.id)) {
      return;
    }

    TERRAINS.push({
      id: item.id,
      label: String(item.label || 'Свой цвет').slice(0, 24),
      color: item.color.toLowerCase(),
      custom: true,
    });
  });
};

// Удалить кастомный цвет: клетки перекрашиваем в воду, чистим состояние, эмитим событие
export const removeCustomTerrain = (id) => {
  const index = TERRAINS.findIndex((t) => t.id === id && t.custom);

  if (index === -1) {
    return;
  }

  const fallback = 'water';

  state.maps.forEach((map) => {
    map.cells = map.cells.map((cell) => (cell === id ? fallback : cell));
  });

  TERRAINS.splice(index, 1);

  if (state.brush.terrain === id) {
    state.brush.terrain = fallback;
  }

  persistCustomTerrains();

  if (state.map) {
    showCells(state.map.cells);
  }

  emit('terrains:change');
};

// ---------- Сборка данных ----------

const round = (n) => Math.round(n * 10) / 10;

const serializeNode = (el) => {
  const data = { symbol: el.dataset.symbol };

  ['name', 'description', 'tooltip', 'color'].forEach((field) => {
    if (el.dataset[field]) {
      data[field] = el.dataset[field];
    }
  });

  if (el.dataset.size) {
    data.size = Number(el.dataset.size);
  }

  if (el.dataset.tooltipOff === '1') {
    data.tooltipOff = true;
  }

  // Сохраняем только непустые разделы записей
  const records = {};

  Object.entries(getRecords(el)).forEach(([id, list]) => {
    if (Array.isArray(list) && list.length > 0) {
      records[id] = list;
    }
  });

  if (Object.keys(records).length > 0) {
    data.records = records;
  }

  if (isLine(el)) {
    data.points = getPoints(el).map((p) => ({ x: round(p.x), y: round(p.y) }));
  } else {
    data.x = round(Number(el.dataset.x));
    data.y = round(Number(el.dataset.y));
  }

  return data;
};

// Ландшафт одной строкой: по символу на клетку (номер ландшафта в системе счисления 36)
const encodeCells = (cells) => {
  const ids = TERRAINS.map((t) => t.id);

  return cells.map((id) => ids.indexOf(id).toString(36)).join('');
};

// У текущей карты объекты лежат на холсте, у остальных — в сохранённых списках
const nodesOf = (map) =>
  map === state.map
    ? {
        lines: [...layers.lines.querySelectorAll('.map-object')],
        objects: [...layers.objects.querySelectorAll('.map-object')],
      }
    : map.nodes;

export const buildMapData = (map) => {
  const nodes = nodesOf(map);
  const view = getView(map);

  return {
    name: map.name,
    cols: GRID.cols,
    rows: GRID.rows,
    terrains: TERRAINS.map((t) =>
      isCustomTerrain(t.id) ? { id: t.id, label: t.label, color: t.color } : t.id,
    ),
    cells: encodeCells(map.cells),
    lines: nodes.lines.map(serializeNode),
    objects: nodes.objects.map(serializeNode),
    view: { zoom: view.zoom, x: round(view.centerX), y: round(view.centerY) },
  };
};

const envelope = (kind, body) => ({
  format: FORMAT,
  version: VERSION,
  kind,
  exportedAt: new Date().toISOString(),
  ...body,
});

export const buildMapExport = (map) => envelope('map', { map: buildMapData(map) });

export const buildWorldExport = () =>
  envelope('world', {
    world: {
      name: state.worldName,
      showLabels: state.showLabels,
      activeIndex: Math.max(0, state.maps.indexOf(state.map)),
      maps: state.maps.map(buildMapData),
    },
  });

// ---------- Скачивание файлов ----------

const safeFileName = (name) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'world';

const download = (data, fileName) => {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportCurrentMap = () => {
  const fileName = `${safeFileName(state.map.name)}.fantasymap.json`;

  download(buildMapExport(state.map), fileName);
  emit('hint:flash', {
    text: `Карта «${state.map.name}» сохранена в файл «${fileName}».`,
    ms: 5000,
  });
};

export const exportWorld = () => {
  const fileName = `${safeFileName(state.worldName)}.fantasyworld.json`;

  download(buildWorldExport(), fileName);
  emit('hint:flash', {
    text: `Весь мир (карт: ${state.maps.length}) сохранён в файл «${fileName}».`,
    ms: 5000,
  });
};

// ---------- Проверка данных ----------

const fail = (message) => {
  throw new Error(message);
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const readText = (value, max, field) => {
  if (value === undefined) {
    return '';
  }

  if (typeof value !== 'string') {
    fail(`поле «${field}» должно быть текстом`);
  }

  return value.slice(0, max);
};

const readNumber = (value, min, max, field) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`поле «${field}» должно быть числом`);
  }

  return Math.min(max, Math.max(min, value));
};

const readRecords = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (!isObject(value)) {
    fail('записи объекта повреждены');
  }

  const records = {};

  RECORD_CATEGORIES.forEach(({ id }) => {
    const list = value[id] ?? [];

    if (!Array.isArray(list)) {
      fail('записи объекта повреждены');
    }

    records[id] = list
      .slice(0, LIMITS.recordsPerCategory)
      .map((item) =>
        typeof item === 'string' ? item.slice(0, LIMITS.record) : fail('записи объекта повреждены'),
      );
  });

  return records;
};

// Общие свойства точки и линии
const readProps = (raw) => {
  const props = {
    name: readText(raw.name, LIMITS.name, 'name'),
    description: readText(raw.description, LIMITS.description, 'description'),
    tooltip: readText(raw.tooltip, LIMITS.tooltip, 'tooltip'),
    records: readRecords(raw.records),
  };

  if (raw.tooltipOff === true) {
    props.tooltipOff = '1';
  }

  // Неверный цвет просто игнорируем — объект получит цвет по умолчанию
  if (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)) {
    props.color = raw.color;
  }

  if (raw.size !== undefined) {
    props.size = String(Math.round(readNumber(raw.size, 25, 400, 'size')));
  }

  return props;
};

const buildPoint = (raw) => {
  if (!isObject(raw)) {
    fail('объект на карте повреждён');
  }

  const def = SYMBOLS[raw.symbol];

  if (!def || def.kind !== 'point') {
    fail(`неизвестное обозначение «${String(raw.symbol).slice(0, 40)}»`);
  }

  const x = readNumber(raw.x, 0, MAP_W, 'x');
  const y = readNumber(raw.y, 0, MAP_H, 'y');

  return createObject(raw.symbol, x, y, readProps(raw));
};

const buildLine = (raw) => {
  if (!isObject(raw)) {
    fail('линия на карте повреждена');
  }

  const def = SYMBOLS[raw.symbol];

  if (!def || def.kind !== 'line') {
    fail(`неизвестный вид линии «${String(raw.symbol).slice(0, 40)}»`);
  }

  if (!Array.isArray(raw.points) || raw.points.length < 2 || raw.points.length > LIMITS.points) {
    fail('у линии неверное число точек');
  }

  const points = raw.points.map((p) => {
    if (!isObject(p)) {
      fail('точки линии повреждены');
    }

    return { x: readNumber(p.x, 0, MAP_W, 'x'), y: readNumber(p.y, 0, MAP_H, 'y') };
  });

  return createLine(raw.symbol, points, readProps(raw));
};

// Строка или объект { id, label, color } → id в TERRAINS.
// Если объекта-кастома у нас нет — регистрируем его, чтобы карта не потеряла цвет.
const ensureTerrain = (entry) => {
  if (typeof entry === 'string') {
    return TERRAINS.some((t) => t.id === entry) ? entry : fail('в файле неизвестный вид ландшафта');
  }

  if (
    !entry ||
    typeof entry.id !== 'string' ||
    typeof entry.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(entry.color)
  ) {
    fail('в файле неизвестный вид ландшафта');
  }

  if (!TERRAINS.some((t) => t.id === entry.id)) {
    TERRAINS.push({
      id: entry.id,
      label: String(entry.label || 'Свой цвет').slice(0, 24),
      color: entry.color.toLowerCase(),
      custom: true,
    });
    persistCustomTerrains();
  }

  return entry.id;
};

const readCells = (map) => {
  if (!Array.isArray(map.terrains)) {
    fail('в файле неизвестный вид ландшафта');
  }

  const ids = map.terrains.map(ensureTerrain);

  if (typeof map.cells !== 'string' || map.cells.length !== GRID.cols * GRID.rows) {
    fail('ландшафт карты повреждён');
  }

  return [...map.cells].map((char) => ids[parseInt(char, 36)] ?? fail('ландшафт карты повреждён'));
};

// Положение камеры необязательно: если оно испорчено, просто берём стандартное
const readView = (raw) => {
  if (
    !isObject(raw) ||
    ![raw.zoom, raw.x, raw.y].every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return undefined;
  }

  return {
    zoom: Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, raw.zoom))),
    centerX: Math.min(MAP_W, Math.max(0, raw.x)),
    centerY: Math.min(MAP_H, Math.max(0, raw.y)),
  };
};

// Одна карта: проверяем и сразу строим объекты (на экран они пока не попадают)
const parseMap = (map) => {
  if (!isObject(map)) {
    fail('в файле нет данных карты');
  }

  if (map.cols !== GRID.cols || map.rows !== GRID.rows) {
    fail(
      `размер карты ${map.cols}×${map.rows} не поддерживается (нужен ${GRID.cols}×${GRID.rows})`,
    );
  }

  if (!Array.isArray(map.lines) || !Array.isArray(map.objects)) {
    fail('в файле нет списков объектов');
  }

  if (map.lines.length > LIMITS.nodes || map.objects.length > LIMITS.nodes) {
    fail('в файле слишком много объектов');
  }

  return {
    name: readText(map.name, LIMITS.mapName, 'name').trim(),
    cells: readCells(map),
    nodes: { lines: map.lines.map(buildLine), objects: map.objects.map(buildPoint) },
    view: readView(map.view),
  };
};

// Текст файла → { kind: 'map', map } или { kind: 'world', ... }. При ошибке бросает Error с понятным текстом
export const parseFile = (text) => {
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    fail('это не файл карты (не удалось прочитать JSON)');
  }

  if (!isObject(data) || data.format !== FORMAT) {
    fail('это не файл Fantasy Map Editor');
  }

  if (!Number.isInteger(data.version) || data.version < 1) {
    fail('в файле неверная версия формата');
  }

  if (data.version > VERSION) {
    fail('файл создан в более новой версии программы — обнови редактор');
  }

  if (isObject(data.world)) {
    const world = data.world;

    if (!Array.isArray(world.maps) || world.maps.length < 1 || world.maps.length > LIMITS.maps) {
      fail('в файле неверное число карт');
    }

    const maps = world.maps.map(parseMap);
    const index = Number.isInteger(world.activeIndex) ? world.activeIndex : 0;

    return {
      kind: 'world',
      name: readText(world.name, LIMITS.worldName, 'name').trim(),
      showLabels: world.showLabels === true,
      activeIndex: Math.min(Math.max(index, 0), maps.length - 1),
      maps,
    };
  }

  if (isObject(data.map)) {
    return { kind: 'map', map: parseMap(data.map) };
  }

  return fail('в файле нет данных карты');
};

// ---------- Загрузка в редактор ----------

// Если карта с таким названием уже есть — добавляем номер: «Остров (2)»
const uniqueName = (name, taken) => {
  const base = name || 'Импортированная карта';
  let candidate = base;
  let n = 2;

  while (taken.has(candidate)) {
    candidate = `${base} (${n})`;
    n += 1;
  }

  taken.add(candidate);

  return candidate;
};

// Заменить мир целиком и обновить настройки мира
const applyWorld = (world) => {
  replaceWorld(world.maps, world.activeIndex);

  state.worldName = world.name || 'Новый мир';
  state.showLabels = world.showLabels;
  emit('world:settings');
  emit('settings:change');
};

const addMaps = (maps) => {
  const taken = new Set(state.maps.map((map) => map.name));

  addMapsFromData(
    maps.map((map, i) => ({ ...map, name: uniqueName(map.name || `Карта ${i + 1}`, taken) })),
  );
};

export const importFromFile = async (file) => {
  try {
    if (file.size > LIMITS.fileBytes) {
      fail('файл слишком большой (больше 5 МБ)');
    }

    // Сначала проверяем весь файл. Текущий мир не трогаем, пока не убедились, что файл целый
    const parsed = parseFile(await file.text());

    if (parsed.kind === 'map') {
      addMaps([
        {
          ...parsed.map,
          name: parsed.map.name || file.name.replace(/\.(fantasymap\.)?json$/i, ''),
        },
      ]);
      emit('terrains:change'); // новые кастомы из файла — обновить палитру кисти
      emit('hint:flash', { text: `Карта «${state.map.name}» загружена из файла.`, ms: 5000 });
      return;
    }

    const choice = await askChoice({
      title: `Загрузить мир «${parsed.name || 'без названия'}»`,
      text: `В файле карт: ${parsed.maps.length}. Можно добавить их к текущему миру или заменить текущий мир целиком. При замене текущие карты пропадут — если они нужны, сначала сохрани их в файл.`,
      buttons: [
        { label: 'Добавить карты', value: 'add', variant: 'primary' },
        { label: 'Заменить мир', value: 'replace', variant: 'danger' },
        { label: 'Отмена', value: null },
      ],
    });

    if (choice === 'add') {
      addMaps(parsed.maps);
      emit('terrains:change'); // новые кастомы из файла — обновить палитру кисти
      emit('hint:flash', { text: `Добавлено карт: ${parsed.maps.length}.`, ms: 5000 });
    } else if (choice === 'replace') {
      applyWorld(parsed);
      emit('terrains:change'); // новые кастомы из файла — обновить палитру кисти
      emit('hint:flash', { text: `Мир «${state.worldName}» загружен из файла.`, ms: 5000 });
    } else {
      emit('hint:flash', 'Загрузка отменена.');
    }
  } catch (error) {
    console.error(error);
    emit('hint:flash', { text: `Не удалось загрузить файл: ${error.message}.`, ms: 7000 });
  }
};

// Пустой мир с одной картой
export const startNewWorld = async () => {
  const choice = await askChoice({
    title: 'Начать новый мир?',
    text: 'Текущий мир будет удалён, в том числе из автосохранения браузера. Если он нужен, сначала сохрани его в файл.',
    buttons: [
      { label: 'Начать новый мир', value: 'new', variant: 'danger' },
      { label: 'Отмена', value: null },
    ],
  });

  if (choice !== 'new') {
    return;
  }

  applyWorld({
    name: 'Новый мир',
    showLabels: false,
    activeIndex: 0,
    maps: [
      { name: 'Карта 1', cells: createBlankCells('water'), nodes: { lines: [], objects: [] } },
    ],
  });
};

// ---------- Автосохранение в localStorage ----------

let ready = false; // пока не загрузили сохранённый мир, писать нельзя: иначе затрём его тестовой картой
let timer = 0;
let dirty = false; // были изменения (в том числе положение камеры), которые ещё не записаны
let errorShown = false;

const setSaveState = (value) => emit('save:state', value);

const saveNow = () => {
  timer = 0;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildWorldExport()));
    dirty = false;
    errorShown = false;
    setSaveState('saved');
  } catch (error) {
    console.error(error);
    setSaveState('error');

    // Сообщение показываем один раз, а не на каждое изменение
    if (!errorShown) {
      errorShown = true;
      emit('hint:flash', {
        text: 'Не удалось сохранить в браузере: память заполнена или хранилище запрещено. Сохрани мир в файл через меню «Мир».',
        ms: 9000,
      });
    }
  }
};

const scheduleSave = () => {
  if (!ready) {
    return;
  }

  dirty = true;
  setSaveState('saving');
  clearTimeout(timer);
  timer = setTimeout(saveNow, SAVE_DELAY);
};

// Если вкладку закрывают или скрывают раньше, чем сработала задержка, — записываем сразу
const flushSave = () => {
  if (ready && (timer || dirty)) {
    clearTimeout(timer);
    saveNow();
  }
};

// Вызывается один раз при запуске, после создания тестового мира
export const restoreWorld = () => {
  let raw = null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error(error);
    setSaveState('error');
  }

  if (raw) {
    try {
      const parsed = parseFile(raw);

      if (parsed.kind !== 'world') {
        fail('в хранилище лежит не мир');
      }

      applyWorld(parsed);
    } catch (error) {
      console.error(error);

      // Не даём автосохранению молча затереть повреждённые данные: оставляем копию
      try {
        localStorage.setItem(BACKUP_KEY, raw);
      } catch {
        // места нет — копию сделать не удалось
      }

      emit('hint:flash', {
        text: 'Сохранённый в браузере мир повреждён, поэтому открыт тестовый. Копия повреждённых данных осталась в браузере.',
        ms: 9000,
      });
    }
  }

  ready = true;
};

export const initStorage = () => {
  const input = document.querySelector('#import-input');

  input.addEventListener('change', () => {
    const [file] = input.files;

    input.value = ''; // чтобы тот же файл можно было выбрать ещё раз

    if (file) {
      importFromFile(file);
    }
  });

  const bind = (action, handler) =>
    document.querySelector(`[data-action="${action}"]`).addEventListener('click', handler);

  bind('import-file', () => input.click());
  bind('export-map', exportCurrentMap);
  bind('export-world', exportWorld);
  bind('new-world', startNewWorld);

  // Файл можно просто перетащить на карту
  canvas.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
    }
  });

  canvas.addEventListener('drop', (event) => {
    const [file] = event.dataTransfer?.files ?? [];

    if (file) {
      event.preventDefault();
      importFromFile(file);
    }
  });

  // Всё, что меняет мир, запускает отложенное сохранение
  ['history:change', 'object:change', 'map:change', 'settings:change'].forEach((name) =>
    on(name, scheduleSave),
  );

  // Положение камеры сохраняем при закрытии вкладки, но не дёргаем запись на каждое движение
  on('view:change', () => {
    dirty = ready;
  });

  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushSave();
    }
  });
};
