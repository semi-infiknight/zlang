#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getReleaseAssetName, resolveBuiltLibraryPath } = require('./native.js');

const root = path.resolve(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const outputDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(root, 'dist');

fs.mkdirSync(outputDir, { recursive: true });

const source = resolveBuiltLibraryPath(root);
const target = path.join(outputDir, getReleaseAssetName(packageJson.version));

fs.copyFileSync(source, target);
console.log(`Prepared release asset at ${target}`);
