// Правая панель: заголовок, вкладки, общая информация, записи, внешний вид и подсказка.
import { SYMBOLS, POINT_TYPE_IDS, LINE_TYPE_IDS, RECORD_CATEGORIES } from './config.js';
import { state } from './state.js';
import { on } from './bus.js';
import { select, getTitle, isLine, getRecords, setRecords, takeSnapshot, updateObject, commitEdit } from './objects.js';

const $ = (selector) => document.querySelector(selector);

const dom = {
  panel: $('#properties'),
  empty: $('#properties-empty'),
  content: $('#properties-content'),
  title: $('#properties-title'),
  tabs: $('#properties-tabs'),
  editButton: $('#properties-edit'),
  closeButton: $('#properties-close'),
  toggle: $('#props-toggle'),
  views: { main: $('#view-main'), records: $('#view-records'), settings: $('#view-settings') },
  type: $('#object-type'),
  name: $('#object-name'),
  description: $('#object-description'),
  recordsToggle: $('#records-add-toggle'),
  recordsForm: $('#records-add-form'),
  recordsCategory: $('#records-add-category'),
  recordsText: $('#records-add-text'),
  recordsList: $('#records-list'),
  recordsBack: $('#records-back'),
  recordsTitle: $('#records-title'),
  entriesList: $('#entries-list'),
  entriesForm: $('#entries-form'),
  entriesText: $('#entries-text'),
  color: $('#object-color'),
  size: $('#object-size'),
  sizeLabel: $('#object-size-label'),
  tooltipOn: $('#object-tooltip-on'),
  tooltipText: $('#object-tooltip-text'),
};

// Что показано сейчас: общая информация, записи одного раздела или настройки
let view = { name: 'main', category: null };

// Состояние объекта на момент последней фиксации в истории
let baseline = null;

// «2 записи», «1 запись», «5 записей»
const plural = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${n} запись`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} записи`;
  }

  return `${n} записей`;
};

// Иконка Tabler (шрифтовая): name — класс вида 'ti-users'
const icon = (name) => {
  const el = document.createElement('i');

  el.className = `ti ${name} icon`;
  el.setAttribute('aria-hidden', 'true');

  return el;
};

// ---------- Вкладки ----------

// Вкладки: общая информация, 5 разделов записей (кроме НПС — он открывается из списка), настройки
const TAB_DEFS = [
  { id: 'main', label: 'Общая информация', icon: 'ti-user' },
  ...RECORD_CATEGORIES.slice(1).map((c) => ({ ...c, id: c.id, record: true })),
  { id: 'settings', label: 'Внешний вид и подсказка', icon: 'ti-settings' },
];

const buildTabs = () => {
  TAB_DEFS.forEach((tab) => {
    const button = document.createElement('button');

    button.className = 'properties__tab';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.tab = tab.id;
    button.title = tab.label;
    button.setAttribute('aria-label', tab.label);
    button.append(icon(tab.icon));
    button.addEventListener('click', () => {
      if (tab.id === 'main') {
        openView({ name: 'main' });
      } else if (tab.id === 'settings') {
        openView({ name: 'settings' });
      } else {
        openView({ name: 'records', category: tab.id });
      }
    });

    dom.tabs.append(button);
  });
};

const activeTabId = () => {
  if (view.name === 'records') {
    return view.category === 'npc' ? 'main' : view.category;
  }

  return view.name;
};

const openView = (next) => {
  view = next;
  renderView();
};

// ---------- Отрисовка ----------

const fillTypeSelect = (el) => {
  const ids = isLine(el) ? LINE_TYPE_IDS : POINT_TYPE_IDS;

  dom.type.replaceChildren();

  // Текст — отдельный вид объекта, менять его тип нельзя
  const list = el.dataset.symbol === 'text' ? ['text'] : ids;

  list.forEach((id) => {
    const option = document.createElement('option');

    option.value = id;
    option.textContent = SYMBOLS[id].label;
    dom.type.append(option);
  });

  dom.type.value = el.dataset.symbol;
  dom.type.disabled = list.length === 1;
};

