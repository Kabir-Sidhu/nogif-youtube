'use strict';

(function initNoGifContent(root) {
  const storageShim = root.NoGifStorage
    || (typeof require === 'function' ? require('../utils/storage.js') : null);

  const SELECTORS = Object.freeze({
    GIF_ATTACHMENT: 'ytw-comment-image-attachment-view-model',
    GIF_IMAGE: 'img.ytCoreImageHost.ytwCommentImageAttachmentViewModelImage',
    COMMENT_VIEW: 'ytd-comment-view-model',
    COMMENT_THREAD: 'ytd-comment-thread-renderer',
    REPLIES_CONTAINER: 'ytd-comment-replies-renderer',
    COMMENT_TEXT: 'yt-attributed-string#content-text',
    COMMENTS_HEADER: 'ytd-comments-header-renderer',
    FILTER_CHIP: 'yt-chip-cloud-chip-renderer',
    SHORTS_PANEL: 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
    WATCH_COMMENTS: '#comments',
  });

  function applyRootState(doc, settings) {
    if (!doc || !doc.documentElement) return;
    const html = doc.documentElement;
    html.dataset.ytGifEnabled = String(Boolean(settings.enabled));
    html.dataset.ytGifMode = settings.mode === 'strict' ? 'strict' : 'smart';
    html.dataset.ytGifCollapsible = String(Boolean(settings.showCollapsible));
    html.dataset.ytGifHideChip = String(Boolean(settings.hideGifsChip));
  }

  function classifyComment(commentEl) {
    if (!commentEl || typeof commentEl.querySelector !== 'function') return null;
    const attachment = commentEl.querySelector(SELECTORS.GIF_ATTACHMENT);
    if (!attachment) return null;

    const textEl = commentEl.querySelector(SELECTORS.COMMENT_TEXT);
    const stripped = textEl
      ? String(textEl.textContent || '').replace(/[\s\u00a0\u200b]+/g, '')
      : '';
    return stripped.length === 0 ? 'gif-only' : 'mixed';
  }

  function findAttachmentImage(attachmentEl) {
    if (!attachmentEl || typeof attachmentEl.querySelector !== 'function') return null;
    return attachmentEl.querySelector(SELECTORS.GIF_IMAGE) || attachmentEl.querySelector('img');
  }

  function pauseAttachmentBandwidth(attachmentEl) {
    const img = findAttachmentImage(attachmentEl);
    if (!img) return false;

    const currentSrc = img.getAttribute('src');
    if (currentSrc && !img.dataset.blockedSrc) {
      img.dataset.blockedSrc = currentSrc;
    }
    const currentSrcset = img.getAttribute('srcset');
    if (currentSrcset && !img.dataset.blockedSrcset) {
      img.dataset.blockedSrcset = currentSrcset;
    }

    if (img.hasAttribute('src')) img.removeAttribute('src');
    if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
    return true;
  }

  function restoreAttachmentBandwidth(attachmentEl) {
    const img = findAttachmentImage(attachmentEl);
    if (!img) return false;

    if (img.dataset.blockedSrc && !img.getAttribute('src')) {
      img.setAttribute('src', img.dataset.blockedSrc);
    }
    if (img.dataset.blockedSrcset && !img.getAttribute('srcset')) {
      img.setAttribute('srcset', img.dataset.blockedSrcset);
    }
    return Boolean(img.getAttribute('src'));
  }

  function ensureToggleButton(commentEl, attachmentEl, getSettingsFn) {
    let btn = commentEl.querySelector('.yt-gif-toggle-btn');
    if (!btn) {
      const doc = commentEl.ownerDocument || root.document;
      btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'yt-gif-toggle-btn';
      btn.textContent = '▶ Show GIF';
      btn.setAttribute('aria-expanded', 'false');

      btn.addEventListener('click', (event) => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const willReveal = commentEl.dataset.ytGifRevealed !== 'true';
        if (willReveal) {
          commentEl.dataset.ytGifRevealed = 'true';
          btn.textContent = '▼ Hide GIF';
          btn.setAttribute('aria-expanded', 'true');
          restoreAttachmentBandwidth(attachmentEl);
        } else {
          delete commentEl.dataset.ytGifRevealed;
          btn.textContent = '▶ Show GIF';
          btn.setAttribute('aria-expanded', 'false');
          const activeSettings = typeof getSettingsFn === 'function'
            ? getSettingsFn()
            : storageShim.DEFAULT_SETTINGS;
          if (activeSettings && activeSettings.bandwidthSaver) {
            pauseAttachmentBandwidth(attachmentEl);
          }
        }
      });

      const hostParent = attachmentEl.parentElement || commentEl;
      hostParent.insertBefore(btn, attachmentEl);
    }
    return btn;
  }

  function processCommentElement(commentEl, settings, getSettingsFn) {
    const attachment = commentEl && typeof commentEl.querySelector === 'function'
      ? commentEl.querySelector(SELECTORS.GIF_ATTACHMENT)
      : null;

    if (!attachment) {
      return { blocked: false, kind: null, isReply: false };
    }

    const isReply = Boolean(
      typeof commentEl.closest === 'function' && commentEl.closest(SELECTORS.REPLIES_CONTAINER)
    );

    if (!settings.enabled) {
      delete commentEl.dataset.ytGifBlocked;
      delete commentEl.dataset.ytGifOnly;
      delete commentEl.dataset.ytGifMixed;
      delete commentEl.dataset.ytGifReply;
      delete commentEl.dataset.ytGifRevealed;
      const btn = commentEl.querySelector('.yt-gif-toggle-btn');
      if (btn) {
        btn.textContent = '▶ Show GIF';
        btn.setAttribute('aria-expanded', 'false');
      }
      restoreAttachmentBandwidth(attachment);
      return { blocked: false, kind: null, isReply };
    }

    const kind = classifyComment(commentEl);
    commentEl.dataset.ytGifBlocked = 'true';
    commentEl.dataset.ytGifReply = String(isReply);

    if (kind === 'gif-only') {
      commentEl.dataset.ytGifOnly = 'true';
      delete commentEl.dataset.ytGifMixed;
      delete commentEl.dataset.ytGifRevealed;
      const staleBtn = commentEl.querySelector('.yt-gif-toggle-btn');
      if (staleBtn) staleBtn.remove();
    } else {
      commentEl.dataset.ytGifMixed = 'true';
      delete commentEl.dataset.ytGifOnly;
      if (settings.mode === 'smart' && settings.showCollapsible) {
        ensureToggleButton(commentEl, attachment, getSettingsFn || (() => settings));
      }
    }

    const canBeRevealed = settings.mode === 'smart' && Boolean(settings.showCollapsible);
    if (!canBeRevealed && commentEl.dataset.ytGifRevealed) {
      delete commentEl.dataset.ytGifRevealed;
      const btn = commentEl.querySelector('.yt-gif-toggle-btn');
      if (btn) {
        btn.textContent = '▶ Show GIF';
        btn.setAttribute('aria-expanded', 'false');
      }
    }

    const isRevealed = commentEl.dataset.ytGifRevealed === 'true' && canBeRevealed;
    if (settings.bandwidthSaver && !isRevealed) {
      pauseAttachmentBandwidth(attachment);
    } else {
      restoreAttachmentBandwidth(attachment);
    }

    return { blocked: true, kind, isReply };
  }

  function processGifsChips(rootEl, settings) {
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return 0;
    const selector = `${SELECTORS.COMMENTS_HEADER} ${SELECTORS.FILTER_CHIP}`;
    const chips = Array.from(rootEl.querySelectorAll(selector));
    if (
      typeof rootEl.matches === 'function'
      && rootEl.matches(SELECTORS.FILTER_CHIP)
      && rootEl.closest(SELECTORS.COMMENTS_HEADER)
    ) {
      chips.push(rootEl);
    }

    let matched = 0;
    for (const chip of chips) {
      const label = String(chip.textContent || '').trim().toLowerCase();
      if (label === 'gifs') {
        chip.dataset.ytGifChip = 'true';
        if (settings.enabled && settings.hideGifsChip) {
          chip.dataset.ytGifChipHidden = 'true';
        } else {
          delete chip.dataset.ytGifChipHidden;
        }
        matched += 1;
      }
    }
    return matched;
  }

  const RELEVANT_MUTATION_SELECTOR = [
    SELECTORS.WATCH_COMMENTS,
    SELECTORS.SHORTS_PANEL,
    SELECTORS.COMMENT_THREAD,
    SELECTORS.COMMENT_VIEW,
    SELECTORS.GIF_ATTACHMENT,
    SELECTORS.COMMENTS_HEADER,
    SELECTORS.FILTER_CHIP,
  ].join(', ');

  function isRelevantMutationNode(node) {
    if (!node || node.nodeType !== 1 || typeof node.matches !== 'function') return false;
    if (node.matches(RELEVANT_MUTATION_SELECTOR)) return true;
    if (
      typeof node.closest === 'function'
      && (
        node.closest(SELECTORS.COMMENT_VIEW)
        || node.closest(SELECTORS.COMMENTS_HEADER)
      )
    ) {
      return true;
    }
    return typeof node.querySelector === 'function' && Boolean(node.querySelector(RELEVANT_MUTATION_SELECTOR));
  }

  function createContentController(options = {}) {
    const doc = options.doc || root.document;
    const storage = options.storage || storageShim;
    const requestFrame = options.requestFrame
      || root.requestAnimationFrame
      || ((cb) => setTimeout(cb, 16));
    const cancelFrame = options.cancelFrame
      || root.cancelAnimationFrame
      || ((id) => clearTimeout(id));

    let settings = { ...storage.DEFAULT_SETTINGS };
    let activeVideoBlockedCount = 0;
    let countedComments = new WeakSet();
    let reportedComments = new WeakSet();
    const currentUrl = () => (doc && doc.location && doc.location.href) || '';
    let lastNavUrl = currentUrl();
    const pendingNodes = new Set();
    let rafId = null;
    let observer = null;
    let unsubscribeStorage = null;
    let started = false;

    function sendCountUpdate(count, delta) {
      const api = storage.getBrowserAPI();
      if (!api || !api.runtime || typeof api.runtime.sendMessage !== 'function') return;
      try {
        const maybePromise = api.runtime.sendMessage({
          type: 'GIFS_BLOCKED_COUNT',
          count,
          delta,
        });
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => {});
        }
      } catch {
        // Tab navigating or extension reloaded
      }
    }

    function scanNode(targetNode) {
      if (!targetNode) return { counted: 0, reported: 0 };
      const commentCandidates = new Set();

      if (targetNode.nodeType === 1 && typeof targetNode.matches === 'function') {
        if (targetNode.matches(SELECTORS.COMMENT_VIEW)) {
          commentCandidates.add(targetNode);
        } else if (typeof targetNode.closest === 'function') {
          const parentComment = targetNode.closest(SELECTORS.COMMENT_VIEW);
          if (parentComment) commentCandidates.add(parentComment);
        }
      }

      if (typeof targetNode.querySelectorAll === 'function') {
        for (const el of targetNode.querySelectorAll(SELECTORS.COMMENT_VIEW)) {
          commentCandidates.add(el);
        }
      }

      let counted = 0;
      let reported = 0;
      for (const commentEl of commentCandidates) {
        const res = processCommentElement(commentEl, settings, () => settings);
        if (res.blocked && !countedComments.has(commentEl)) {
          countedComments.add(commentEl);
          activeVideoBlockedCount += 1;
          counted += 1;
          if (!reportedComments.has(commentEl)) {
            reportedComments.add(commentEl);
            reported += 1;
          }
        }
      }

      processGifsChips(targetNode, settings);
      return { counted, reported };
    }

    function flushPendingBatch() {
      rafId = null;
      const batch = Array.from(pendingNodes);
      pendingNodes.clear();

      let counted = 0;
      let delta = 0;
      for (const node of batch) {
        const res = scanNode(node);
        counted += res.counted;
        delta += res.reported;
      }
      if (counted > 0) {
        sendCountUpdate(activeVideoBlockedCount, delta);
      }
    }

    function enqueueNodes(nodes) {
      for (const node of nodes) {
        if (node && (node.nodeType === 1 || node.nodeType === 9)) {
          pendingNodes.add(node);
        }
      }
      if (pendingNodes.size > 0 && rafId === null) {
        rafId = requestFrame(flushPendingBatch);
      }
    }

    function scheduleKnownContainersScan() {
      if (!doc || !doc.documentElement) return;
      const targets = [];
      const watchComments = doc.querySelector(SELECTORS.WATCH_COMMENTS);
      const shortsPanels = doc.querySelectorAll(SELECTORS.SHORTS_PANEL);
      const headers = doc.querySelectorAll(SELECTORS.COMMENTS_HEADER);

      if (watchComments) targets.push(watchComments);
      for (const panel of shortsPanels) targets.push(panel);
      for (const header of headers) targets.push(header);
      if (targets.length === 0) targets.push(doc.documentElement);

      enqueueNodes(targets);
    }

    function handleNavigateFinish() {
      if (rafId !== null) {
        cancelFrame(rafId);
        rafId = null;
      }
      pendingNodes.clear();
      activeVideoBlockedCount = 0;
      const url = currentUrl();
      if (url !== lastNavUrl) {
        lastNavUrl = url;
        reportedComments = new WeakSet();
      }
      countedComments = new WeakSet();
      sendCountUpdate(0, 0);
      scheduleKnownContainersScan();
    }

    function handlePageDataUpdated() {
      scheduleKnownContainersScan();
    }

    function reapplyAllMounted() {
      applyRootState(doc, settings);
      if (!doc || !doc.documentElement) return;
      let delta = 0;
      for (const commentEl of doc.querySelectorAll(SELECTORS.COMMENT_VIEW)) {
        const res = processCommentElement(commentEl, settings, () => settings);
        if (res.blocked && !countedComments.has(commentEl)) {
          countedComments.add(commentEl);
          activeVideoBlockedCount += 1;
          if (!reportedComments.has(commentEl)) {
            reportedComments.add(commentEl);
            delta += 1;
          }
        }
      }
      processGifsChips(doc, settings);
      sendCountUpdate(settings.enabled ? activeVideoBlockedCount : 0, delta);
    }

    async function start() {
      if (started) return;
      started = true;

      applyRootState(doc, settings);
      settings = await storage.getSettings();
      if (!started) return;
      applyRootState(doc, settings);

      const ObserverCtor = options.MutationObserver || root.MutationObserver;
      if (ObserverCtor && doc && doc.documentElement) {
        observer = new ObserverCtor((mutations) => {
          const relevant = [];
          for (const mutation of mutations) {
            if (!mutation.addedNodes) continue;
            for (const added of mutation.addedNodes) {
              if (isRelevantMutationNode(added)) {
                relevant.push(added);
              }
            }
          }
          if (relevant.length > 0) enqueueNodes(relevant);
        });
        observer.observe(doc.documentElement, { childList: true, subtree: true });
      }

      doc.addEventListener('yt-navigate-finish', handleNavigateFinish);
      doc.addEventListener('yt-page-data-updated', handlePageDataUpdated);

      unsubscribeStorage = storage.onSettingsChanged((changes) => {
        const updated = { ...settings };
        for (const [key, change] of Object.entries(changes)) {
          if (!change) continue;
          updated[key] = change.newValue === undefined
            ? storage.DEFAULT_SETTINGS[key]
            : change.newValue;
        }
        settings = storage.sanitizeSettings(updated);
        reapplyAllMounted();
      });

      scheduleKnownContainersScan();
    }

    function destroy() {
      if (!started) return;
      started = false;
      if (rafId !== null) {
        cancelFrame(rafId);
        rafId = null;
      }
      pendingNodes.clear();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (doc) {
        doc.removeEventListener('yt-navigate-finish', handleNavigateFinish);
        doc.removeEventListener('yt-page-data-updated', handlePageDataUpdated);
      }
      if (unsubscribeStorage) {
        unsubscribeStorage();
        unsubscribeStorage = null;
      }
    }

    return {
      start,
      destroy,
      getVideoBlockedCount: () => activeVideoBlockedCount,
      getSettings: () => ({ ...settings }),
    };
  }

  const isNodeRuntime = typeof process !== 'undefined'
    && Boolean(process.versions && process.versions.node);

  if (!isNodeRuntime && root.document) {
    const defaultController = createContentController();
    defaultController.start();
  }

  const exported = {
    SELECTORS,
    applyRootState,
    classifyComment,
    pauseAttachmentBandwidth,
    restoreAttachmentBandwidth,
    ensureToggleButton,
    processCommentElement,
    processGifsChips,
    isRelevantMutationNode,
    createContentController,
  };

  root.NoGifContent = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(globalThis);
