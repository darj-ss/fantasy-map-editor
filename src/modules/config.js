// Константы редактора: размеры карты, масштаб, ландшафт, обозначения, записи.

export const GRID = { cols: 35, rows: 45, cell: 40 };

// 100% масштаба = 1 единица карты занимает 1.4 пикселя (клетка ≈ 56px)
export const ZOOM = { min: 25, max: 400, step: 1.25, pxPerUnit: 1.4 };

// Ландшафт для кисти. Цвета лежат в CSS (.terrain--<id>), здесь только id и название.
// Поле color используется для кастомных цветов (inline-fill) и для превью в палитре.
export const TERRAINS = [
  { id: 'water', label: 'Вода', color: '#0e7f9b' },
  { id: 'meadow', label: 'Луга', color: '#3fc03a' },
  { id: 'forest', label: 'Лес', color: '#1d7a3b' },
  { id: 'sand', label: 'Песок', color: '#dcb862' },
  { id: 'mountain', label: 'Горы', color: '#7d8594' },
  { id: 'snow', label: 'Снег', color: '#e6eef6' },
];

// id кастомного террейна стабилен и зависит только от цвета
export const customTerrainId = (color) => `custom-${color.slice(1).toLowerCase()}`;

export const isCustomTerrain = (id) => id.startsWith('custom-');

// Условные обозначения.
// kind: 'point' — ставится кликом, 'line' — рисуется по точкам
export const SYMBOLS = {
  city: { label: 'Город', kind: 'point', shape: 'circle' },
  cave: { label: 'Пещеры', kind: 'point', shape: 'triangle' },
  village: { label: 'Деревня', kind: 'point', shape: 'dot' },
  'golem-temple': { label: 'Храм големов', kind: 'point', shape: 'square' },
  gnomes: { label: 'Гномы', kind: 'point', shape: 'letter', glyph: 'Г' },
  swamp: { label: 'Болота', kind: 'point', shape: 'letter', glyph: 'Б' },
  'melon-removed': { label: 'Дынные удалены', kind: 'point', shape: 'letter', glyph: 'С' },
  centaurs: { label: 'Кентавры', kind: 'point', shape: 'letter', glyph: 'К' },
  thornbacks: { label: 'Иглогривы', kind: 'point', shape: 'letter', glyph: 'И' },
  lizardfolk: { label: 'Ящеролюды', kind: 'point', shape: 'letter', glyph: 'Я' },
  undead: { label: 'Нежить', kind: 'point', shape: 'letter', glyph: 'Н' },
  'peace-trees': { label: 'Цветные деревья', kind: 'point', shape: 'peace' },
  'dashed-line': {
    label: 'Пунктирная линия',
    kind: 'line',
    dashed: true,
    note: 'область, граница, путь',
  },
  'solid-line': {
    label: 'Сплошная линия',
    kind: 'line',
    dashed: false,
    note: 'дорога, область, граница',
  },
  text: { label: 'Текст', kind: 'point', shape: 'text' },
};

// Какие обозначения показывать в «Условных обозначениях» (текст — отдельный инструмент)
export const LEGEND_IDS = Object.keys(SYMBOLS).filter((id) => id !== 'text');

// Какие типы можно выбрать в поле «Тип» у точечного объекта и у линии
export const POINT_TYPE_IDS = LEGEND_IDS.filter((id) => SYMBOLS[id].kind === 'point');
export const LINE_TYPE_IDS = LEGEND_IDS.filter((id) => SYMBOLS[id].kind === 'line');

// Быстрые обозначения в левой панели
export const QUICK_SYMBOLS = ['city', 'golem-temple', 'cave', 'village', 'peace-trees'];

// Разделы записей объекта
export const RECORD_CATEGORIES = [
  { id: 'npc', label: 'НПС', icon: 'ti-users' },
  { id: 'loot', label: 'Уникальная добыча', icon: 'ti-coins' },
  { id: 'quests', label: 'Квесты', icon: 'ti-question-mark' },
  { id: 'info', label: 'Уникальная информация', icon: 'ti-info-circle' },
  { id: 'enemies', label: 'Враги', icon: 'ti-swords' },
  { id: 'places', label: 'Важные места', icon: 'ti-star-filled' },
];

export const HISTORY_LIMIT = 200;
