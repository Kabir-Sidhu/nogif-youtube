'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.equal(buf.subarray(0, 8).equals(PNG_SIGNATURE), true, `${filePath} must have valid PNG signature`);
  const chunkType = buf.subarray(12, 16).toString('ascii');
  assert.equal(chunkType, 'IHDR', `${filePath} first chunk must be IHDR`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('Extension icons and manifest config', () => {
  it('generates valid PNG binaries with 16x16, 48x48, and 128x128 dimensions', () => {
    for (const size of [16, 48, 128]) {
      const iconPath = path.join(ROOT, 'icons', `icon-${size}.png`);
      assert.equal(fs.existsSync(iconPath), true, `icons/icon-${size}.png must exist`);
      const dims = readPngDimensions(iconPath);
      assert.deepEqual(dims, { width: size, height: size });
    }
  });

  it('declares Manifest V3 metadata, storage permission, and YouTube host permissions', () => {
    const manifestPath = path.join(ROOT, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.name, 'NoGIF - Remove YouTube GIF Comments');
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.author, 'Kabir Sidhu');
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.deepEqual(manifest.host_permissions, ['*://*.youtube.com/*']);
  });

  it('wires popup, service worker, document_start content scripts, and icon paths', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

    assert.equal(manifest.action.default_popup, 'popup/popup.html');
    assert.equal(manifest.background.service_worker, 'background/service-worker.js');
    assert.deepEqual(manifest.background.scripts, ['utils/storage.js', 'background/service-worker.js']);
    for (const scriptPath of manifest.background.scripts) {
      assert.equal(fs.existsSync(path.join(ROOT, scriptPath)), true, `${scriptPath} must exist on disk`);
    }

    assert.equal(manifest.content_scripts.length, 1);
    const cs = manifest.content_scripts[0];
    assert.deepEqual(cs.matches, ['*://*.youtube.com/*']);
    assert.deepEqual(cs.js, ['utils/storage.js', 'content/content.js']);
    assert.deepEqual(cs.css, ['content/content.css']);
    assert.equal(cs.run_at, 'document_start');

    for (const size of ['16', '48', '128']) {
      const expectedRel = `icons/icon-${size}.png`;
      assert.equal(manifest.icons[size], expectedRel);
      assert.equal(manifest.action.default_icon[size], expectedRel);
      assert.equal(fs.existsSync(path.join(ROOT, expectedRel)), true);
    }
  });

  it('declares Firefox Gecko compatibility settings', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.browser_specific_settings, {
      gecko: {
        id: 'nogif-youtube@local',
        strict_min_version: '121.0',
      },
    });
  });
});
