import { HISTORY_KEY } from "../core/settings.js";
import { storage } from "../platform/storage.js";

export const loadHistory = () => {
  try {
    const value = storage.get(HISTORY_KEY, []);
    return Array.isArray(value) ? value.filter((entry) => entry && /^[1-9]\d{0,11}$/.test(String(entry.rid))) : [];
  } catch {
    return [];
  }
};

export const recordHistory = (rid, name = "", avatar = "") => {
  try {
    const list = loadHistory().filter((entry) => entry.rid !== String(rid));
    list.unshift({ rid: String(rid), name: String(name || "").slice(0, 80), ava: String(avatar || "").slice(0, 500), ts: Date.now() });
    storage.set(HISTORY_KEY, list.slice(0, 100));
  } catch {
  }
};
