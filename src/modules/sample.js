// Тестовая карта в духе макета: вода, лес, песок, обозначения и пара дорог.
import { GRID } from './config.js';
import { createBlankCells } from './map.js';
import { createObject, createLine } from './objects.js';

// Детерминированный «шум», чтобы границы ландшафта были неровными, но одинаковыми при каждом запуске
const jitter = (col, row) => {
  let h = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);

  h = Math.imul(h ^ (h >>> 13), 1274126177);

  return (((h ^ (h >>> 16)) >>> 0) % 3) - 1;
};

export const buildSampleCells = () => {
  const cells = createBlankCells('water');

  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      const jr = jitter(0, row); // сдвиг берега зависит от строки — получаются «ступеньки»
      const jc = jitter(col, 0); // сдвиг полосы лугов зависит от столбца — полоса «волнистая»
      const index = row * GRID.cols + col;

      // Лес на северо-востоке
      if ((row <= 5 && col >= 21 + jr) || (row <= 11 && col >= 27 + jr)) {
        cells[index] = 'forest';
        continue;
      }

      // Песок: берег уходит влево по мере движения на юг
      const sandEdge = Math.max(8, 24 - (row - 12) * 0.6);

      if (row >= 12 && row < 23 && col >= sandEdge + jr) {
        cells[index] = 'sand';
        continue;
      }

      // Светлая полоса лугов вдоль берега
      if (row >= 20 + jc && row <= 22 && col < sandEdge + jr) {
        cells[index] = 'meadow';
        continue;
      }

      // Юг: тёмный лес слева, песок справа
      if (row >= 23) {
        const forestEdge = 6 + (row - 23) * 0.55 + jr;

        cells[index] = col < forestEdge ? 'forest' : 'sand';
      }
    }
  }

  return cells;
};

export const buildSampleNodes = () => {
  const objects = [];
  const lines = [];

  const city = createObject('city', 460, 380, {
    name: 'Астар',
    description: 'Крупный город на побережье. Известен торговлей и кузнецами. Основан около 200 лет назад.',
    records: {
      npc: ['Мэр Эльдрик Вейл', 'Мастер-кузнец Брон'],
      loot: ['Клинок из лунной стали'],
      quests: ['Пропавший караван', 'Тени в порту', 'Дань для гильдии'],
      info: ['Под городом есть старые катакомбы'],
      enemies: [],
      places: ['Кузнечный квартал'],
    },
  });

  objects.push(
    city,
    createObject('village', 270, 280, { name: 'Дубрава' }),
    createObject('cave', 180, 180, { name: 'Холодный грот' }),
    createObject('cave', 180, 540, { name: 'Старый лаз' }),
    createObject('village', 740, 410, { name: 'Рыбацкий Брод' }),
    createObject('gnomes', 800, 100, { name: 'Каменный Кров', description: 'Поселение гномов-рудокопов.' }),
    createObject('peace-trees', 800, 180, { name: 'Рощи Радуги' }),
    createObject('golem-temple', 1010, 280, { name: 'Храм Первого Голема' }),
    createObject('city', 850, 650, { name: 'Ремесленный Брод' }),
    createObject('lizardfolk', 700, 700, { name: 'Топи ящеров' }),
    createObject('swamp', 250, 800, { name: 'Гнилая Топь' }),
    createObject('cave', 620, 880, { name: 'Песчаная нора' }),
    createObject('village', 750, 800, { name: 'Колодцы' }),
    createObject('golem-temple', 190, 960, { name: 'Храм Железного Лика' }),
    createObject('golem-temple', 810, 960, { name: 'Храм Глиняных Стражей' }),
    createObject('centaurs', 1050, 700, { name: 'Стойбище кентавров' }),
    createObject('thornbacks', 1100, 1050, { name: 'Холмы иглогривов' }),
    createObject('undead', 950, 1300, { name: 'Некрополь Мглы' }),
    createObject('melon-removed', 1200, 1500, { name: 'Закрытая запись' }),
  );

  lines.push(
    createLine(
      'solid-line',
      [
        { x: 480, y: 392 },
        { x: 570, y: 350 },
        { x: 650, y: 300 },
        { x: 700, y: 230 },
        { x: 780, y: 175 },
      ],
      { name: 'Северный тракт' },
    ),
    createLine(
      'solid-line',
      [
        { x: 500, y: 400 },
        { x: 620, y: 470 },
        { x: 740, y: 540 },
        { x: 830, y: 620 },
        { x: 850, y: 650 },
        { x: 820, y: 760 },
        { x: 760, y: 860 },
        { x: 700, y: 1000 },
      ],
      { name: 'Южный тракт' },
    ),
    createLine(
      'dashed-line',
      [
        { x: 120, y: 700 },
        { x: 300, y: 650 },
        { x: 480, y: 700 },
        { x: 600, y: 610 },
        { x: 700, y: 530 },
      ],
      { name: 'Южная граница' },
    ),
  );

  return { lines, objects };
};
