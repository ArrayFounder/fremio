// userStorage stub — localStorage wrapper keyed per-user
import safeStorage from "./safeStorage.js";

const userStorage = {
  getItem: (key, def = null) => safeStorage.getItem(`studio_user_${key}`, def),
  setItem: (key, val) => safeStorage.setItem(`studio_user_${key}`, val),
  removeItem: (key) => safeStorage.removeItem(`studio_user_${key}`),
  getJSON: (key, def = null) => safeStorage.getJSON(`studio_user_${key}`, def),
  setJSON: (key, val) => safeStorage.setJSON(`studio_user_${key}`, val),
};

export default userStorage;
