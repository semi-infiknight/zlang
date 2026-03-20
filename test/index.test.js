'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AddressParseError,
  KeyDerivationError,
  ScanPriority,
  UnifiedAddressError,
  WalletError,
  Zip321Error,
  ZcashSynchronizer,
  ZcashWallet,
  deriveUnifiedFullViewingKey,
  generateUnifiedAddress,
  parseAddress,
  parseZip321,
  seedFingerprint,
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
      seedFingerprint() {
        return null;
      },
      deriveUnifiedFullViewingKey() {
        return null;
      },
      walletInitDatabase() {
        return null;
      },
      walletCreateAccount() {
        return null;
      },
      walletListAccounts() {
        return null;
      },
      walletGetCurrentAddress() {
        return null;
      },
      walletGetNextAvailableAddress() {
        return null;
      },
      walletGetSaplingAddress() {
        return null;
      },
      walletGetOrchardAddress() {
        return null;
      },
      walletGetTransparentAddress() {
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
          seedFingerprint() {
            return null;
          },
          deriveUnifiedFullViewingKey() {
            return null;
          },
          walletInitDatabase() {
            return null;
          },
          walletCreateAccount() {
            return null;
          },
          walletListAccounts() {
            return null;
          },
          walletGetCurrentAddress() {
            return null;
          },
          walletGetNextAvailableAddress() {
            return null;
          },
          walletGetSaplingAddress() {
            return null;
          },
          walletGetOrchardAddress() {
            return null;
          },
          walletGetTransparentAddress() {
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
      seedFingerprint() {
        return null;
      },
      deriveUnifiedFullViewingKey() {
        return null;
      },
      walletInitDatabase() {
        return null;
      },
      walletCreateAccount() {
        return null;
      },
      walletListAccounts() {
        return null;
      },
      walletGetCurrentAddress() {
        return null;
      },
      walletGetNextAvailableAddress() {
        return null;
      },
      walletGetSaplingAddress() {
        return null;
      },
      walletGetOrchardAddress() {
        return null;
      },
      walletGetTransparentAddress() {
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
          seedFingerprint() {
            return null;
          },
          deriveUnifiedFullViewingKey() {
            return null;
          },
          walletInitDatabase() {
            return null;
          },
          walletCreateAccount() {
            return null;
          },
          walletListAccounts() {
            return null;
          },
          walletGetCurrentAddress() {
            return null;
          },
          walletGetNextAvailableAddress() {
            return null;
          },
          walletGetSaplingAddress() {
            return null;
          },
          walletGetOrchardAddress() {
            return null;
          },
          walletGetTransparentAddress() {
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
        seedFingerprint() {
          return null;
        },
        deriveUnifiedFullViewingKey() {
          return null;
        },
        walletInitDatabase() {
          return null;
        },
        walletCreateAccount() {
          return null;
        },
        walletListAccounts() {
          return null;
        },
        walletGetCurrentAddress() {
          return null;
        },
        walletGetNextAvailableAddress() {
          return null;
        },
        walletGetSaplingAddress() {
          return null;
        },
        walletGetOrchardAddress() {
          return null;
        },
        walletGetTransparentAddress() {
          return null;
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
            seedFingerprint() {
              return null;
            },
            deriveUnifiedFullViewingKey() {
              return null;
            },
            walletInitDatabase() {
              return null;
            },
            walletCreateAccount() {
              return null;
            },
            walletListAccounts() {
              return null;
            },
            walletGetCurrentAddress() {
              return null;
            },
            walletGetNextAvailableAddress() {
              return null;
            },
            walletGetSaplingAddress() {
              return null;
            },
            walletGetOrchardAddress() {
              return null;
            },
            walletGetTransparentAddress() {
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

test('seedFingerprint returns derived fingerprint', () => {
  const fingerprint = seedFingerprint('00'.repeat(32), {
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
      seedFingerprint(seedHex) {
        assert.equal(seedHex, '00'.repeat(32));
        return 'zip32seedfp1example';
      },
      deriveUnifiedFullViewingKey() {
        return null;
      },
      walletInitDatabase() {
        return null;
      },
      walletCreateAccount() {
        return null;
      },
      walletListAccounts() {
        return null;
      },
      walletGetCurrentAddress() {
        return null;
      },
      walletGetNextAvailableAddress() {
        return null;
      },
      walletGetSaplingAddress() {
        return null;
      },
      walletGetOrchardAddress() {
        return null;
      },
      walletGetTransparentAddress() {
        return null;
      },
      lastError() {
        return null;
      }
    }
  });

  assert.equal(fingerprint, 'zip32seedfp1example');
});

test('deriveUnifiedFullViewingKey returns encoded ufvk', () => {
  const ufvk = deriveUnifiedFullViewingKey(
    {
      seedHex: '11'.repeat(32),
      network: 'testnet',
      account: 3
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
        seedFingerprint() {
          return null;
        },
        deriveUnifiedFullViewingKey(inputJson) {
          const parsedInput = JSON.parse(inputJson);
          assert.equal(parsedInput.seed_hex, '11'.repeat(32));
          assert.equal(parsedInput.network, 'testnet');
          assert.equal(parsedInput.account, 3);
          return 'uviewtest1example';
        },
        walletInitDatabase() {
          return null;
        },
        walletCreateAccount() {
          return null;
        },
        walletListAccounts() {
          return null;
        },
        walletGetCurrentAddress() {
          return null;
        },
        walletGetNextAvailableAddress() {
          return null;
        },
        walletGetSaplingAddress() {
          return null;
        },
        walletGetOrchardAddress() {
          return null;
        },
        walletGetTransparentAddress() {
          return null;
        },
        lastError() {
          return null;
        }
      }
    }
  );

  assert.equal(ufvk, 'uviewtest1example');
});

test('null bytes are rejected before native boundary', () => {
  assert.throws(() => parseAddress('abc\0def'), /null bytes/);
  assert.throws(() => parseZip321('zcash:t1abc\0def'), /null bytes/);
  assert.throws(
    () => generateUnifiedAddress({ seedHex: '00'.repeat(32), network: 'test\0net' }),
    /null bytes/
  );
});

test('key derivation surfaces native errors', () => {
  assert.throws(
    () =>
      seedFingerprint('abcd', {
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
          seedFingerprint() {
            return null;
          },
          deriveUnifiedFullViewingKey() {
            return null;
          },
          walletInitDatabase() {
            return null;
          },
          walletCreateAccount() {
            return null;
          },
          walletListAccounts() {
            return null;
          },
          walletGetCurrentAddress() {
            return null;
          },
          walletGetNextAvailableAddress() {
            return null;
          },
          walletGetSaplingAddress() {
            return null;
          },
          walletGetOrchardAddress() {
            return null;
          },
          walletGetTransparentAddress() {
            return null;
          },
          lastError() {
            return 'seed_hex must decode to 32..252 bytes';
          }
        }
      }),
    new KeyDerivationError('seed_hex must decode to 32..252 bytes')
  );
});

test('ZcashWallet wraps wallet lifecycle and address calls', () => {
  const wallet = new ZcashWallet(
    { dbPath: '/tmp/test-wallet.db', network: 'testnet' },
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
        seedFingerprint() {
          return null;
        },
        deriveUnifiedFullViewingKey() {
          return null;
        },
        walletInitDatabase(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.db_path, '/tmp/test-wallet.db');
          assert.equal(parsed.network, 'testnet');
          return JSON.stringify({ status: 'ok' });
        },
        walletCreateAccount(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.account_name, 'Default');
          return JSON.stringify({ account_uuid: '123e4567-e89b-12d3-a456-426614174000' });
        },
        walletListAccounts() {
          return JSON.stringify([
            {
              account_uuid: '123e4567-e89b-12d3-a456-426614174000',
              name: 'Default',
              birthday_height: 123
            }
          ]);
        },
        walletGetCurrentAddress() {
          return 'u1current';
        },
        walletGetNextAvailableAddress() {
          return 'u1next';
        },
        walletGetSaplingAddress() {
          return 'ztestsapling';
        },
        walletGetOrchardAddress() {
          return 'utestorchard';
        },
        walletGetTransparentAddress() {
          return 'tmTest';
        },
        walletGetSummary() {
          return JSON.stringify({
            account_balances: [
              {
                account_uuid: '123e4567-e89b-12d3-a456-426614174000',
                sapling_balance: {
                  spendable: 1,
                  change_pending_confirmation: 2,
                  value_pending_spendability: 3
                },
                orchard_balance: {
                  spendable: 4,
                  change_pending_confirmation: 5,
                  value_pending_spendability: 6
                },
                unshielded_balance: {
                  spendable: 7,
                  change_pending_confirmation: 8,
                  value_pending_spendability: 9
                }
              }
            ],
            chain_tip_height: 120,
            fully_scanned_height: 118
          });
        },
        walletLatestHeight() {
          return JSON.stringify(120);
        },
        walletTransactionDataRequests() {
          return JSON.stringify([
            {
              request_type: 1,
              txid_hex: 'ab'.repeat(32),
              address: null,
              block_range_start: null,
              block_range_end: null
            }
          ]);
        },
        walletGetAllTransparentAddresses() {
          return JSON.stringify(['tmTest']);
        },
        walletPutUtxo(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.txid_hex, 'cd'.repeat(32));
          assert.equal(parsed.index, 1);
          assert.equal(parsed.script_hex, '76a914'.padEnd(50, '0'));
          assert.equal(parsed.value, 5000);
          assert.equal(parsed.height, 222);
          return JSON.stringify({ status: 'ok' });
        },
        walletProposeTransfer(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.account_uuid, '123e4567-e89b-12d3-a456-426614174000');
          assert.equal(parsed.to_address, 'u1recipient');
          assert.equal(parsed.value, 15000);
          assert.equal(parsed.memo, 'hello');
          assert.equal(parsed.change_memo, 'change');
          assert.equal(parsed.fallback_change_pool, 'orchard');
          return JSON.stringify({
            fee_rule: 'zip317',
            min_target_height: 321,
            proposal_hex: 'deadbeef',
            steps: [
              {
                transaction_request_uri: 'zcash:u1recipient?amount=0.00015&message=hello',
                payment_count: 1,
                transparent_input_count: 0,
                shielded_input_count: 1,
                prior_step_input_count: 0,
                fee_required: 1000,
                change_outputs: [
                  {
                    value: 4000,
                    pool: 'orchard',
                    memo_base64: null,
                    is_ephemeral: false
                  }
                ],
                is_shielding: false
              }
            ]
          });
        },
        lastError() {
          return null;
        }
      }
    }
  );

  assert.equal(wallet.initDatabase(), 'ok');
  const accountUuid = wallet.createAccount({
    seedHex: '00'.repeat(32),
    accountName: 'Default',
    treeState: {
      network: 'test',
      height: 123,
      hash: 'abcd',
      time: 1,
      saplingTree: 'sapling',
      orchardTree: 'orchard'
    }
  });
  assert.equal(accountUuid, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(wallet.listAccounts()[0].name, 'Default');
  assert.equal(wallet.getCurrentAddress(accountUuid), 'u1current');
  assert.equal(wallet.getNextAvailableAddress(accountUuid), 'u1next');
  assert.equal(wallet.getSaplingAddress(accountUuid), 'ztestsapling');
  assert.equal(wallet.getOrchardAddress(accountUuid), 'utestorchard');
  assert.equal(wallet.getTransparentAddress(accountUuid), 'tmTest');
  assert.equal(wallet.getWalletSummary().chain_tip_height, 120);
  assert.equal(wallet.latestHeight(), 120);
  assert.equal(wallet.transactionDataRequests()[0].request_type, 1);
  assert.deepEqual(wallet.getAllTransparentAddresses(), ['tmTest']);
  wallet.putUtxo({
    txidHex: 'cd'.repeat(32),
    index: 1,
    scriptHex: '76a914'.padEnd(50, '0'),
    value: 5000,
    height: 222
  });
  assert.equal(
    wallet.proposeTransfer({
      accountUuid,
      toAddress: 'u1recipient',
      value: 15000,
      memo: 'hello',
      changeMemo: 'change',
      fallbackChangePool: 'orchard'
    }).steps[0].fee_required,
    1000
  );
});

