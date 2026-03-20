#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPrebuiltPath, resolveBuiltLibraryPath } = require('./native.js');

const root = path.resolve(__dirname, '..');
const source = resolveBuiltLibraryPath(root);
const target = getPrebuiltPath(root);
const targetDir = path.dirname(target);

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);

console.log(`Staged prebuilt native library at ${path.relative(root, target)}`);
