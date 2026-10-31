'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserMock, createDomMock } = require('./helpers/mock-env.js');
const NoGifStorage = require('../utils/storage.js');
const NoGifContent = require('../content/content.js');

function createGifComment(doc, text = '') {
  const thread = doc.createElement('ytd-comment-thread-renderer');
  const vm = doc.createElement('ytd-comment-view-model');
  const content = doc.createElement('div');
  content.id = 'content';

  const txt = doc.createElement('yt-attributed-string');
  txt.id = 'content-text';
  txt.textContent = text;
  content.appendChild(txt);

  const attachment = doc.createElement('ytw-comment-image-attachment-view-model');
  const img = doc.createElement('img');
  img.className = 'ytCoreImageHost ytwCommentImageAttachmentViewModelImage';
  img.setAttribute('src', 'https://i.ytimg.com/c_exp/anim.webp');
  attachment.appendChild(img);
  content.appendChild(attachment);

  vm.appendChild(content);
  thread.appendChild(vm);
  return { thread, vm, img };
}

describe('SPA navigation, mutation observer and Shorts support', () => {
  it('batches pagination mutations into one animation frame and sends blocked count', async () => {
    const browserMock = createBrowserMock();
    const restoreBrowser = browserMock.installAs(globalThis, 'chrome');
    const dom = createDomMock();

    const commentsSection = dom.document.createElement('div');
    commentsSection.id = 'comments';
    dom.document.body.appendChild(commentsSection);

    const controller = NoGifContent.createContentController({
      doc: dom.document,
      storage: NoGifStorage,
      MutationObserver: dom.MutationObserver,
      requestFrame: dom.requestAnimationFrame,
      cancelFrame: dom.cancelAnimationFrame,
    });

    try {
      await controller.start();
      dom.flushAll();

      const c1 = createGifComment(dom.document, '');
      const c2 = createGifComment(dom.document, 'Mixed comment 1');
      const c3 = createGifComment(dom.document, 'Mixed comment 2');

      commentsSection.appendChild(c1.thread);
      commentsSection.appendChild(c2.thread);
      commentsSection.appendChild(c3.thread);

      dom.flushMutations();
      assert.equal(dom.getPendingRafCount(), 1);

      dom.flushAnimationFrames();

      assert.equal(controller.getVideoBlockedCount(), 3);
      assert.equal(c1.vm.dataset.ytGifOnly, 'true');
      assert.equal(c2.vm.dataset.ytGifMixed, 'true');
      assert.equal(c3.vm.dataset.ytGifMixed, 'true');

      const lastMsg = browserMock.sentMessages.at(-1);
      assert.deepEqual(lastMsg, { type: 'GIFS_BLOCKED_COUNT', count: 3, delta: 3 });
    } finally {
      controller.destroy();
      restoreBrowser();
    }
  });

  it('resets per-video counter across rapid navigation events', async () => {
    const browserMock = createBrowserMock();
    const restoreBrowser = browserMock.installAs(globalThis, 'chrome');
    const dom = createDomMock();

    const commentsSection = dom.document.createElement('div');
    commentsSection.id = 'comments';
    dom.document.body.appendChild(commentsSection);

    const controller = NoGifContent.createContentController({
      doc: dom.document,
      storage: NoGifStorage,
      MutationObserver: dom.MutationObserver,
      requestFrame: dom.requestAnimationFrame,
      cancelFrame: dom.cancelAnimationFrame,
    });

    try {
      await controller.start();

      commentsSection.appendChild(createGifComment(dom.document, '').thread);
      commentsSection.appendChild(createGifComment(dom.document, 'Text + GIF').thread);
      dom.flushAll();
      assert.equal(controller.getVideoBlockedCount(), 2);

      for (let i = 0; i < 15; i += 1) {
        commentsSection.textContent = '';
        dom.document.dispatchEvent(new dom.CustomEvent('yt-navigate-finish'));
        assert.equal(dom.getActiveObserverCount(), 1);
        assert.equal(dom.document.listenerCount('yt-navigate-finish'), 1);
        assert.equal(dom.document.listenerCount('yt-page-data-updated'), 1);
      }

      dom.flushAll();
      assert.equal(controller.getVideoBlockedCount(), 0);
      assert.deepEqual(browserMock.sentMessages.at(-1), {
        type: 'GIFS_BLOCKED_COUNT',
        count: 0,
        delta: 0,
      });

      commentsSection.appendChild(createGifComment(dom.document, 'New video GIF').thread);
      dom.flushAll();
      assert.equal(controller.getVideoBlockedCount(), 1);
      assert.deepEqual(browserMock.sentMessages.at(-1), {
        type: 'GIFS_BLOCKED_COUNT',
        count: 1,
        delta: 1,
      });
    } finally {
      controller.destroy();
      assert.equal(dom.getActiveObserverCount(), 0);
      assert.equal(dom.document.listenerCount('yt-navigate-finish'), 0);
      restoreBrowser();
    }
  });

  it('filters Shorts GIF comments when engagement panel mounts and remounts', async () => {
    const browserMock = createBrowserMock();
    const restoreBrowser = browserMock.installAs(globalThis, 'chrome');
    const dom = createDomMock();

    const controller = NoGifContent.createContentController({
      doc: dom.document,
      storage: NoGifStorage,
      MutationObserver: dom.MutationObserver,
      requestFrame: dom.requestAnimationFrame,
      cancelFrame: dom.cancelAnimationFrame,
    });

    try {
      await controller.start();
      dom.flushAll();

      const firstPanel = dom.document.createElement('ytd-engagement-panel-section-list-renderer');
      firstPanel.setAttribute('target-id', 'engagement-panel-comments-section');
      dom.document.body.appendChild(firstPanel);

      const shortComment1 = createGifComment(dom.document, '   ');
      firstPanel.appendChild(shortComment1.vm);
      dom.flushAll();

      assert.equal(shortComment1.vm.dataset.ytGifOnly, 'true');
      assert.equal(controller.getVideoBlockedCount(), 1);

      firstPanel.remove();
      dom.flushAll();

      dom.document.dispatchEvent(new dom.CustomEvent('yt-navigate-finish'));
      dom.flushAll();
      assert.equal(controller.getVideoBlockedCount(), 0);

      const secondPanel = dom.document.createElement('ytd-engagement-panel-section-list-renderer');
      secondPanel.setAttribute('target-id', 'engagement-panel-comments-section');
      const shortComment2 = createGifComment(dom.document, 'Shorts mixed text');
      secondPanel.appendChild(shortComment2.vm);
      dom.document.body.appendChild(secondPanel);
      dom.flushAll();

      assert.equal(shortComment2.vm.dataset.ytGifMixed, 'true');
      assert.notEqual(shortComment2.vm.querySelector('.yt-gif-toggle-btn'), null);
      assert.equal(controller.getVideoBlockedCount(), 1);
    } finally {
      controller.destroy();
      restoreBrowser();
    }
  });

  it('re-evaluates mounted comments immediately when settings change in storage', async () => {
    const browserMock = createBrowserMock();
    const restoreBrowser = browserMock.installAs(globalThis, 'chrome');
    const dom = createDomMock();

    const commentsSection = dom.document.createElement('div');
    commentsSection.id = 'comments';
    const mixed = createGifComment(dom.document, 'Live mode test');
    commentsSection.appendChild(mixed.thread);
    dom.document.body.appendChild(commentsSection);

    const controller = NoGifContent.createContentController({
      doc: dom.document,
      storage: NoGifStorage,
      MutationObserver: dom.MutationObserver,
      requestFrame: dom.requestAnimationFrame,
      cancelFrame: dom.cancelAnimationFrame,
    });

    try {
      await controller.start();
      dom.flushAll();

      assert.equal(dom.document.documentElement.dataset.ytGifMode, 'smart');
      assert.equal(mixed.img.hasAttribute('src'), false);

      await NoGifStorage.saveSettings({ mode: 'strict', bandwidthSaver: false });
      assert.equal(dom.document.documentElement.dataset.ytGifMode, 'strict');
      assert.equal(mixed.img.getAttribute('src'), 'https://i.ytimg.com/c_exp/anim.webp');
    } finally {
      controller.destroy();
      restoreBrowser();
    }
  });

  it('treats nodes stamped inside an existing comment or header as relevant, but ignores unrelated nodes', () => {
    const dom = createDomMock();
    const doc = dom.document;
    const comment = doc.createElement('ytd-comment-view-model');
    const lateText = doc.createElement('span');
    comment.appendChild(lateText);
    const header = doc.createElement('ytd-comments-header-renderer');
    const lateChip = doc.createElement('div');
    header.appendChild(lateChip);
    const unrelated = doc.createElement('div');
    doc.body.appendChild(comment);
    doc.body.appendChild(header);
    doc.body.appendChild(unrelated);

    assert.equal(NoGifContent.isRelevantMutationNode(lateText), true);
    assert.equal(NoGifContent.isRelevantMutationNode(lateChip), true);
    assert.equal(NoGifContent.isRelevantMutationNode(unrelated), false);
  });

  it('does not register unused runtime.onMessage listener in content script', async () => {
    const browserMock = createBrowserMock();
    const restoreBrowser = browserMock.installAs(globalThis, 'chrome');
    const dom = createDomMock();

    const controller = NoGifContent.createContentController({
      doc: dom.document,
      storage: NoGifStorage,
      MutationObserver: dom.MutationObserver,
      requestFrame: dom.requestAnimationFrame,
      cancelFrame: dom.cancelAnimationFrame,
    });

    try {
      await controller.start();
      const response = await browserMock.dispatchMessage({ type: 'GET_VIDEO_BLOCKED_COUNT' });
      assert.equal(response, undefined);
    } finally {
      controller.destroy();
      restoreBrowser();
    }
  });
});