test('ZcashWallet surfaces native failures', () => {
  const wallet = new ZcashWallet(
    { dbPath: '/tmp/test-wallet.db', network: 'testnet' },
    {
      native: {
        parse() { return null; },
        parseAddress() { return null; },
        generateUnifiedAddress() { return null; },
        seedFingerprint() { return null; },
        deriveUnifiedFullViewingKey() { return null; },
        walletInitDatabase() { return null; },
        walletCreateAccount() { return null; },
        walletListAccounts() { return null; },
        walletGetCurrentAddress() { return null; },
        walletGetNextAvailableAddress() { return null; },
        walletGetSaplingAddress() { return null; },
        walletGetOrchardAddress() { return null; },
        walletGetTransparentAddress() { return null; },
        walletGetSummary() { return null; },
        walletLatestHeight() { return null; },
        walletTransactionDataRequests() { return null; },
        walletGetAllTransparentAddresses() { return null; },
        walletPutUtxo() { return null; },
        walletProposeTransfer() { return null; },
        lastError() { return 'wallet failed'; }
      }
    }
  );

  assert.throws(() => wallet.initDatabase(), new WalletError('wallet failed'));
});

test('ZcashWallet exposes sync-related wallet methods', () => {
  const wallet = new ZcashWallet(
    { dbPath: '/tmp/test-wallet.db', network: 'testnet' },
    {
      native: {
        parse() { return null; },
        parseAddress() { return null; },
        generateUnifiedAddress() { return null; },
        seedFingerprint() { return null; },
        deriveUnifiedFullViewingKey() { return null; },
        walletInitDatabase() { return JSON.stringify({ status: 'ok' }); },
        walletCreateAccount() { return JSON.stringify({ account_uuid: '123e4567-e89b-12d3-a456-426614174000' }); },
        walletListAccounts() { return JSON.stringify([]); },
        walletGetCurrentAddress() { return 'u1current'; },
        walletGetNextAvailableAddress() { return 'u1next'; },
        walletGetSaplingAddress() { return 'ztestsapling'; },
        walletGetOrchardAddress() { return 'utestorchard'; },
        walletGetTransparentAddress() { return 'tmTest'; },
        walletUpdateChainTip(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.tip_height, 123);
          return JSON.stringify({ status: 'ok' });
        },
        walletSuggestScanRanges() {
          return JSON.stringify([
            { start_height: 100, end_height: 120, priority: ScanPriority.Historic }
          ]);
        },
        walletScanCachedBlocks(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.blocks_hex.length, 2);
          assert.equal(parsed.limit, 2);
          return JSON.stringify({
            start_height: 100,
            end_height: 102,
            spent_sapling_note_count: 0,
            received_sapling_note_count: 1,
            spent_orchard_note_count: 0,
            received_orchard_note_count: 0
          });
        },
        walletPutSaplingSubtreeRoots(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.roots.length, 1);
          return JSON.stringify({ status: 'ok' });
        },
        walletPutOrchardSubtreeRoots(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.roots.length, 1);
          return JSON.stringify({ status: 'ok' });
        },
        walletGetSummary() {
          return JSON.stringify({
            account_balances: [],
            chain_tip_height: 120,
            fully_scanned_height: 118
          });
        },
        walletLatestHeight() {
          return JSON.stringify(120);
        },
        walletTransactionDataRequests() {
          return JSON.stringify([
            {
              request_type: 2,
              txid_hex: null,
              address: 'tmTest',
              block_range_start: 100,
              block_range_end: 123
            }
          ]);
        },
        walletGetAllTransparentAddresses() {
          return JSON.stringify(['tmTest', 'tmAnother']);
        },
        walletPutUtxo(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.value, 10000);
          return JSON.stringify({ status: 'ok' });
        },
        walletProposeTransfer(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.fallback_change_pool, 'sapling');
          return JSON.stringify({
            fee_rule: 'zip317',
            min_target_height: 123,
            proposal_hex: 'beadfeed',
            steps: [
              {
                transaction_request_uri: 'zcash:tmTest?amount=0.0001',
                payment_count: 1,
                transparent_input_count: 1,
                shielded_input_count: 0,
                prior_step_input_count: 0,
                fee_required: 1000,
                change_outputs: [],
                is_shielding: false
              }
            ]
          });
        },
        lastError() { return null; }
      }
    }
  );

  wallet.updateChainTip(123);
  assert.equal(wallet.suggestScanRanges()[0].priority, ScanPriority.Historic);
  assert.equal(
    wallet.scanCachedBlocks({
      blocksHex: ['aa', 'bb'],
      treeState: {
        network: 'test',
        height: 99,
        hash: 'abcd',
        time: 1,
        saplingTree: 'sapling',
        orchardTree: 'orchard'
      },
      limit: 2
    }).received_sapling_note_count,
    1
  );
  wallet.putSaplingSubtreeRoots(0, [{ rootHashHex: '00'.repeat(32), completingBlockHeight: 99 }]);
  wallet.putOrchardSubtreeRoots(0, [{ rootHashHex: '11'.repeat(32), completingBlockHeight: 99 }]);
  assert.equal(wallet.getWalletSummary().fully_scanned_height, 118);
  assert.equal(wallet.latestHeight(), 120);
  assert.equal(wallet.transactionDataRequests()[0].address, 'tmTest');
  assert.deepEqual(wallet.getAllTransparentAddresses(), ['tmTest', 'tmAnother']);
  wallet.putUtxo({
    txidHex: 'ef'.repeat(32),
    index: 0,
    scriptHex: '76a914'.padEnd(50, '1'),
    value: 10000,
    height: 123
  });
  assert.equal(
    wallet.proposeTransfer({
      accountUuid: '123e4567-e89b-12d3-a456-426614174000',
      toAddress: 'tmTest',
      value: 10000,
      fallbackChangePool: 'sapling'
    }).proposal_hex,
    'beadfeed'
  );
});

