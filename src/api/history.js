import { HISTORY_KEY } from "../core/settings.js";
import { storage } from "../platform/storage.js";
import { normalizeRoomName } from "../core/room-name.js";

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
    const previous = loadHistory();
    const cached = previous.find((entry) => String(entry.rid) === String(rid));
    const list = previous.filter((entry) => String(entry.rid) !== String(rid));
    list.unshift({ rid: String(rid), name: normalizeRoomName(name, rid) || normalizeRoomName(cached?.name, rid), ava: String(avatar || cached?.ava || "").slice(0, 500), ts: Date.now() });
    storage.set(HISTORY_KEY, list.slice(0, 100));
  } catch {
  }
};

export const clearHistory = () => {
  try {
    storage.set(HISTORY_KEY, []);
    return true;
  } catch {
    return false;
  }
};

