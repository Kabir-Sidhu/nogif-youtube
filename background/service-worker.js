'use strict';

(function initNoGifServiceWorker(root) {
  if (!root.NoGifStorage && typeof importScripts === 'function') {
    try {
      importScripts('/utils/storage.js');
    } catch {
      importScripts('../utils/storage.js');
    }
  }

  const defaultStorage = root.NoGifStorage
    || (typeof require === 'function' ? require('../utils/storage.js') : null);

  const YOUTUBE_BADGE_RED = '#CC0000';

  async function updateTabBadge(api, tabId, count, settings) {
    if (!api || !api.action || tabId === null || tabId === undefined) return '';
    const shouldShow = Boolean(settings.enabled && settings.showBadge && count > 0);
    const text = shouldShow ? String(count) : '';

    try {
      await api.action.setBadgeBackgroundColor({ color: YOUTUBE_BADGE_RED, tabId });
      await api.action.setBadgeText({ text, tabId });
    } catch {
      // Tab was closed before badge update
    }
    return text;
  }

  function registerServiceWorkerListeners(storage = defaultStorage) {
    const api = storage.getBrowserAPI();
    if (!api) return () => {};

    let writeQueue = Promise.resolve();
    const enqueueWrite = (fn) => {
      const next = writeQueue.then(fn, fn);
      writeQueue = next.catch(() => {});
      return next;
    };

    const handleMessage = (message, sender, sendResponse) => {
      if (!message || typeof message !== 'object') return false;

      if (message.type === 'GIFS_BLOCKED_COUNT') {
        enqueueWrite(async () => {
          const tabId = (sender && sender.tab && sender.tab.id !== undefined)
            ? sender.tab.id
            : message.tabId;
          const count = Math.max(0, Number(message.count) || 0);
          const delta = Math.max(0, Number(message.delta) || 0);

          const raw = await storage.invokeStorage(api.storage.local, 'get', {
            totalBlocked: 0,
            tabCounts: {},
          });
          const nextTotal = (Number(raw.totalBlocked) || 0) + delta;
          const nextTabCounts = { ...(raw.tabCounts || {}) };
          if (tabId !== null && tabId !== undefined) {
            nextTabCounts[String(tabId)] = count;
          }

          await storage.invokeStorage(api.storage.local, 'set', {
            totalBlocked: nextTotal,
            tabCounts: nextTabCounts,
          });

          const settings = await storage.getSettings();
          await updateTabBadge(api, tabId, count, settings);
          sendResponse({ ok: true, count, totalBlocked: nextTotal });
        }).catch((err) => {
          sendResponse({ ok: false, error: err ? err.message : 'Unknown error' });
        });
        return true;
      }

      if (message.type === 'RESET_STATS') {
        enqueueWrite(async () => {
          await storage.invokeStorage(api.storage.local, 'set', {
            totalBlocked: 0,
            tabCounts: {},
          });
          const settings = await storage.getSettings();
          if (api.tabs && typeof api.tabs.query === 'function') {
            const tabs = await storage.invokeStorage(api.tabs, 'query', {
              active: true,
              currentWindow: true,
            }).catch(() => []);
            if (Array.isArray(tabs) && tabs[0] && tabs[0].id !== undefined) {
              await updateTabBadge(api, tabs[0].id, 0, settings);
            }
          }
          sendResponse({ ok: true, totalBlocked: 0 });
        }).catch((err) => {
          sendResponse({ ok: false, error: err ? err.message : 'Unknown error' });
        });
        return true;
      }

      return false;
    };

    const handleTabActivated = async (activeInfo) => {
      if (!activeInfo || activeInfo.tabId === undefined) return;
      const [stats, settings] = await Promise.all([
        storage.getStats(activeInfo.tabId),
        storage.getSettings(),
      ]);
      await updateTabBadge(api, activeInfo.tabId, stats.videoBlocked, settings);
    };

    const handleTabRemoved = (tabId) => enqueueWrite(async () => {
      const raw = await storage.invokeStorage(api.storage.local, 'get', { tabCounts: {} });
      const nextTabCounts = { ...(raw.tabCounts || {}) };
      if (Object.prototype.hasOwnProperty.call(nextTabCounts, String(tabId))) {
        delete nextTabCounts[String(tabId)];
        await storage.invokeStorage(api.storage.local, 'set', { tabCounts: nextTabCounts });
      }
    });

    const unsubscribeSettings = storage.onSettingsChanged(async () => {
      if (!api.tabs || typeof api.tabs.query !== 'function') return;
      const tabs = await storage.invokeStorage(api.tabs, 'query', {
        active: true,
        currentWindow: true,
      }).catch(() => []);
      if (!Array.isArray(tabs) || !tabs[0] || tabs[0].id === undefined) return;
      const tabId = tabs[0].id;
      const [stats, settings] = await Promise.all([
        storage.getStats(tabId),
        storage.getSettings(),
      ]);
      await updateTabBadge(api, tabId, stats.videoBlocked, settings);
    });

    if (api.runtime && api.runtime.onMessage) api.runtime.onMessage.addListener(handleMessage);
    if (api.tabs && api.tabs.onActivated) api.tabs.onActivated.addListener(handleTabActivated);
    if (api.tabs && api.tabs.onRemoved) api.tabs.onRemoved.addListener(handleTabRemoved);

    return () => {
      if (api.runtime && api.runtime.onMessage) api.runtime.onMessage.removeListener(handleMessage);
      if (api.tabs && api.tabs.onActivated) api.tabs.onActivated.removeListener(handleTabActivated);
      if (api.tabs && api.tabs.onRemoved) api.tabs.onRemoved.removeListener(handleTabRemoved);
      unsubscribeSettings();
    };
  }

  const isNodeRuntime = typeof process !== 'undefined'
    && Boolean(process.versions && process.versions.node);

  if (!isNodeRuntime && defaultStorage) {
    registerServiceWorkerListeners(defaultStorage);
  }

  const exported = {
    YOUTUBE_BADGE_RED,
    updateTabBadge,
    registerServiceWorkerListeners,
  };

  root.NoGifServiceWorker = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(globalThis);
