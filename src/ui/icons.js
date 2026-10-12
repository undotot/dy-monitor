export const paths = {
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  collapse: '<path d="M3 8h5V3m13 8h-5V3M8 21v-5H3m13 5v-5h5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  retry: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5Zm5 5 5 6m-5 0 5-6"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6Zm-1 1 5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  pip: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 11h6v6h-6Z"/>',
  return: '<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"/>',
  chat: '<path d="M3 4h18v13H9l-6 4ZM7 9h10M7 13h6"/>',
  chatOff: '<path d="m3 3 18 18M3 7v14l6-4h5M8 3h10a3 3 0 0 1 3 3v8M10 8h7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  chevup: '<path d="m5 15 7-7 7 7"/>',
  chevdown: '<path d="m5 9 7 7 7-7"/>',
  chevr: '<path d="m15 5-7 7 7 7"/>',
  chevrr: '<path d="m9 5 7 7-7 7"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  solo: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1Zm16 0h-3v6h2a1 1 0 0 0 1-1Z"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 8l6-5m6 0 6 5M3 16l6 5m6 0 6-5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Zm9 9-9 5-9-5m18 4-9 5-9-5"/>',
  save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 0v6h7M8 21v-6h8v6"/>'
};

export const iconMarkup = (name) => `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.sliders}</svg>`;

export const setIconButton = (button, name, label) => {
  button.innerHTML = iconMarkup(name);
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
};
