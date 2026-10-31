'use strict';

(function initNoGifStorage(root) {
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    mode: 'smart',
    showCollapsible: true,
    hideGifsChip: true,
    bandwidthSaver: true,
    showBadge: true,
  });

  const SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));
  const FALLBACK_FLAG = '__nogifSyncFallback';

  function getBrowserAPI() {
    return root.browser || root.chrome;
  }

  async function invokeStorage(area, method, arg) {
    if (!area || typeof area[method] !== 'function') {
      throw new Error(`Storage method "${method}" is unavailable`);
    }
    return arg === undefined ? area[method]() : area[method](arg);
  }

  function sanitizeSettings(raw) {
    const merged = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== 'object') return merged;

    if (typeof raw.enabled === 'boolean') merged.enabled = raw.enabled;
    if (raw.mode === 'smart' || raw.mode === 'strict') merged.mode = raw.mode;
    if (typeof raw.showCollapsible === 'boolean') merged.showCollapsible = raw.showCollapsible;
    if (typeof raw.hideGifsChip === 'boolean') merged.hideGifsChip = raw.hideGifsChip;
    if (typeof raw.bandwidthSaver === 'boolean') merged.bandwidthSaver = raw.bandwidthSaver;
    if (typeof raw.showBadge === 'boolean') merged.showBadge = raw.showBadge;
    return merged;
  }

  async function getSettings() {
    const api = getBrowserAPI();
    if (!api || !api.storage) return { ...DEFAULT_SETTINGS };

    const syncArea = api.storage.sync;
    const localArea = api.storage.local;

    if (localArea) {
      try {
        const meta = await invokeStorage(localArea, 'get', { [FALLBACK_FLAG]: false });
        if (meta && meta[FALLBACK_FLAG]) {
          const localRaw = await invokeStorage(localArea, 'get', { ...DEFAULT_SETTINGS });
          return sanitizeSettings(localRaw);
        }
      } catch {
        // Fallback to sync or defaults
      }
    }

    if (syncArea) {
      try {
        const syncRaw = await invokeStorage(syncArea, 'get', { ...DEFAULT_SETTINGS });
        return sanitizeSettings(syncRaw);
      } catch {
        // Fallback to local
      }
    }

    if (localArea) {
      try {
        const localRaw = await invokeStorage(localArea, 'get', { ...DEFAULT_SETTINGS });
        return sanitizeSettings(localRaw);
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }

    return { ...DEFAULT_SETTINGS };
  }

  let saveQueue = Promise.resolve();

  async function saveSettings(partial) {
    const api = getBrowserAPI();
    if (!api || !api.storage) {
      throw new Error('WebExtensions storage API is unavailable');
    }

    const run = async () => {
      // Ignore invalid keys so existing values are preserved
      const current = await getSettings();
      const candidate = { ...current };
      for (const key of SETTING_KEYS) {
        if (partial && Object.prototype.hasOwnProperty.call(partial, key)
          && sanitizeSettings({ [key]: partial[key] })[key] === partial[key]) {
          candidate[key] = partial[key];
        }
      }
      // Save entire object to prevent partial sync states
      const payload = sanitizeSettings(candidate);

      if (api.storage.sync) {
        try {
          await invokeStorage(api.storage.sync, 'set', payload);
          if (api.storage.local) {
            await invokeStorage(api.storage.local, 'remove', FALLBACK_FLAG).catch(() => {});
          }
          return { area: 'sync', fallback: false };
        } catch {
          // Fall back to local storage if sync quota is exceeded
        }
      }

      await invokeStorage(api.storage.local, 'set', {
        ...payload,
        [FALLBACK_FLAG]: true,
      });
      return { area: 'local', fallback: true };
    };

    const next = saveQueue.then(run, run);
    saveQueue = next.catch(() => {});
    return next;
  }

  async function getStats(tabId = null) {
    const api = getBrowserAPI();
    if (!api || !api.storage || !api.storage.local) {
      return { totalBlocked: 0, videoBlocked: 0, tabCounts: {} };
    }
    const raw = await invokeStorage(api.storage.local, 'get', {
      totalBlocked: 0,
      tabCounts: {},
    });
    const totalBlocked = Number.isFinite(raw.totalBlocked) ? raw.totalBlocked : 0;
    const tabCounts = (raw.tabCounts && typeof raw.tabCounts === 'object') ? raw.tabCounts : {};
    const videoBlocked = tabId !== null && tabId !== undefined
      ? (Number(tabCounts[String(tabId)]) || 0)
      : 0;
    return { totalBlocked, videoBlocked, tabCounts };
  }

  function onSettingsChanged(callback) {
    const api = getBrowserAPI();
    if (!api || !api.storage || !api.storage.onChanged) {
      return () => {};
    }
    const handler = (changes, areaName) => {
      if (areaName !== 'sync' && areaName !== 'local') return;
      const filtered = {};
      for (const key of SETTING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          filtered[key] = changes[key];
        }
      }
      if (Object.keys(filtered).length > 0) {
        callback(filtered, areaName);
      }
    };
    api.storage.onChanged.addListener(handler);
    return () => {
      api.storage.onChanged.removeListener(handler);
    };
  }

  const exported = {
    DEFAULT_SETTINGS,
    SETTING_KEYS,
    sanitizeSettings,
    getBrowserAPI,
    invokeStorage,
    getSettings,
    saveSettings,
    getStats,
    onSettingsChanged,
  };

  root.NoGifStorage = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(globalThis);