const renderRecordsSummary = (el) => {
  const records = getRecords(el);

  dom.recordsList.replaceChildren();

  RECORD_CATEGORIES.forEach((category) => {
    const count = (records[category.id] || []).length;
    const item = document.createElement('li');
    const button = document.createElement('button');
    const text = document.createElement('span');
    const name = document.createElement('span');
    const amount = document.createElement('span');

    button.className = 'record-row';
    button.type = 'button';
    text.className = 'record-row__text';
    name.className = 'record-row__name';
    amount.className = 'record-row__count';
    name.textContent = category.label;
    amount.textContent = plural(count);
    text.append(name, amount);

    button.append(icon(category.icon), text, icon('ti-chevron-right'));
    button.addEventListener('click', () => openView({ name: 'records', category: category.id }));

    item.append(button);
    dom.recordsList.append(item);
  });
};

const renderEntries = (el) => {
  const category = RECORD_CATEGORIES.find((c) => c.id === view.category);
  const entries = getRecords(el)[category.id] || [];

  dom.recordsTitle.textContent = category.label;
  dom.entriesList.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement('li');

    empty.className = 'entries__empty';
    empty.textContent = 'Пока нет записей.';
    dom.entriesList.append(empty);
    return;
  }

  entries.forEach((text, index) => {
    const item = document.createElement('li');
    const span = document.createElement('span');
    const remove = document.createElement('button');

    item.className = 'entries__item';
    span.textContent = text; // textContent — пользовательский текст не превращается в разметку
    remove.className = 'icon-btn';
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Удалить запись');
    remove.append(icon('ti-x'));
    remove.addEventListener('click', () => changeRecords(el, (records) => records[category.id].splice(index, 1)));

    item.append(span, remove);
    dom.entriesList.append(item);
  });
};

const renderSettings = (el) => {
  const line = isLine(el);

  dom.color.value = el.dataset.color || '#0b1220';
  dom.size.value = el.dataset.size || '100';
  dom.sizeLabel.textContent = line ? 'Толщина' : 'Размер';
  dom.tooltipOn.checked = el.dataset.tooltipOff !== '1';
  dom.tooltipText.value = el.dataset.tooltip || '';
  dom.tooltipText.disabled = !dom.tooltipOn.checked;
};

const renderView = () => {
  const el = state.selected;

  if (!el) {
    return;
  }

  Object.entries(dom.views).forEach(([name, section]) => {
    section.hidden = name !== view.name;
  });

  dom.tabs.querySelectorAll('.properties__tab').forEach((tab) => {
    const active = tab.dataset.tab === activeTabId();

    tab.classList.toggle('properties__tab--active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  if (view.name === 'main') {
    fillTypeSelect(el);
    dom.name.value = el.dataset.name || '';
    dom.description.value = el.dataset.description || '';
    renderRecordsSummary(el);
  } else if (view.name === 'records') {
    renderEntries(el);
  } else {
    renderSettings(el);
  }
};

const renderSelection = () => {
  const el = state.selected;

  dom.empty.hidden = Boolean(el);
  dom.content.hidden = !el;

  if (!el) {
    return;
  }

  baseline = takeSnapshot(el);
  dom.title.textContent = getTitle(el);
  view = { name: 'main' };
  dom.recordsForm.hidden = true;
  dom.recordsToggle.setAttribute('aria-expanded', 'false');
  renderView();
};

// ---------- Правки ----------

// Применить изменение сразу (без истории) — для ввода с клавиатуры и ползунков
const liveUpdate = (patch) => {
  if (state.selected && !state.locked) {
    updateObject(state.selected, patch);
  }
};

// Зафиксировать изменение в истории (когда поле «отпущено»)
const commit = () => {
  const el = state.selected;

  if (!el) {
    return;
  }

  const after = takeSnapshot(el);

  commitEdit(el, baseline, after);
  baseline = after;
};

const changeRecords = (el, mutate) => {
  if (state.locked) {
    return;
  }

  const records = getRecords(el);

  RECORD_CATEGORIES.forEach((c) => {
    records[c.id] = records[c.id] || [];
  });

  mutate(records);
  setRecords(el, records);
  updateObject(el, { records: el.dataset.records });
  commit();
};

const bindEditing = () => {
  dom.name.addEventListener('input', () => liveUpdate({ name: dom.name.value.trim() }));
  dom.name.addEventListener('change', commit);
  dom.description.addEventListener('input', () => liveUpdate({ description: dom.description.value }));
  dom.description.addEventListener('change', commit);

  dom.type.addEventListener('change', () => {
    liveUpdate({ symbol: dom.type.value });
    commit();
  });

  dom.color.addEventListener('input', () => liveUpdate({ color: dom.color.value }));
  dom.color.addEventListener('change', commit);
  dom.size.addEventListener('input', () => liveUpdate({ size: dom.size.value }));
  dom.size.addEventListener('change', commit);

  dom.tooltipOn.addEventListener('change', () => {
    dom.tooltipText.disabled = !dom.tooltipOn.checked;
    liveUpdate({ tooltipOff: dom.tooltipOn.checked ? '' : '1' });
    commit();
  });
  dom.tooltipText.addEventListener('input', () => liveUpdate({ tooltip: dom.tooltipText.value }));
  dom.tooltipText.addEventListener('change', commit);

  // «Добавить» в общей информации: выбрать раздел и ввести текст
  dom.recordsToggle.addEventListener('click', () => {
    const open = dom.recordsForm.hidden;

    dom.recordsForm.hidden = !open;
    dom.recordsToggle.setAttribute('aria-expanded', String(open));

    if (open) {
      dom.recordsText.focus();
    }
  });

  dom.recordsForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = dom.recordsText.value.trim();

    if (!text) {
      return;
    }

    changeRecords(state.selected, (records) => records[dom.recordsCategory.value].push(text));
    dom.recordsText.value = '';
  });

  dom.entriesForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = dom.entriesText.value.trim();

    if (!text) {
      return;
    }

    changeRecords(state.selected, (records) => records[view.category].push(text));
    dom.entriesText.value = '';
    dom.entriesText.focus();
  });

  dom.recordsBack.addEventListener('click', () => openView({ name: 'main' }));
};

