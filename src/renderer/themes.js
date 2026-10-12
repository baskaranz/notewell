'use strict';

// Theme system. Each theme is a set of color tokens applied as CSS custom
// properties on <html>, so the whole UI (sidebar, editor, preview) re-colors
// live with no reload. The chosen theme id is remembered in localStorage.
//
// Palettes for Solarized / Dracula / Nord / Gotham are the well-known public
// community color schemes; the rest are original. Names are generic.

const T = (id, name, dark, t) => ({ id, name, dark, tokens: t });

// token order: bg, bgElev, bgSidebar, border, text, textDim, accent,
//              selected, codeBg, selBg, activeLine, onAccent
export const THEMES = [
  T('default-dark', 'Default Dark', true, {
    bg: '#1a1a1a', bgElev: '#222222', bgSidebar: '#171717', border: '#2e2e2e',
    text: '#e8e8e8', textDim: '#9a9a9a', accent: '#d1483a', selected: '#2a2a2a',
    codeBg: 'rgba(255,255,255,0.08)', selBg: 'rgba(209,72,58,0.28)',
    activeLine: 'rgba(255,255,255,0.03)', onAccent: '#ffffff',
  }),
  T('default-light', 'Default Light', false, {
    bg: '#ffffff', bgElev: '#f4f4f5', bgSidebar: '#f7f7f8', border: '#e4e4e7',
    text: '#1c1c1e', textDim: '#8a8a8e', accent: '#d1483a', selected: '#ececed',
    codeBg: 'rgba(0,0,0,0.06)', selBg: 'rgba(209,72,58,0.18)',
    activeLine: 'rgba(0,0,0,0.03)', onAccent: '#ffffff',
  }),
  T('solarized-light', 'Solarized Light', false, {
    bg: '#fdf6e3', bgElev: '#eee8d5', bgSidebar: '#f5efdc', border: '#e3dcc3',
    text: '#073642', textDim: '#93a1a1', accent: '#268bd2', selected: '#e3dcc3',
    codeBg: 'rgba(0,0,0,0.05)', selBg: 'rgba(38,139,210,0.18)',
    activeLine: 'rgba(0,0,0,0.03)', onAccent: '#fdf6e3',
  }),
  T('solarized-dark', 'Solarized Dark', true, {
    bg: '#002b36', bgElev: '#073642', bgSidebar: '#04323d', border: '#0a4b5a',
    text: '#eee8d5', textDim: '#839496', accent: '#268bd2', selected: '#073642',
    codeBg: 'rgba(255,255,255,0.06)', selBg: 'rgba(38,139,210,0.28)',
    activeLine: 'rgba(255,255,255,0.03)', onAccent: '#ffffff',
  }),
  T('dracula', 'Dracula', true, {
    bg: '#282a36', bgElev: '#343746', bgSidebar: '#21222c', border: '#44475a',
    text: '#f8f8f2', textDim: '#6272a4', accent: '#bd93f9', selected: '#44475a',
    codeBg: 'rgba(255,255,255,0.08)', selBg: 'rgba(189,147,249,0.3)',
    activeLine: 'rgba(255,255,255,0.04)', onAccent: '#282a36',
  }),
  T('nord', 'Nord', true, {
    bg: '#2e3440', bgElev: '#3b4252', bgSidebar: '#292e39', border: '#434c5e',
    text: '#eceff4', textDim: '#7b88a1', accent: '#88c0d0', selected: '#434c5e',
    codeBg: 'rgba(255,255,255,0.07)', selBg: 'rgba(136,192,208,0.28)',
    activeLine: 'rgba(255,255,255,0.035)', onAccent: '#2e3440',
  }),
  T('gotham', 'Gotham', true, {
    bg: '#0c1014', bgElev: '#11161c', bgSidebar: '#0a0e12', border: '#1b2b34',
    text: '#c3d1cf', textDim: '#5a7c82', accent: '#2aa889', selected: '#11252b',
    codeBg: 'rgba(255,255,255,0.05)', selBg: 'rgba(42,168,137,0.25)',
    activeLine: 'rgba(255,255,255,0.03)', onAccent: '#0c1014',
  }),
  T('charcoal', 'Charcoal', true, {
    bg: '#1e1e1e', bgElev: '#272727', bgSidebar: '#1a1a1a', border: '#333333',
    text: '#dcdcdc', textDim: '#8a8a8a', accent: '#8a97a6', selected: '#2c2c2c',
    codeBg: 'rgba(255,255,255,0.07)', selBg: 'rgba(138,151,166,0.25)',
    activeLine: 'rgba(255,255,255,0.03)', onAccent: '#1e1e1e',
  }),
  T('sepia', 'Sepia', false, {
    bg: '#f6f1e7', bgElev: '#efe8d8', bgSidebar: '#f1ebdd', border: '#e2d8c3',
    text: '#433b2e', textDim: '#8a7f68', accent: '#b5651d', selected: '#e8e0cd',
    codeBg: 'rgba(0,0,0,0.05)', selBg: 'rgba(181,101,29,0.18)',
    activeLine: 'rgba(0,0,0,0.028)', onAccent: '#ffffff',
  }),
];

const VAR = {
  bg: '--bg', bgElev: '--bg-elev', bgSidebar: '--bg-sidebar', border: '--border',
  text: '--text', textDim: '--text-dim', accent: '--accent', selected: '--selected',
  codeBg: '--code-bg', selBg: '--sel-bg', activeLine: '--active-line', onAccent: '--on-accent',
};

const STORAGE_KEY = 'notewell.theme';

export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(VAR[key], value);
  }
  root.dataset.themeDark = theme.dark ? 'true' : 'false';
  try { localStorage.setItem(STORAGE_KEY, theme.id); } catch { /* ignore */ }
  return theme;
}

export function currentThemeId() {
  try { return localStorage.getItem(STORAGE_KEY) || THEMES[0].id; } catch { return THEMES[0].id; }
}

export function initTheme() {
  return applyTheme(currentThemeId());
}
