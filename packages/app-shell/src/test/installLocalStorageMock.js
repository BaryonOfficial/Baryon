import { vi } from "vitest";

/** @returns {Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">} */
function createLocalStorageMock() {
  const store = new Map();
  return {
    /** @param {string} key */
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    /** @param {string} key
     *  @param {string} value
     */
    setItem(key, value) {
      store.set(key, String(value));
    },
    /** @param {string} key */
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

export function installLocalStorageMock() {
  const storage = createLocalStorageMock();
  vi.stubGlobal("localStorage", storage);
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  }
  return storage;
}
