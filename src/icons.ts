const BASE = 'https://trello-link-holded-power-up.pages.dev/icons';

// Plain SVGs (no fill) — Trello colorizes them automatically
// Used by card-buttons (only accepts string URL)
export const CONTACT_ICON_URL = `${BASE}/contact.svg`;
export const PROJECT_ICON_URL = `${BASE}/project.svg`;

// { dark, light } format — used by Trello badge icon fields
export const CONTACT_ICON = {
  dark: `${BASE}/contact-dark.svg`,
  light: `${BASE}/contact-light.svg`,
};
export const PROJECT_ICON = {
  dark: `${BASE}/project-dark.svg`,
  light: `${BASE}/project-light.svg`,
};

// Holded logo — for card-back-section (requires plain string)
export const HOLDED_ICON_URL = `${BASE}/holded-light.svg`;
