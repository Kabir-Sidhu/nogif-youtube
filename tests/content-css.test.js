'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS_PATH = path.resolve(__dirname, '..', 'content', 'content.css');

describe('Content stylesheet rules', () => {
  it('uses scoped :has() rules on comment containers and avoids global body:has() selectors', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    assert.match(css, /ytd-comment-thread-renderer:has\(/);
    assert.match(css, /data-yt-gif-only="true"/);
    assert.match(css, /data-yt-gif-revealed="true"/);
    assert.match(css, /data-yt-gif-blocked="true"/);
    assert.doesNotMatch(css, /body:has\(/);
  });

  it('scopes thread-level hiding to direct > ytd-comment-view-model children', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    assert.match(css, /ytd-comment-thread-renderer:has\(>\s*ytd-comment-view-model\[data-yt-gif-only="true"\]\)/);
    assert.match(css, /ytd-comment-replies-renderer\s+ytd-comment-view-model\[data-yt-gif-only="true"\]/);
    assert.match(
      css,
      /\[data-yt-gif-mode="strict"\]\s+ytd-comment-thread-renderer:has\(>\s*ytd-comment-view-model\s+ytw-comment-image-attachment-view-model\)/
    );
    assert.match(
      css,
      /\[data-yt-gif-mode="strict"\]\s+ytd-comment-replies-renderer\s+ytd-comment-view-model:has\(ytw-comment-image-attachment-view-model\)/
    );
  });

  it('targets expected element selectors and defines .yt-gif-toggle-btn styles', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    assert.match(css, /ytw-comment-image-attachment-view-model/);
    assert.match(css, /yt-attributed-string#content-text:empty/);
    assert.match(css, /ytd-comments-header-renderer\s+yt-chip-cloud-chip-renderer\[data-yt-gif-chip="true"\]/);
    assert.match(css, /\.yt-gif-toggle-btn\s*\{/);
  });
});
