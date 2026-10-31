'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserMock } = require('./helpers/mock-env.js');
const NoGifStorage = require('../utils/storage.js');
const NoGifServiceWorker = require('../background/service-worker.js');

describe('Background service worker', () => {
  it('calls action.setBadge* with a single details argument', async () => {
    const mock = createBrowserMock();
    for (const method of ['setBadgeText', 'setBadgeBackgroundColor']) {
      const original = mock.api.action[method];
      mock.api.action[method] = (...args) => {
        if (args.length !== 1) throw new TypeError(`${method} accepts exactly one argument`);
        return original(args[0]);
      };
    }
    const restore = mock.installAs(globalThis, 'browser');
    try {
      const text = await NoGifServiceWorker.updateTabBadge(
        mock.api, 7, 3, { enabled: true, showBadge: true }
      );
      assert.equal(text, '3');
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '3', tabId: 7 });
      assert.equal(mock.badgeColors.at(-1).color, '#CC0000');
    } finally {
      restore();
    }
  });

  it('handles blocked counts asynchronously, updates badge, and stores stats in storage.local', async () => {
    const mock = createBrowserMock();
    const restore = mock.installAs(globalThis, 'chrome');
    const dispose = NoGifServiceWorker.registerServiceWorkerListeners(NoGifStorage);

    try {
      const resp1 = await mock.dispatchMessage(
        { type: 'GIFS_BLOCKED_COUNT', count: 5, delta: 5 },
        { tab: { id: 101 } }
      );
      assert.deepEqual(resp1, { ok: true, count: 5, totalBlocked: 5 });
      assert.equal(mock.badgeColors.at(-1).color, '#CC0000');
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '5', tabId: 101 });

      const resp2 = await mock.dispatchMessage(
        { type: 'GIFS_BLOCKED_COUNT', count: 12, delta: 7 },
        { tab: { id: 101 } }
      );
      assert.deepEqual(resp2, { ok: true, count: 12, totalBlocked: 12 });
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '12', tabId: 101 });
      assert.equal(mock.localStore.totalBlocked, 12);
      assert.equal(mock.localStore.tabCounts['101'], 12);
    } finally {
      dispose();
      restore();
    }
  });

  it('retains counts across service worker restarts and updates badge on tab change', async () => {
    const mock = createBrowserMock();
    const restore = mock.installAs(globalThis, 'chrome');

    let dispose = NoGifServiceWorker.registerServiceWorkerListeners(NoGifStorage);
    await mock.dispatchMessage({ type: 'GIFS_BLOCKED_COUNT', count: 4, delta: 4 }, { tab: { id: 101 } });
    await mock.dispatchMessage({ type: 'GIFS_BLOCKED_COUNT', count: 9, delta: 9 }, { tab: { id: 202 } });

    dispose();
    dispose = NoGifServiceWorker.registerServiceWorkerListeners(NoGifStorage);

    try {
      await mock.triggerTabActivated(101);
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '4', tabId: 101 });

      await mock.triggerTabActivated(202);
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '9', tabId: 202 });

      await mock.triggerTabActivated(303);
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '', tabId: 303 });

      const stats = await NoGifStorage.getStats(202);
      assert.equal(stats.totalBlocked, 13);
      assert.equal(stats.videoBlocked, 9);
    } finally {
      dispose();
      restore();
    }
  });

  it('clears badge text when showBadge is disabled or when stats are reset, and cleans up closed tabs', async () => {
    const mock = createBrowserMock({
      activeTabs: [{ id: 101, active: true, currentWindow: true }],
    });
    const restore = mock.installAs(globalThis, 'chrome');
    const dispose = NoGifServiceWorker.registerServiceWorkerListeners(NoGifStorage);

    try {
      await mock.dispatchMessage({ type: 'GIFS_BLOCKED_COUNT', count: 8, delta: 8 }, { tab: { id: 101 } });
      assert.equal(mock.badgeTexts.at(-1).text, '8');

      await NoGifStorage.saveSettings({ showBadge: false });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '', tabId: 101 });

      await NoGifStorage.saveSettings({ showBadge: true });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '8', tabId: 101 });

      const resetResp = await mock.dispatchMessage({ type: 'RESET_STATS' }, {});
      assert.deepEqual(resetResp, { ok: true, totalBlocked: 0 });
      assert.equal(mock.localStore.totalBlocked, 0);
      assert.deepEqual(mock.badgeTexts.at(-1), { text: '', tabId: 101 });

      await mock.dispatchMessage({ type: 'GIFS_BLOCKED_COUNT', count: 2, delta: 2 }, { tab: { id: 555 } });
      assert.equal(mock.localStore.tabCounts['555'], 2);
      await mock.triggerTabRemoved(555);
      assert.equal(mock.localStore.tabCounts['555'], undefined);
    } finally {
      dispose();
      restore();
    }
  });
});
