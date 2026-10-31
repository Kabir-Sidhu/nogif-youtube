'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserMock, createDomMock } = require('./helpers/mock-env.js');
const NoGifStorage = require('../utils/storage.js');
const NoGifServiceWorker = require('../background/service-worker.js');
const NoGifPopup = require('../popup/popup.js');

function buildPopupDom(doc) {
  const main = doc.createElement('main');
  main.id = 'popup-root';

  const statusPill = doc.createElement('span');
  statusPill.id = 'status-pill';
  main.appendChild(statusPill);

  const masterToggle = doc.createElement('input');
  masterToggle.type = 'checkbox';
  masterToggle.id = 'toggle-enabled';
  main.appendChild(masterToggle);

  const modeSmart = doc.createElement('input');
  modeSmart.type = 'radio';
  modeSmart.name = 'filter-mode';
  modeSmart.id = 'mode-smart';
  modeSmart.value = 'smart';
  main.appendChild(modeSmart);

  const modeStrict = doc.createElement('input');
  modeStrict.type = 'radio';
  modeStrict.name = 'filter-mode';
  modeStrict.id = 'mode-strict';
  modeStrict.value = 'strict';
  main.appendChild(modeStrict);

  for (const id of ['toggle-collapsible', 'toggle-bandwidth', 'toggle-hide-chip', 'toggle-badge']) {
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    main.appendChild(input);
  }

  const statVideo = doc.createElement('strong');
  statVideo.id = 'stat-video';
  main.appendChild(statVideo);

  const statTotal = doc.createElement('strong');
  statTotal.id = 'stat-total';
  main.appendChild(statTotal);

  const resetBtn = doc.createElement('button');
  resetBtn.type = 'button';
  resetBtn.id = 'btn-reset-stats';
  main.appendChild(resetBtn);

  doc.body.appendChild(main);
  return {
    main,
    statusPill,
    masterToggle,
    modeSmart,
    modeStrict,
    statVideo,
    statTotal,
    resetBtn,
  };
}

describe('Popup interface and controls', () => {
  it('loads valid HTML and dark/light color scheme', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'popup', 'popup.html'), 'utf8');
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'popup', 'popup.css'), 'utf8');

    assert.match(html, /<meta name="color-scheme" content="dark light">/);
    assert.match(html, /<script src="\.\.\/utils\/storage\.js"><\/script>/);
    assert.match(html, /<script src="popup\.js"><\/script>/);
    assert.doesNotMatch(html, /\sonclick=/i);

    assert.match(css, /:root\s*\{[\s\S]*?color-scheme:\s*dark light;/);
    assert.match(css, /@media\s*\(prefers-color-scheme:\s*light\)/);
    assert.match(css, /YouTube Sans/);
    assert.match(css, /Roboto/);
  });

  it('hydrates controls and stats on open and persists changes', async () => {
    const browserMock = createBrowserMock({
      activeTabs: [{ id: 101, active: true, currentWindow: true }],
      initialLocal: { totalBlocked: 47, tabCounts: { '101': 6 } },
    });
    const restore = browserMock.installAs(globalThis, 'chrome');
    const dom = createDomMock();
    const els = buildPopupDom(dom.document);

    const popup = await NoGifPopup.initPopup({ doc: dom.document, storage: NoGifStorage });
    try {
      assert.equal(els.masterToggle.checked, true);
      assert.equal(els.statusPill.textContent, 'Active');
      assert.equal(els.modeSmart.checked, true);
      assert.equal(els.modeStrict.checked, false);
      assert.equal(els.statVideo.textContent, '6');
      assert.equal(els.statTotal.textContent, '47');

      els.modeStrict.checked = true;
      els.modeSmart.checked = false;
      els.modeStrict.dispatchEvent({ type: 'change' });
      await new Promise((r) => setTimeout(r, 10));

      const afterMode = await NoGifStorage.getSettings();
      assert.equal(afterMode.mode, 'strict');

      const collapsibleToggle = dom.document.getElementById('toggle-collapsible');
      collapsibleToggle.checked = false;
      collapsibleToggle.dispatchEvent({ type: 'change' });
      await new Promise((r) => setTimeout(r, 10));

      els.masterToggle.checked = false;
      els.masterToggle.dispatchEvent({ type: 'change' });
      await new Promise((r) => setTimeout(r, 10));

      const updated = await NoGifStorage.getSettings();
      assert.equal(updated.showCollapsible, false);
      assert.equal(updated.enabled, false);
      assert.equal(els.statusPill.textContent, 'Paused');
      assert.equal(els.main.dataset.disabled, 'true');
    } finally {
      popup.destroy();
      restore();
    }
  });

  it('updates statistics live on storage changes and zeroes counters on reset', async () => {
    const browserMock = createBrowserMock({
      activeTabs: [{ id: 101, active: true, currentWindow: true }],
      initialLocal: { totalBlocked: 19, tabCounts: { '101': 3 } },
    });
    const restore = browserMock.installAs(globalThis, 'chrome');
    const disposeSw = NoGifServiceWorker.registerServiceWorkerListeners(NoGifStorage);
    const dom = createDomMock();
    const els = buildPopupDom(dom.document);

    const popup = await NoGifPopup.initPopup({ doc: dom.document, storage: NoGifStorage });
    try {
      await browserMock.dispatchMessage(
        { type: 'GIFS_BLOCKED_COUNT', count: 5, delta: 2 },
        { tab: { id: 101 } }
      );
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(els.statVideo.textContent, '5');
      assert.equal(els.statTotal.textContent, '21');

      els.resetBtn.click();
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(els.statVideo.textContent, '0');
      assert.equal(els.statTotal.textContent, '0');
      assert.equal(browserMock.localStore.totalBlocked, 0);
    } finally {
      popup.destroy();
      disposeSw();
      restore();
    }
  });

  it('resolves active tab ID via tabs.query without extra storage reads', async () => {
    assert.equal(typeof NoGifPopup.resolveActiveTabId, 'function');
    const apiWithTab = {
      tabs: {
        query: async (queryInfo) => {
          assert.equal(queryInfo.active, true);
          assert.equal(queryInfo.currentWindow, true);
          return [{ id: 42 }];
        },
      },
    };
    const tabId = await NoGifPopup.resolveActiveTabId(apiWithTab);
    assert.equal(tabId, 42);

    const emptyApi = {
      tabs: {
        query: async () => [],
      },
    };
    assert.equal(await NoGifPopup.resolveActiveTabId(emptyApi), null);
    assert.equal(await NoGifPopup.resolveActiveTabId(null), null);
  });
});
