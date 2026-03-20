'use strict';

const fs = require('node:fs');
const path = require('node:path');

function getNativeLibraryFilename(platform = process.platform) {
  if (platform === 'win32') {
    return 'zcash_zip321_alpha_native.dll';
  }

  const extension = platform === 'darwin' ? 'dylib' : 'so';
  return `libzcash_zip321_alpha_native.${extension}`;
}

function getPrebuiltPath(root, platform = process.platform, arch = process.arch) {
  return path.join(root, 'prebuilds', `${platform}-${arch}`, getNativeLibraryFilename(platform));
}

function getReleaseAssetName(version, platform = process.platform, arch = process.arch) {
  const suffix = platform === 'win32'
    ? 'dll'
    : platform === 'darwin'
      ? 'dylib'
      : 'so';

  return `zcash-zip321-alpha-v${version}-${platform}-${arch}.${suffix}`;
}

function resolveBuiltLibraryPath(root, platform = process.platform) {
  const filename = getNativeLibraryFilename(platform);
  const candidates = [
    path.join(root, 'target', 'release', filename),
    path.join(root, 'target', 'debug', filename)
  ];

  const match = candidates.find(candidate => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Could not find built native library. Searched: ${candidates.join(', ')}`);
  }

  return match;
}

function getRepositorySlug(packageJson) {
  const raw = packageJson.repository && packageJson.repository.url;
  if (!raw) {
    throw new Error('package.json repository.url is required for release downloads');
  }

  const match = raw.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Unsupported repository URL: ${raw}`);
  }

  return match[1];
}

module.exports = {
  getNativeLibraryFilename,
  getPrebuiltPath,
  getReleaseAssetName,
  resolveBuiltLibraryPath,
  getRepositorySlug
};
