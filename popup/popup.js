'use strict';

(function initNoGifPopupModule(root) {
  const defaultStorage = root.NoGifStorage
    || (typeof require === 'function' ? require('../utils/storage.js') : null);

  async function resolveActiveTabId(api) {
    if (!api || !api.tabs || typeof api.tabs.query !== 'function') return null;
    try {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      return Array.isArray(tabs) && tabs[0] && tabs[0].id !== undefined ? tabs[0].id : null;
    } catch {
      return null;
    }
  }

  async function initPopup(options = {}) {
    const doc = options.doc || root.document;
    const storage = options.storage || defaultStorage;
    const api = storage.getBrowserAPI();

    const shell = doc.getElementById('popup-root');
    const statusPill = doc.getElementById('status-pill');
    const toggleEnabled = doc.getElementById('toggle-enabled');
    const modeSmart = doc.getElementById('mode-smart');
    const modeStrict = doc.getElementById('mode-strict');
    const toggleCollapsible = doc.getElementById('toggle-collapsible');
    const toggleBandwidth = doc.getElementById('toggle-bandwidth');
    const toggleHideChip = doc.getElementById('toggle-hide-chip');
    const toggleBadge = doc.getElementById('toggle-badge');
    const statVideo = doc.getElementById('stat-video');
    const statTotal = doc.getElementById('stat-total');
    const resetBtn = doc.getElementById('btn-reset-stats');

    function renderEnabledState(isEnabled) {
      if (statusPill) {
        statusPill.textContent = isEnabled ? 'Active' : 'Paused';
        statusPill.dataset.active = String(Boolean(isEnabled));
      }
      if (shell) {
        shell.dataset.disabled = String(!isEnabled);
      }
    }

    function renderSettings(settings) {
      if (toggleEnabled) toggleEnabled.checked = Boolean(settings.enabled);
      if (modeSmart) modeSmart.checked = settings.mode !== 'strict';
      if (modeStrict) modeStrict.checked = settings.mode === 'strict';
      if (toggleCollapsible) toggleCollapsible.checked = Boolean(settings.showCollapsible);
      if (toggleBandwidth) toggleBandwidth.checked = Boolean(settings.bandwidthSaver);
      if (toggleHideChip) toggleHideChip.checked = Boolean(settings.hideGifsChip);
      if (toggleBadge) toggleBadge.checked = Boolean(settings.showBadge);
      renderEnabledState(Boolean(settings.enabled));
    }

    const activeTabId = await resolveActiveTabId(api);

    async function refreshStats() {
      const stats = await storage.getStats(activeTabId);
      if (statVideo) statVideo.textContent = String(stats.videoBlocked);
      if (statTotal) statTotal.textContent = String(stats.totalBlocked);
    }

    const initialSettings = await storage.getSettings();
    renderSettings(initialSettings);
    await refreshStats();

    const bindCheckbox = (el, key, onAfter) => {
      if (!el) return;
      el.addEventListener('change', async () => {
        const val = Boolean(el.checked);
        if (onAfter) onAfter(val);
        await storage.saveSettings({ [key]: val });
      });
    };

    bindCheckbox(toggleEnabled, 'enabled', renderEnabledState);
    bindCheckbox(toggleCollapsible, 'showCollapsible');
    bindCheckbox(toggleBandwidth, 'bandwidthSaver');
    bindCheckbox(toggleHideChip, 'hideGifsChip');
    bindCheckbox(toggleBadge, 'showBadge');

    for (const radio of [modeSmart, modeStrict]) {
      if (!radio) continue;
      radio.addEventListener('change', async () => {
        if (radio.checked) {
          await storage.saveSettings({ mode: radio.value === 'strict' ? 'strict' : 'smart' });
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (api && api.runtime && typeof api.runtime.sendMessage === 'function') {
          await Promise.resolve(api.runtime.sendMessage({ type: 'RESET_STATS' })).catch(() => {});
        } else if (api && api.storage && api.storage.local) {
          await storage.invokeStorage(api.storage.local, 'set', {
            totalBlocked: 0,
            tabCounts: {},
          });
        }
        await refreshStats();
      });
    }

    const storageChangeHandler = (_changes, areaName) => {
      if (areaName === 'local') {
        refreshStats();
      }
    };

    if (api && api.storage && api.storage.onChanged) {
      api.storage.onChanged.addListener(storageChangeHandler);
    }

    return {
      destroy() {
        if (api && api.storage && api.storage.onChanged) {
          api.storage.onChanged.removeListener(storageChangeHandler);
        }
      },
    };
  }

  const isNodeRuntime = typeof process !== 'undefined'
    && Boolean(process.versions && process.versions.node);

  if (!isNodeRuntime && root.document) {
    root.document.addEventListener('DOMContentLoaded', () => {
      initPopup();
    });
  }

  const exported = { initPopup, resolveActiveTabId };
  root.NoGifPopup = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(globalThis);
