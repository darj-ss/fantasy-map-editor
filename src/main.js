//import './style.css';

import { initTerrain, initNavigation } from './modules/map.js';
import { initTools } from './modules/tools.js';
import { initPanel } from './modules/panel.js';
import { initToolbar } from './modules/toolbar.js';
import { initHeader } from './modules/header.js';
import { initStatusbar } from './modules/statusbar.js';
import { initTooltip } from './modules/tooltip.js';
import { initShortcuts } from './modules/shortcuts.js';
import { initMaps } from './modules/maps.js';
import { initStorage, restoreWorld, loadCustomTerrains } from './modules/storage.js';

// Свои цвета кисти из localStorage — до initTerrain и initToolbar, чтобы палитра их увидела
loadCustomTerrains();

// Сначала подписываем все модули на события, потом загружаем первую карту
initTerrain();
initNavigation();
initTools();
initPanel();
initToolbar();
initHeader();
initStatusbar();
initTooltip();
initShortcuts();
initStorage();
initMaps();
restoreWorld(); // если в браузере есть сохранённый мир — загружаем его вместо тестового
