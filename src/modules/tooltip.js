// Всплывающая подсказка при наведении на объект.
import { state } from './state.js';
import { on } from './bus.js';
import { svg, canvas } from './map.js';
import { getTitle, isLine } from './objects.js';

const tooltip = document.querySelector('#map-tooltip');

let current = null;

const hide = () => {
  tooltip.hidden = true;
  current = null;
};

const place = (x, y) => {
  const area = canvas.getBoundingClientRect();

  tooltip.style.left = '0px';
  tooltip.style.top = '0px';

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;

  // По умолчанию — над точкой; если не помещается — под ней
  let left = x - area.left - width / 2;
  let top = y - area.top - height - 14;

  if (top < 8) {
    top = y - area.top + 22;
  }

  left = Math.min(Math.max(left, 8), area.width - width - 8);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
};

const show = (el, event) => {
  const text = (el.dataset.tooltip || '').trim();

  tooltip.replaceChildren();

  const title = document.createElement('strong');

  title.textContent = getTitle(el);
  tooltip.append(title);

  if (text) {
    const body = document.createElement('span');

    body.textContent = text;
    tooltip.append(body);
  }

  tooltip.hidden = false;
  current = el;

  // У объектов-точек подсказка «приклеена» к значку, у линий — следует за курсором
  if (isLine(el)) {
    place(event.clientX, event.clientY);
  } else {
    const rect = el.querySelector('.map-object__hit').getBoundingClientRect();

    place(rect.left + rect.width / 2, rect.top);
  }
};

export const initTooltip = () => {
  svg.addEventListener('pointermove', (event) => {
    // Подсказки только в режимах просмотра, и не во время перетаскивания
    const browsing = state.tool === 'select' || state.tool === 'hand';
    const busy = canvas.classList.contains('is-dragging') || canvas.classList.contains('is-panning');
    const el = event.target.closest?.('.map-object');

    if (!browsing || busy || !el || el.dataset.symbol === 'text' || el.dataset.tooltipOff === '1') {
      if (current) {
        hide();
      }

      return;
    }

    if (el !== current) {
      show(el, event);
    } else if (isLine(el)) {
      place(event.clientX, event.clientY);
    }
  });

  svg.addEventListener('pointerleave', hide);

  on('tooltip:hide', hide);
  on('tool:change', hide);
  on('map:change', hide);

  // Если подсказку правят, пока она видна, — перерисуем
  on('object:change', (el) => {
    if (current === el) {
      show(el, { clientX: 0, clientY: 0 });
    }
  });
};
