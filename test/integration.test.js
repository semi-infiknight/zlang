'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  generateUnifiedAddress,
  parseAddress,
  parseZip321,
  resolveLibraryPath
} = require('../index.js');

function hasNativePrereqs() {
  try {
    require.resolve('koffi');
    return fs.existsSync(resolveLibraryPath());
  } catch {
    return false;
  }
}

test('native parseAddress works end to end', { skip: !hasNativePrereqs() }, () => {
  const parsed = parseAddress('t1PKtYdJJHhc3Pxowmznkg7vdTwnhEsCvR4');

  assert.equal(parsed.normalized, 't1PKtYdJJHhc3Pxowmznkg7vdTwnhEsCvR4');
  assert.equal(parsed.network, 'mainnet');
  assert.equal(parsed.kind, 'p2pkh');
  assert.equal(parsed.canReceiveMemo, false);
});

test('native parseZip321 works end to end', { skip: !hasNativePrereqs() }, () => {
  const parsed = parseZip321(
    'zcash:t1PKtYdJJHhc3Pxowmznkg7vdTwnhEsCvR4?amount=1.23&label=Coffee'
  );

  assert.equal(parsed.totalZatoshis, 123000000);
  assert.equal(parsed.payments.length, 1);
  assert.equal(parsed.payments[0].recipientAddress, 't1PKtYdJJHhc3Pxowmznkg7vdTwnhEsCvR4');
  assert.equal(parsed.payments[0].label, 'Coffee');
});

test('native generateUnifiedAddress works end to end', { skip: !hasNativePrereqs() }, () => {
  const generated = generateUnifiedAddress({
    seedHex: '00'.repeat(32),
    network: 'testnet',
    account: 0,
    receivers: 'all'
  });

  assert.equal(generated.network, 'testnet');
  assert.equal(generated.account, 0);
  assert.match(generated.address, /^u/);
  assert.match(generated.ufvk, /^uview/);
  assert.equal(generated.diversifierIndexHex.length, 22);
  assert.ok(generated.receiverTypes.includes('orchard'));
  assert.ok(generated.receiverTypes.length >= 1);
});
