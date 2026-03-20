#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { getPrebuiltPath, getReleaseAssetName, getRepositorySlug } = require('./native.js');

const root = path.resolve(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const prebuiltPath = getPrebuiltPath(root);

if (fs.existsSync(prebuiltPath)) {
  console.log(`Using prebuilt native library: ${path.relative(root, prebuiltPath)}`);
  process.exit(0);
}

(async () => {
  if (!process.env.ZCASH_ZIP321_SKIP_DOWNLOAD) {
    try {
      await downloadPrebuiltReleaseAsset();
      console.log(`Downloaded prebuilt native library: ${path.relative(root, prebuiltPath)}`);
      process.exit(0);
    } catch (error) {
      console.warn(`Prebuilt download unavailable: ${error.message}`);
    }
  }

  const cargo = process.env.CARGO || 'cargo';
  const result = spawnSync(cargo, ['build', '--release'], {
    cwd: root,
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    console.error(`Failed to execute ${cargo}: ${result.error.message}`);
    console.error('No prebuilt native library was available, and building from source failed.');
    process.exit(1);
  }

  process.exit(result.status ?? 1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});

function downloadPrebuiltReleaseAsset() {
  const slug = getRepositorySlug(packageJson);
  const assetName = getReleaseAssetName(packageJson.version);
  const url = `https://github.com/${slug}/releases/download/v${packageJson.version}/${assetName}`;

  fs.mkdirSync(path.dirname(prebuiltPath), { recursive: true });

  return new Promise((resolve, reject) => {
    download(url, prebuiltPath, 0, error => {
      if (error) {
        try {
          fs.rmSync(prebuiltPath, { force: true });
        } catch {}
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function download(url, destination, redirects, callback) {
  if (redirects > 5) {
    callback(new Error(`too many redirects downloading ${url}`));
    return;
  }

  const request = https.get(url, response => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      response.resume();
      download(response.headers.location, destination, redirects + 1, callback);
      return;
    }

    if (response.statusCode !== 200) {
      response.resume();
      callback(new Error(`HTTP ${response.statusCode} for ${url}`));
      return;
    }

    const file = fs.createWriteStream(destination);
    response.pipe(file);
    file.on('finish', () => file.close(() => callback(null)));
    file.on('error', error => callback(error));
  });

  request.on('error', callback);
}
