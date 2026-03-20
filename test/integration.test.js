'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  deriveUnifiedFullViewingKey,
  generateUnifiedAddress,
  parseAddress,
  parseZip321,
  resolveLibraryPath,
  seedFingerprint
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

test('native seedFingerprint works end to end', { skip: !hasNativePrereqs() }, () => {
  const fingerprint = seedFingerprint('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  assert.equal(
    fingerprint,
    'zip32seedfp1mmlkqnpyvug0w9mdatgz4f6x7t7c65uf7urj24kuk42lm0j78t3sne2h0z'
  );
});

test('native deriveUnifiedFullViewingKey works end to end', { skip: !hasNativePrereqs() }, () => {
  const ufvk = deriveUnifiedFullViewingKey({
    seedHex: '00'.repeat(32),
    network: 'testnet',
    account: 0
  });

  assert.match(ufvk, /^uviewtest/);
});
