// Статус-бар, блокировка карты и управление масштабом (кнопки и ползунок).
import { GRID, ZOOM } from './config.js';
import { state } from './state.js';
import { on, emit } from './bus.js';
import { svg, getSvgPoint, cellAt, setZoom, zoomBy } from './map.js';
import { deselect } from './objects.js';
import { setTool } from './tools.js';

const $ = (selector) => document.querySelector(selector);

const coords = $('#status-coords');
const lockButton = $('#lock-button');
const slider = $('#zoom-slider');

const renderMapInfo = () => {
  $('#status-map').textContent = state.map.name;
  $('#status-size').textContent = `${GRID.cols} x ${GRID.rows} клеток`;
};

// Ползунок в логарифмической шкале: 100% оказывается ровно посередине
const RANGE = Math.log(ZOOM.max / ZOOM.min);
const zoomToSlider = (zoom) => (Math.log(zoom / ZOOM.min) / RANGE) * 100;
const sliderToZoom = (value) => ZOOM.min * Math.exp((value / 100) * RANGE);

const renderZoom = () => {
  $('#status-zoom').textContent = `Масштаб: ${state.zoom}%`;
  slider.value = zoomToSlider(state.zoom);
};

const renderLock = () => {
  lockButton.setAttribute('aria-pressed', String(state.locked));
  lockButton.setAttribute('aria-label', state.locked ? 'Разблокировать карту' : 'Заблокировать карту');
  lockButton.title = state.locked ? 'Карта заблокирована' : 'Заблокировать редактирование';
  const lockIcon = lockButton.querySelector('.ti');

  lockIcon.classList.toggle('ti-lock', state.locked);
  lockIcon.classList.toggle('ti-lock-open', !state.locked);
  document.body.classList.toggle('is-locked', state.locked);
};

export const initStatusbar = () => {
  svg.addEventListener('pointermove', (event) => {
    const cell = cellAt(getSvgPoint(event));

    coords.textContent = cell ? `X: ${cell.col + 1}   Y: ${cell.row + 1}` : 'X: —   Y: —';
  });

  svg.addEventListener('pointerleave', () => {
    coords.textContent = 'X: —   Y: —';
  });

  lockButton.addEventListener('click', () => {
    state.locked = !state.locked;

    // На заблокированной карте остаются только «Выбор», «Рука» и «Линейка»
    if (state.locked && ['brush', 'symbol', 'text'].includes(state.tool)) {
      setTool('select');
    }

    renderLock();
    emit('lock:change');
  });

  // Масштаб: кнопки, ползунок, сброс по двойному клику на проценты
  document.querySelector('[data-action="zoom-in"]').addEventListener('click', () => zoomBy(1.25));
  document.querySelector('[data-action="zoom-out"]').addEventListener('click', () => zoomBy(1 / 1.25));
  slider.addEventListener('input', () => setZoom(sliderToZoom(Number(slider.value))));
  $('#status-zoom').addEventListener('dblclick', () => setZoom(100));

  // Сохранено / Сохранение… / Ошибка сохранения
  const saveState = $('#save-state');
  const SAVE_TEXT = { saved: 'Сохранено', saving: 'Сохранение…', error: 'Ошибка сохранения' };

  on('save:state', (value) => {
    saveState.dataset.state = value;
    $('#save-state-text').textContent = SAVE_TEXT[value];
  });

  on('zoom:change', renderZoom);
  on('map:change', () => {
    renderMapInfo();
    renderZoom();
  });

  renderLock();
};
