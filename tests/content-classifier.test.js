'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createDomMock } = require('./helpers/mock-env.js');
const { DEFAULT_SETTINGS } = require('../utils/storage.js');
const NoGifContent = require('../content/content.js');

const SAMPLE_WEBP_URL = 'https://i.ytimg.com/c_exp/sample_webp_animated_comment.webp';

function buildCommentDom(doc, { text = '', withGif = true, isReply = false } = {}) {
  const thread = doc.createElement('ytd-comment-thread-renderer');
  const comment = doc.createElement('ytd-comment-view-model');
  const contentWrapper = doc.createElement('div');
  contentWrapper.id = 'content';

  const textNode = doc.createElement('yt-attributed-string');
  textNode.id = 'content-text';
  textNode.textContent = text;
  contentWrapper.appendChild(textNode);

  let attachment = null;
  let img = null;
  if (withGif) {
    attachment = doc.createElement('ytw-comment-image-attachment-view-model');
    img = doc.createElement('img');
    img.className = 'ytCoreImageHost ytwCommentImageAttachmentViewModelImage';
    img.setAttribute('src', SAMPLE_WEBP_URL);
    attachment.appendChild(img);
    contentWrapper.appendChild(attachment);
  }

  comment.appendChild(contentWrapper);

  if (isReply) {
    const replies = doc.createElement('ytd-comment-replies-renderer');
    replies.appendChild(comment);
    thread.appendChild(replies);
  } else {
    thread.appendChild(comment);
  }

  doc.body.appendChild(thread);
  return { thread, comment, attachment, img, textNode };
}

