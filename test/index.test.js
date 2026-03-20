'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AddressParseError,
  UnifiedAddressError,
  Zip321Error,
  generateUnifiedAddress,
  parseAddress,
  parseZip321,
  resolveLibraryPath
} = require('../index.js');

test('parseZip321 returns a normalized request', () => {
  const request = parseZip321('zcash:zs1example?amount=1', {
    native: {
      parse() {
        return JSON.stringify({
          uri: 'zcash:zs1example?amount=1',
          total_zatoshis: 100000000,
          payments: [
            {
              index: 0,
              recipient_address: 'zs1example',
              amount_zatoshis: 100000000,
              memo_base64: null,
              label: 'Coffee',
              message: 'Hackathon',
              other_params: { foo: 'bar' }
            }
          ]
        });
      },
      parseAddress() {
        return null;
      },
      generateUnifiedAddress() {
        return null;
      },
      lastError() {
        return null;
      }
    }
  });

  assert.equal(request.totalZatoshis, 100000000);
  assert.equal(request.payments[0].recipientAddress, 'zs1example');
  assert.equal(request.payments[0].otherParams.foo, 'bar');
});

test('parseZip321 surfaces native errors', () => {
  assert.throws(
    () =>
      parseZip321('zcash:bad', {
        native: {
          parse() {
            return null;
          },
          parseAddress() {
            return null;
          },
          generateUnifiedAddress() {
            return null;
          },
          lastError() {
            return 'invalid ZIP-321 URI';
          }
        }
      }),
    new Zip321Error('invalid ZIP-321 URI')
  );
});

test('resolveLibraryPath throws when the library does not exist', () => {
  assert.throws(() => resolveLibraryPath('/tmp/does-not-exist'), Zip321Error);
});

test('parseAddress returns normalized metadata', () => {
  const parsed = parseAddress('u1example', {
    native: {
      parse() {
        return null;
      },
      parseAddress() {
        return JSON.stringify({
          address: 'u1example',
          normalized: 'u1example',
          network: 'mainnet',
          kind: 'unified',
          can_receive_memo: true
        });
      },
      generateUnifiedAddress() {
        return null;
      },
      lastError() {
        return null;
      }
    }
  });

  assert.equal(parsed.kind, 'unified');
  assert.equal(parsed.network, 'mainnet');
  assert.equal(parsed.canReceiveMemo, true);
});

test('parseAddress surfaces native errors', () => {
  assert.throws(
    () =>
      parseAddress('bad-address', {
        native: {
          parse() {
            return null;
          },
          parseAddress() {
            return null;
          },
          generateUnifiedAddress() {
            return null;
          },
          lastError() {
            return 'not a Zcash address';
          }
        }
      }),
    new AddressParseError('not a Zcash address')
  );
});

test('generateUnifiedAddress returns normalized metadata', () => {
  const generated = generateUnifiedAddress(
    {
      seedHex: '00'.repeat(32),
      network: 'testnet',
      account: 7,
      receivers: 'shielded'
    },
    {
      native: {
        parse() {
          return null;
        },
        parseAddress() {
          return null;
        },
        generateUnifiedAddress(inputJson) {
          const parsedInput = JSON.parse(inputJson);

          assert.equal(parsedInput.seed_hex, '00'.repeat(32));
          assert.equal(parsedInput.network, 'testnet');
          assert.equal(parsedInput.account, 7);
          assert.equal(parsedInput.receivers, 'shielded');

          return JSON.stringify({
            network: 'testnet',
            account: 7,
            address: 'u1generated',
            ufvk: 'uview1generated',
            diversifier_index_hex: '0000000000000000000000',
            receiver_types: ['orchard', 'sapling']
          });
        },
        lastError() {
          return null;
        }
      }
    }
  );

  assert.equal(generated.network, 'testnet');
  assert.equal(generated.account, 7);
  assert.equal(generated.diversifierIndexHex, '0000000000000000000000');
  assert.deepEqual(generated.receiverTypes, ['orchard', 'sapling']);
});

test('generateUnifiedAddress surfaces native errors', () => {
  assert.throws(
    () =>
      generateUnifiedAddress(
        {
          seedHex: 'abcd'
        },
        {
          native: {
            parse() {
              return null;
            },
            parseAddress() {
              return null;
            },
            generateUnifiedAddress() {
              return null;
            },
            lastError() {
              return 'seed_hex must decode to at least 32 bytes';
            }
          }
        }
      ),
    new UnifiedAddressError('seed_hex must decode to at least 32 bytes')
  );
});
