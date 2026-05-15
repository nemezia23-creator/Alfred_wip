// Theme engine — swaps the <link id="alfred-theme"> href + <html data-theme>.
// Density is a separate axis applied via [data-density] on <html>.

import { setSetting, getSetting } from '../core/settings.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('theme');

const THEMES = ['cyber', 'midnight', 'light'];
const DENSITIES = ['compact', 'normal', 'spacious'];

export function listThemes() {
  return [...THEMES];
}

export function listDensities() {
  return [...DENSITIES];
}

export async function applyTheme(name) {
  if (!THEMES.includes(name)) {
    log.warn(`unknown theme "${name}", falling back to cyber`);
    name = 'cyber';
  }
  const link = document.getElementById('alfred-theme');
  if (link) link.setAttribute('href', `./themes/${name}.css`);
  document.documentElement.setAttribute('data-theme', name);
  await setSetting('theme', name);
  log.info(`theme → ${name}`);
}

export async function applyDensity(name) {
  if (!DENSITIES.includes(name)) name = 'normal';
  document.documentElement.setAttribute('data-density', name);
  await setSetting('density', name);
}

export async function bootTheme() {
  const theme = getSetting('theme') || 'cyber';
  const density = getSetting('density') || 'normal';
  // Don't await setSetting on boot (it would write the same value back redundantly)
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-density', density);
  const link = document.getElementById('alfred-theme');
  if (link) link.setAttribute('href', `./themes/${theme}.css`);
}