describe('Comment classifier and controls', () => {
  it('marks empty and whitespace-only GIF comments as gif-only', () => {
    const env = createDomMock();
    const emptyCase = buildCommentDom(env.document, { text: '' });
    const whitespaceCase = buildCommentDom(env.document, { text: '   \n\t\u00a0  ' });

    const resEmpty = NoGifContent.processCommentElement(emptyCase.comment, DEFAULT_SETTINGS);
    const resWs = NoGifContent.processCommentElement(whitespaceCase.comment, DEFAULT_SETTINGS);

    assert.equal(resEmpty.kind, 'gif-only');
    assert.equal(emptyCase.comment.dataset.ytGifOnly, 'true');
    assert.equal(emptyCase.comment.dataset.ytGifMixed, undefined);

    assert.equal(resWs.kind, 'gif-only');
    assert.equal(whitespaceCase.comment.dataset.ytGifOnly, 'true');
    assert.equal(whitespaceCase.comment.dataset.ytGifMixed, undefined);
    assert.equal(whitespaceCase.comment.querySelector('.yt-gif-toggle-btn'), null);
  });

  it('marks mixed comments and distinguishes replies', () => {
    const env = createDomMock();
    const topMixed = buildCommentDom(env.document, { text: 'Great breakdown at 02:14!', isReply: false });
    const replyGifOnly = buildCommentDom(env.document, { text: '  ', isReply: true });
    const plainText = buildCommentDom(env.document, { text: 'No GIF here', withGif: false });

    const topRes = NoGifContent.processCommentElement(topMixed.comment, DEFAULT_SETTINGS);
    const replyRes = NoGifContent.processCommentElement(replyGifOnly.comment, DEFAULT_SETTINGS);
    const plainRes = NoGifContent.processCommentElement(plainText.comment, DEFAULT_SETTINGS);

    assert.deepEqual(topRes, { blocked: true, kind: 'mixed', isReply: false });
    assert.equal(topMixed.comment.dataset.ytGifMixed, 'true');
    assert.equal(topMixed.comment.dataset.ytGifReply, 'false');

    assert.deepEqual(replyRes, { blocked: true, kind: 'gif-only', isReply: true });
    assert.equal(replyGifOnly.comment.dataset.ytGifOnly, 'true');
    assert.equal(replyGifOnly.comment.dataset.ytGifReply, 'true');

    assert.deepEqual(plainRes, { blocked: false, kind: null, isReply: false });
  });

  it('injects toggle button on mixed comments and toggles state on click', () => {
    const env = createDomMock();
    const { comment } = buildCommentDom(env.document, { text: 'Check this reaction:' });

    NoGifContent.processCommentElement(comment, DEFAULT_SETTINGS);
    NoGifContent.processCommentElement(comment, DEFAULT_SETTINGS);

    const buttons = comment.querySelectorAll('.yt-gif-toggle-btn');
    assert.equal(buttons.length, 1);
    const btn = buttons[0];
    assert.equal(btn.textContent, '▶ Show GIF');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');

    btn.click();
    assert.equal(comment.dataset.ytGifRevealed, 'true');
    assert.equal(btn.textContent, '▼ Hide GIF');
    assert.equal(btn.getAttribute('aria-expanded'), 'true');

    btn.click();
    assert.equal(comment.dataset.ytGifRevealed, undefined);
    assert.equal(btn.textContent, '▶ Show GIF');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
  });

  it('removes src to save bandwidth and restores it when revealed', () => {
    const env = createDomMock();
    const { comment, img } = buildCommentDom(env.document, { text: 'Reaction below' });

    NoGifContent.processCommentElement(comment, DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);

    assert.equal(img.hasAttribute('src'), false);
    assert.equal(img.dataset.blockedSrc, SAMPLE_WEBP_URL);

    const btn = comment.querySelector('.yt-gif-toggle-btn');
    btn.click();
    assert.equal(img.getAttribute('src'), SAMPLE_WEBP_URL);
    assert.equal(img.dataset.blockedSrc, SAMPLE_WEBP_URL);

    btn.click();
    assert.equal(img.hasAttribute('src'), false);
    assert.equal(img.dataset.blockedSrc, SAMPLE_WEBP_URL);

    btn.click();
    assert.equal(img.getAttribute('src'), SAMPLE_WEBP_URL);
  });

  it('marks the GIFs filter chip without affecting other chips', () => {
    const env = createDomMock();
    const header = env.document.createElement('ytd-comments-header-renderer');
    const topChip = env.document.createElement('yt-chip-cloud-chip-renderer');
    topChip.textContent = 'Top comments';
    const gifsChip = env.document.createElement('yt-chip-cloud-chip-renderer');
    gifsChip.textContent = '  GIFs  ';
    header.appendChild(topChip);
    header.appendChild(gifsChip);
    env.document.body.appendChild(header);

    const count = NoGifContent.processGifsChips(env.document, DEFAULT_SETTINGS);
    assert.equal(count, 1);
    assert.equal(gifsChip.dataset.ytGifChip, 'true');
    assert.equal(topChip.dataset.ytGifChip, undefined);

    const directCount = NoGifContent.processGifsChips(gifsChip, DEFAULT_SETTINGS);
    assert.equal(directCount, 1);
  });

  it('restores images and clears blocking attributes when disabled', () => {
    const env = createDomMock();
    const { comment, img } = buildCommentDom(env.document, { text: 'Temporarily blocked' });

    NoGifContent.processCommentElement(comment, DEFAULT_SETTINGS);
    assert.equal(img.hasAttribute('src'), false);

    const disabledSettings = { ...DEFAULT_SETTINGS, enabled: false };
    NoGifContent.applyRootState(env.document, disabledSettings);
    NoGifContent.processCommentElement(comment, disabledSettings);

    assert.equal(env.document.documentElement.dataset.ytGifEnabled, 'false');
    assert.equal(comment.dataset.ytGifBlocked, undefined);
    assert.equal(img.getAttribute('src'), SAMPLE_WEBP_URL);
  });

  it('collapses revealed GIF when showCollapsible is turned off', () => {
    const env = createDomMock();
    const { comment, img } = buildCommentDom(env.document, { text: 'Revealed then disabled' });

    NoGifContent.processCommentElement(comment, DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);
    const btn = comment.querySelector('.yt-gif-toggle-btn');
    btn.click();
    assert.equal(comment.dataset.ytGifRevealed, 'true');
    assert.equal(img.getAttribute('src'), SAMPLE_WEBP_URL);

    const noCollapsibleSettings = { ...DEFAULT_SETTINGS, showCollapsible: false };
    NoGifContent.processCommentElement(comment, noCollapsibleSettings, () => noCollapsibleSettings);

    assert.equal(comment.dataset.ytGifRevealed, undefined);
    assert.equal(btn.textContent, '▶ Show GIF');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(img.hasAttribute('src'), false);
    assert.equal(img.dataset.blockedSrc, SAMPLE_WEBP_URL);
  });

  it('collapses revealed GIF when switched to strict mode', () => {
    const env = createDomMock();
    const { comment, img } = buildCommentDom(env.document, { text: 'Revealed then strict' });

    NoGifContent.processCommentElement(comment, DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);
    const btn = comment.querySelector('.yt-gif-toggle-btn');
    btn.click();
    assert.equal(comment.dataset.ytGifRevealed, 'true');
    assert.equal(img.getAttribute('src'), SAMPLE_WEBP_URL);

    const strictSettings = { ...DEFAULT_SETTINGS, mode: 'strict' };
    NoGifContent.processCommentElement(comment, strictSettings, () => strictSettings);

    assert.equal(comment.dataset.ytGifRevealed, undefined);
    assert.equal(btn.textContent, '▶ Show GIF');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(img.hasAttribute('src'), false);
    assert.equal(img.dataset.blockedSrc, SAMPLE_WEBP_URL);
  });
});
