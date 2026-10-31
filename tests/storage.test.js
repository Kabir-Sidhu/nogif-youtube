'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserMock } = require('./helpers/mock-env.js');
const NoGifStorage = require('../utils/storage.js');

describe('Storage helper', () => {
  it('returns default settings when storage is empty', async () => {
    const mock = createBrowserMock();
    const restore = mock.installAs(globalThis, 'chrome');
    try {
      const settings = await NoGifStorage.getSettings();
      assert.deepEqual(settings, {
        enabled: true,
        mode: 'smart',
        showCollapsible: true,
        hideGifsChip: true,
        bandwidthSaver: true,
        showBadge: true,
      });
    } finally {
      restore();
    }
  });

  it('supports both Firefox browser and Chrome storage namespaces', async () => {
    const firefoxMock = createBrowserMock({ initialSync: { mode: 'strict', showBadge: false } });
    let restore = firefoxMock.installAs(globalThis, 'browser');
    try {
      assert.equal(NoGifStorage.getBrowserAPI(), globalThis.browser);
      const ffSettings = await NoGifStorage.getSettings();
      assert.equal(ffSettings.mode, 'strict');
      assert.equal(ffSettings.showBadge, false);
      assert.equal(ffSettings.enabled, true);
    } finally {
      restore();
    }

    const chromeMock = createBrowserMock();
    restore = chromeMock.installAs(globalThis, 'chrome');
    try {
      const writeResult = await NoGifStorage.saveSettings({ mode: 'strict' });
      assert.deepEqual(writeResult, { area: 'sync', fallback: false });
      const chromeSettings = await NoGifStorage.getSettings();
      assert.equal(chromeSettings.mode, 'strict');
    } finally {
      restore();
    }
  });

  it('falls back to storage.local when storage.sync is missing or exceeds quota', async () => {
    const disabledSyncMock = createBrowserMock({ syncDisabled: true });
    let restore = disabledSyncMock.installAs(globalThis, 'chrome');
    try {
      const res = await NoGifStorage.saveSettings({ mode: 'strict', bandwidthSaver: false });
      assert.deepEqual(res, { area: 'local', fallback: true });
      const loaded = await NoGifStorage.getSettings();
      assert.equal(loaded.mode, 'strict');
      assert.equal(loaded.bandwidthSaver, false);
    } finally {
      restore();
    }

    const quotaMock = createBrowserMock({
      syncSetError: () => new Error('QUOTA_BYTES_PER_ITEM quota exceeded'),
    });
    restore = quotaMock.installAs(globalThis, 'chrome');
    try {
      const res = await NoGifStorage.saveSettings({ hideGifsChip: false, mode: 'strict' });
      assert.deepEqual(res, { area: 'local', fallback: true });
      const loaded = await NoGifStorage.getSettings();
      assert.equal(loaded.hideGifsChip, false);
      assert.equal(loaded.mode, 'strict');
    } finally {
      restore();
    }
  });

  it('notifies onSettingsChanged listeners and unsubscribes cleanly', async () => {
    const mock = createBrowserMock();
    const restore = mock.installAs(globalThis, 'chrome');
    try {
      const observed = [];
      const unsubscribe = NoGifStorage.onSettingsChanged((changes, areaName) => {
        observed.push({ changes, areaName });
      });

      await NoGifStorage.saveSettings({ mode: 'strict' });
      await mock.api.storage.local.set({ totalBlocked: 99 });

      assert.equal(observed.length, 1);
      assert.equal(observed[0].areaName, 'sync');
      assert.equal(observed[0].changes.mode.newValue, 'strict');

      unsubscribe();
      await NoGifStorage.saveSettings({ enabled: false });
      assert.equal(observed.length, 1);
    } finally {
      restore();
    }
  });

  it('serializes concurrent saveSettings calls so updates are not lost', async () => {
    const mock = createBrowserMock();
    const restore = mock.installAs(globalThis, 'chrome');
    try {
      await Promise.all([
        NoGifStorage.saveSettings({ mode: 'strict' }),
        NoGifStorage.saveSettings({ showBadge: false }),
        NoGifStorage.saveSettings({ enabled: false }),
      ]);
      const s = await NoGifStorage.getSettings();
      assert.equal(s.mode, 'strict');
      assert.equal(s.showBadge, false);
      assert.equal(s.enabled, false);
    } finally {
      restore();
    }
  });
});