test('ZcashSynchronizer drives one sync cycle', async () => {
  const calls = [];
  const wallet = {
    updateChainTip(height) {
      calls.push(['updateChainTip', height]);
    },
    putSaplingSubtreeRoots(startIndex, roots) {
      calls.push(['putSaplingSubtreeRoots', startIndex, roots.length]);
    },
    putOrchardSubtreeRoots(startIndex, roots) {
      calls.push(['putOrchardSubtreeRoots', startIndex, roots.length]);
    },
    suggestScanRanges() {
      if (!this.didScan) {
        this.didScan = true;
        return [{ start_height: 10, end_height: 12, priority: ScanPriority.Historic }];
      }
      return [];
    },
    scanCachedBlocks(input) {
      calls.push(['scanCachedBlocks', input.blocksHex.length, input.limit]);
      return {
        start_height: 10,
        end_height: 12,
        spent_sapling_note_count: 0,
        received_sapling_note_count: 1,
        spent_orchard_note_count: 0,
        received_orchard_note_count: 0
      };
    }
  };

  const client = {
    async getLatestBlock() {
      return { height: '12', hash: Buffer.alloc(32) };
    },
    async *getSubtreeRoots(protocol) {
      yield {
        rootHash: Buffer.alloc(32, protocol + 1),
        completingBlockHash: Buffer.alloc(32),
        completingBlockHeight: '9'
      };
    },
    async getTreeState() {
      return {
        network: 'test',
        height: '9',
        hash: 'abcd',
        time: 1,
        saplingTree: 'sapling',
        orchardTree: 'orchard'
      };
    },
    async *getBlockRange() {
      yield {
        protoVersion: 4,
        height: '10',
        hash: Buffer.alloc(32),
        prevHash: Buffer.alloc(32),
        time: 1,
        header: Buffer.alloc(0),
        vtx: [],
        chainMetadata: {
          saplingCommitmentTreeSize: 0,
          orchardCommitmentTreeSize: 0
        }
      };
      yield {
        protoVersion: 4,
        height: '11',
        hash: Buffer.alloc(32),
        prevHash: Buffer.alloc(32),
        time: 1,
        header: Buffer.alloc(0),
        vtx: [],
        chainMetadata: {
          saplingCommitmentTreeSize: 0,
          orchardCommitmentTreeSize: 0
        }
      };
    }
  };

  const synchronizer = new ZcashSynchronizer(wallet, client, { batchSize: 2 });
  const result = await synchronizer.syncOnce();

  assert.equal(result.tipHeight, 12);
  assert.deepEqual(calls, [
    ['updateChainTip', 12],
    ['putSaplingSubtreeRoots', 0, 1],
    ['putOrchardSubtreeRoots', 0, 1],
    ['scanCachedBlocks', 2, 2]
  ]);
});
