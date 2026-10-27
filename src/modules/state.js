// Общее состояние редактора. Меняется только через функции модулей.
export const state = {
  tool: 'select', // select | hand | brush | symbol | text | ruler
  symbol: null, // id обозначения, когда tool === 'symbol'
  brush: { terrain: 'meadow', size: 1 },

  worldName: 'Новый мир',
  maps: [],
  map: null, // текущая карта

  selected: null, // выбранный SVG-элемент объекта
  locked: false, // карта заблокирована от правок
  showLabels: false, // подписи под объектами

  zoom: 100, // проценты
  view: { x: 0, y: 0, w: 1400, h: 900 }, // текущий viewBox
};
