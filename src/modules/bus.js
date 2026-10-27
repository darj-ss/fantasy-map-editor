// Мини-шина событий: модули не знают друг о друге, а только слушают события.
const listeners = new Map();

export const on = (name, fn) => {
  if (!listeners.has(name)) {
    listeners.set(name, new Set());
  }

  listeners.get(name).add(fn);
};

export const emit = (name, detail) => {
  listeners.get(name)?.forEach((fn) => fn(detail));
};