// ---------- Сворачивание панели ----------

const setCollapsed = (collapsed) => {
  document.body.classList.toggle('props-collapsed', collapsed);
  dom.toggle.setAttribute('aria-expanded', String(!collapsed));
  dom.toggle.setAttribute('aria-label', collapsed ? 'Показать панель свойств' : 'Скрыть панель свойств');
};

export const initPanel = () => {
  buildTabs();

  RECORD_CATEGORIES.forEach((category) => {
    const option = document.createElement('option');

    option.value = category.id;
    option.textContent = category.label;
    dom.recordsCategory.append(option);
  });

  bindEditing();

  // На узких экранах панель свойств по умолчанию свёрнута
  if (window.matchMedia('(max-width: 1200px)').matches) {
    setCollapsed(true);
  }

  dom.toggle.addEventListener('click', () => setCollapsed(!document.body.classList.contains('props-collapsed')));
  dom.closeButton.addEventListener('click', () => select(null));
  dom.editButton.addEventListener('click', () => {
    openView({ name: 'main' });
    dom.name.focus();
    dom.name.select();
  });

  on('selection:change', (el) => {
    renderSelection();

    // На узких экранах панель выезжает поверх карты при выборе объекта
    if (el && window.matchMedia('(max-width: 1200px)').matches) {
      setCollapsed(false);
    }
  });

  // Объект изменился (в том числе отменой/повтором или перетаскиванием) — обновляем панель
  on('object:change', (el) => {
    if (el !== state.selected) {
      return;
    }

    dom.title.textContent = getTitle(el);

    // Не перезаписываем поле, в котором сейчас печатает пользователь
    if (!dom.panel.contains(document.activeElement) || document.activeElement === document.body) {
      renderView();
    } else if (view.name === 'records' || view.name === 'main') {
      renderRecordsSummary(el);

      if (view.name === 'records') {
        renderEntries(el);
      }
    }
  });

  // После отмены/повтора поля могли «уйти» из-под фокуса — берём состояние заново
  on('history:change', () => {
    if (state.selected) {
      baseline = takeSnapshot(state.selected);
      renderView();
    }
  });

  on('panel:focus-name', () => {
    setCollapsed(false);
    dom.name.focus();
    dom.name.select();
  });
};
