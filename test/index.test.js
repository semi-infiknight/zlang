'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AddressParseError,
  LightWalletClient,
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
        walletDecryptAndStoreTransaction(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.tx_hex, 'deadbeef');
          assert.equal(parsed.mined_height, 222);
          return JSON.stringify({ status: 'ok' });
        },
        walletSetTransactionStatus(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.txid_hex, 'ab'.repeat(32));
          assert.equal(parsed.status, 'mined');
          assert.equal(parsed.mined_height, 333);
          return JSON.stringify({ status: 'ok' });
        },
        walletGetTransactions(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.account_uuid, '123e4567-e89b-12d3-a456-426614174000');
          assert.equal(parsed.offset, 0);
          assert.equal(parsed.limit, 10);
          return JSON.stringify([
            {
              txid_hex: 'aa'.repeat(32),
              mined_height: 333,
              block_time: 1700000000,
              account_balance_delta: -15000,
              fee: 1000,
              memo_count: 1,
              account_uuid: parsed.account_uuid,
              is_shielding: false,
              expired_unmined: false
            }
          ]);
        },
        walletGetTransactionOutputs(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.txid_hex, 'aa'.repeat(32));
          return JSON.stringify([
            {
              pool: 'orchard',
              output_index: 0,
              memo_hex: 'f6'.padEnd(1024, '0'),
              address: 'u1recipient',
              value: 15000,
              is_change: false
            }
          ]);
        },
        walletCreateProposedTransactions(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.account_uuid, '123e4567-e89b-12d3-a456-426614174000');
          assert.equal(parsed.proposal_hex, 'deadbeef');
          assert.equal(parsed.seed_hex, '00'.repeat(32));
          assert.equal(parsed.ovk_policy, 'sender');
          return JSON.stringify({
            txids: ['bb'.repeat(32)],
            transactions: [
              {
                txid_hex: 'bb'.repeat(32),
                raw_tx_hex: 'cafebabe'
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
  assert.equal(wallet.decryptAndStoreTransaction({ txHex: 'deadbeef', minedHeight: 222 }).status, 'ok');
  assert.equal(
    wallet.setTransactionStatus({
      txidHex: 'ab'.repeat(32),
      status: 'mined',
      minedHeight: 333
    }).status,
    'ok'
  );
  assert.equal(wallet.getTransactions(accountUuid, { offset: 0, limit: 10 })[0].fee, 1000);
  assert.equal(wallet.getTransactionOutputs('aa'.repeat(32))[0].pool, 'orchard');
  assert.equal(
    wallet.createProposedTransactions({
      accountUuid,
      proposalHex: 'deadbeef',
      seedHex: '00'.repeat(32),
      ovkPolicy: 'sender'
    }).transactions[0].raw_tx_hex,
    'cafebabe'
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
        walletDecryptAndStoreTransaction() { return null; },
        walletSetTransactionStatus() { return null; },
        walletGetTransactions() { return null; },
        walletGetTransactionOutputs() { return null; },
        walletCreateProposedTransactions() { return null; },
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
        walletDecryptAndStoreTransaction(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.tx_hex, 'beadfeed');
          return JSON.stringify({ status: 'ok' });
        },
        walletSetTransactionStatus(inputJson) {
          const parsed = JSON.parse(inputJson);
          assert.equal(parsed.status, 'not_in_main_chain');
          return JSON.stringify({ status: 'ok' });
        },
        walletGetTransactions() {
          return JSON.stringify([
            {
              txid_hex: 'aa'.repeat(32),
              mined_height: null,
              block_time: null,
              account_balance_delta: 10000,
              fee: null,
              memo_count: 0,
              account_uuid: '123e4567-e89b-12d3-a456-426614174000',
              is_shielding: false,
              expired_unmined: false
            }
          ]);
        },
        walletGetTransactionOutputs() {
          return JSON.stringify([
            {
              pool: 'transparent',
              output_index: 0,
              memo_hex: null,
              address: 'tmTest',
              value: 10000,
              is_change: false
            }
          ]);
        },
        walletCreateProposedTransactions() {
          return JSON.stringify({
            txids: ['cc'.repeat(32)],
            transactions: [
              {
                txid_hex: 'cc'.repeat(32),
                raw_tx_hex: 'feedface'
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
  assert.equal(wallet.decryptAndStoreTransaction({ txHex: 'beadfeed' }).status, 'ok');
  assert.equal(
    wallet.setTransactionStatus({
      txidHex: 'aa'.repeat(32),
      status: 'not_in_main_chain'
    }).status,
    'ok'
  );
  assert.equal(wallet.getTransactions('123e4567-e89b-12d3-a456-426614174000')[0].account_balance_delta, 10000);
  assert.equal(wallet.getTransactionOutputs('aa'.repeat(32))[0].address, 'tmTest');
  assert.equal(
    wallet.createProposedTransactions({
      accountUuid: '123e4567-e89b-12d3-a456-426614174000',
      proposalHex: 'beadfeed',
      seedHex: '11'.repeat(32)
    }).txids[0],
    'cc'.repeat(32)
  );
});

test('ZcashWallet sends created transactions through lightwalletd', async () => {
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
        walletUpdateChainTip() { return JSON.stringify({ status: 'ok' }); },
        walletSuggestScanRanges() { return JSON.stringify([]); },
        walletScanCachedBlocks() { return JSON.stringify({}); },
        walletPutSaplingSubtreeRoots() { return JSON.stringify({ status: 'ok' }); },
        walletPutOrchardSubtreeRoots() { return JSON.stringify({ status: 'ok' }); },
        walletGetSummary() { return JSON.stringify(null); },
        walletLatestHeight() { return JSON.stringify(null); },
        walletTransactionDataRequests() { return JSON.stringify([]); },
        walletGetAllTransparentAddresses() { return JSON.stringify([]); },
        walletPutUtxo() { return JSON.stringify({ status: 'ok' }); },
        walletProposeTransfer() { return JSON.stringify({ fee_rule: 'zip317', min_target_height: 1, proposal_hex: 'aa', steps: [] }); },
        walletDecryptAndStoreTransaction() { return JSON.stringify({ status: 'ok' }); },
        walletSetTransactionStatus() { return JSON.stringify({ status: 'ok' }); },
        walletGetTransactions() { return JSON.stringify([]); },
        walletGetTransactionOutputs() { return JSON.stringify([]); },
        walletCreateProposedTransactions() {
          return JSON.stringify({
            txids: ['dd'.repeat(32)],
            transactions: [{ txid_hex: 'dd'.repeat(32), raw_tx_hex: 'feedface' }]
          });
        },
        lastError() { return null; }
      }
    }
  );

  const calls = [];
  const client = {
    async sendTransaction(data, height) {
      calls.push([Buffer.from(data).toString('hex'), height]);
      return { errorCode: 0, errorMessage: '' };
    }
  };

  const result = await wallet.sendProposedTransactions({
    accountUuid: '123e4567-e89b-12d3-a456-426614174000',
    proposalHex: 'deadbeef',
    seedHex: '22'.repeat(32),
    client,
    height: 123
  });

  assert.deepEqual(calls, [['feedface', 123]]);
  assert.equal(result.txids[0], 'dd'.repeat(32));
  assert.equal(result.results[0].response.errorCode, 0);
});

test('ZcashWallet sendTransfer proposes then broadcasts', async () => {
  const calls = [];
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
        walletUpdateChainTip() { return JSON.stringify({ status: 'ok' }); },
        walletSuggestScanRanges() { return JSON.stringify([]); },
        walletScanCachedBlocks() { return JSON.stringify({}); },
        walletPutSaplingSubtreeRoots() { return JSON.stringify({ status: 'ok' }); },
        walletPutOrchardSubtreeRoots() { return JSON.stringify({ status: 'ok' }); },
        walletGetSummary() { return JSON.stringify(null); },
        walletLatestHeight() { return JSON.stringify(null); },
        walletTransactionDataRequests() { return JSON.stringify([]); },
        walletGetAllTransparentAddresses() { return JSON.stringify([]); },
        walletPutUtxo() { return JSON.stringify({ status: 'ok' }); },
        walletProposeTransfer(inputJson) {
          const parsed = JSON.parse(inputJson);
          calls.push(['proposeTransfer', parsed.to_address, parsed.value, parsed.memo]);
          return JSON.stringify({
            fee_rule: 'zip317',
            min_target_height: 1,
            proposal_hex: 'deadbeef',
            steps: []
          });
        },
        walletDecryptAndStoreTransaction() { return JSON.stringify({ status: 'ok' }); },
        walletSetTransactionStatus() { return JSON.stringify({ status: 'ok' }); },
        walletGetTransactions() { return JSON.stringify([]); },
        walletGetTransactionOutputs() { return JSON.stringify([]); },
        walletCreateProposedTransactions(inputJson) {
          const parsed = JSON.parse(inputJson);
          calls.push(['createProposedTransactions', parsed.proposal_hex, parsed.seed_hex]);
          return JSON.stringify({
            txids: ['ee'.repeat(32)],
            transactions: [{ txid_hex: 'ee'.repeat(32), raw_tx_hex: 'feedface' }]
          });
        },
        lastError() { return null; }
      }
    }
  );

  const client = {
    async sendTransaction(data, height) {
      calls.push(['sendTransaction', Buffer.from(data).toString('hex'), height]);
      return { errorCode: 0, errorMessage: '' };
    }
  };

  const result = await wallet.sendTransfer({
    accountUuid: '123e4567-e89b-12d3-a456-426614174000',
    toAddress: 'u1recipient',
    value: 12345,
    memo: 'hello',
    seedHex: '33'.repeat(32),
    client,
    height: 77
  });

  assert.equal(result.proposal.proposal_hex, 'deadbeef');
  assert.equal(result.txids[0], 'ee'.repeat(32));
  assert.deepEqual(calls, [
    ['proposeTransfer', 'u1recipient', 12345, 'hello'],
    ['createProposedTransactions', 'deadbeef', '33'.repeat(32)],
    ['sendTransaction', 'feedface', 77]
  ]);
});

test('ZcashWallet sendProposedTransactions throws on lightwalletd rejection', async () => {
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
        walletUpdateChainTip() { return JSON.stringify({ status: 'ok' }); },
        walletSuggestScanRanges() { return JSON.stringify([]); },
        walletScanCachedBlocks() { return JSON.stringify({}); },
        walletPutSaplingSubtreeRoots() { return JSON.stringify({ status: 'ok' }); },
        walletPutOrchardSubtreeRoots() { return JSON.stringify({ status: 'ok' }); },
        walletGetSummary() { return JSON.stringify(null); },
        walletLatestHeight() { return JSON.stringify(null); },
        walletTransactionDataRequests() { return JSON.stringify([]); },
        walletGetAllTransparentAddresses() { return JSON.stringify([]); },
        walletPutUtxo() { return JSON.stringify({ status: 'ok' }); },
        walletProposeTransfer() { return JSON.stringify({ fee_rule: 'zip317', min_target_height: 1, proposal_hex: 'aa', steps: [] }); },
        walletDecryptAndStoreTransaction() { return JSON.stringify({ status: 'ok' }); },
        walletSetTransactionStatus() { return JSON.stringify({ status: 'ok' }); },
        walletGetTransactions() { return JSON.stringify([]); },
        walletGetTransactionOutputs() { return JSON.stringify([]); },
        walletCreateProposedTransactions() {
          return JSON.stringify({
            txids: ['ff'.repeat(32)],
            transactions: [{ txid_hex: 'ff'.repeat(32), raw_tx_hex: 'feedface' }]
          });
        },
        lastError() { return null; }
      }
    }
  );

  const client = {
    async sendTransaction() {
      return { errorCode: 12, errorMessage: 'rejected' };
    }
  };

  await assert.rejects(
    wallet.sendProposedTransactions({
      accountUuid: '123e4567-e89b-12d3-a456-426614174000',
      proposalHex: 'deadbeef',
      seedHex: '44'.repeat(32),
      client
    }),
    /lightwalletd rejected transaction/
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

test('ZcashSynchronizer enhances pending transaction data requests', async () => {
  const calls = [];
  const wallet = {
    transactionDataRequests() {
      return [
        {
          request_type: 0,
          txid_hex: 'cc'.repeat(32),
          address: null,
          block_range_start: null,
          block_range_end: null
        },
        {
          request_type: 1,
          txid_hex: 'aa'.repeat(32),
          address: null,
          block_range_start: null,
          block_range_end: null
        },
        {
          request_type: 2,
          txid_hex: null,
          address: 'tmTest',
          block_range_start: 100,
          block_range_end: 103
        }
      ];
    },
    decryptAndStoreTransaction(input) {
      calls.push(['decryptAndStoreTransaction', input.txHex, input.minedHeight ?? null]);
      return { status: 'ok' };
    },
    setTransactionStatus(input) {
      calls.push(['setTransactionStatus', input.txidHex, input.status, input.minedHeight ?? null]);
      return { status: 'ok' };
    },
    putUtxo(input) {
      calls.push(['putUtxo', input.txidHex, input.index, input.value, input.height]);
    }
  };

  const client = {
    async getTransaction(txid) {
      calls.push(['getTransaction', Buffer.from(txid).toString('hex')]);
      if (Buffer.from(txid).toString('hex') === 'cc'.repeat(32)) {
        return { data: Buffer.alloc(0), height: '0' };
      }
      return { data: Buffer.from('deadbeef', 'hex'), height: '200' };
    },
    async *getTaddressTransactions(address, startHeight, endHeight) {
      calls.push(['getTaddressTransactions', address, startHeight, endHeight]);
      yield { data: Buffer.from('beadfeed', 'hex'), height: '201' };
    },
    async getAddressUtxos(addresses, startHeight, maxEntries) {
      calls.push(['getAddressUtxos', addresses, startHeight, maxEntries]);
      return {
        addressUtxos: [
          {
            txid: Buffer.from('ab'.repeat(32), 'hex'),
            index: 1,
            script: Buffer.from('76a914'.padEnd(50, '0'), 'hex'),
            valueZat: '5000',
            height: '202'
          }
        ]
      };
    }
  };

  const synchronizer = new ZcashSynchronizer(wallet, client);
  const result = await synchronizer.enhanceTransactions();

  assert.equal(result.requestCount, 3);
  assert.deepEqual(calls, [
    ['getTransaction', 'cc'.repeat(32)],
    ['setTransactionStatus', 'cc'.repeat(32), 'not_in_main_chain', null],
    ['getTransaction', 'aa'.repeat(32)],
    ['decryptAndStoreTransaction', 'deadbeef', 200],
    ['getTaddressTransactions', 'tmTest', 100, 102],
    ['decryptAndStoreTransaction', 'beadfeed', 201],
    ['getAddressUtxos', ['tmTest'], 100, 0],
    ['putUtxo', 'ab'.repeat(32), 1, 5000, 202]
  ]);
});

test('ZcashSynchronizer marks missing status requests as not recognized', async () => {
  const calls = [];
  const wallet = {
    transactionDataRequests() {
      return [
        {
          request_type: 0,
          txid_hex: 'dd'.repeat(32),
          address: null,
          block_range_start: null,
          block_range_end: null
        }
      ];
    },
    setTransactionStatus(input) {
      calls.push(['setTransactionStatus', input.txidHex, input.status]);
      return { status: 'ok' };
    }
  };

  const client = {
    async getTransaction() {
      const error = new Error('txid not recognized');
      error.code = 5;
      throw error;
    }
  };

  const synchronizer = new ZcashSynchronizer(wallet, client);
  const result = await synchronizer.enhanceTransactions();

  assert.equal(result.requestCount, 1);
  assert.deepEqual(calls, [
    ['setTransactionStatus', 'dd'.repeat(32), 'txid_not_recognized']
  ]);
});

test('ZcashSynchronizer syncAndEnhance combines both phases', async () => {
  const calls = [];
  const wallet = {
    updateChainTip(height) {
      calls.push(['updateChainTip', height]);
    },
    putSaplingSubtreeRoots() {},
    putOrchardSubtreeRoots() {},
    suggestScanRanges() {
      return [];
    },
    transactionDataRequests() {
      calls.push(['transactionDataRequests']);
      return [];
    }
  };
  const client = {
    async getLatestBlock() {
      return { height: '15' };
    },
    async *getSubtreeRoots() {}
  };

  const synchronizer = new ZcashSynchronizer(wallet, client);
  const result = await synchronizer.syncAndEnhance();

  assert.equal(result.tipHeight, 15);
  assert.equal(result.requestCount, 0);
  assert.deepEqual(calls, [
    ['updateChainTip', 15],
    ['transactionDataRequests']
  ]);
});

test('LightWalletClient exposes unary RPC helpers', async () => {
  const client = Object.create(LightWalletClient.prototype);
  const calls = [];
  client._unary = async (method, request) => {
    calls.push([method, request]);
    return { ok: true, method };
  };

  assert.equal((await client.getLatestBlock()).method, 'GetLatestBlock');
  assert.equal((await client.getBlock(12)).method, 'GetBlock');
  assert.equal((await client.getTransaction(Buffer.from('aa', 'hex'))).method, 'GetTransaction');
  assert.equal((await client.sendTransaction(Buffer.from('bb', 'hex'), 123)).method, 'SendTransaction');
  assert.equal((await client.getTreeState(12)).method, 'GetTreeState');
  assert.equal((await client.getLatestTreeState()).method, 'GetLatestTreeState');
  assert.equal((await client.getLightdInfo()).method, 'GetLightdInfo');
  assert.equal((await client.getTaddressBalance(['tmTest'])).method, 'GetTaddressBalance');
  assert.equal((await client.getAddressUtxos(['tmTest'], 100, 10)).method, 'GetAddressUtxos');

  assert.deepEqual(calls, [
    ['GetLatestBlock', {}],
    ['GetBlock', { height: 12 }],
    ['GetTransaction', { hash: Buffer.from('aa', 'hex') }],
    ['SendTransaction', { data: Buffer.from('bb', 'hex'), height: 123 }],
    ['GetTreeState', { height: 12 }],
    ['GetLatestTreeState', {}],
    ['GetLightdInfo', {}],
    ['GetTaddressBalance', { addresses: ['tmTest'] }],
    ['GetAddressUtxos', { addresses: ['tmTest'], startHeight: 100, maxEntries: 10 }]
  ]);
});

test('LightWalletClient exposes streaming RPC helpers', async () => {
  const client = Object.create(LightWalletClient.prototype);
  const calls = [];
  client._serverStream = async function * (method, request) {
    calls.push([method, request]);
    yield { method, request };
  };

  const blockRange = [];
  for await (const item of client.getBlockRange(10, 12)) blockRange.push(item);
  const subtreeRoots = [];
  for await (const item of client.getSubtreeRoots(1, 2, 3)) subtreeRoots.push(item);
  const taddrTxs = [];
  for await (const item of client.getTaddressTransactions('tmTest', 100, 120)) taddrTxs.push(item);
  const utxos = [];
  for await (const item of client.getAddressUtxosStream(['tmTest'], 100, 5)) utxos.push(item);
  const mempoolTx = [];
  for await (const item of client.getMempoolTx([Buffer.from('ab', 'hex')])) mempoolTx.push(item);
  const mempoolStream = [];
  for await (const item of client.getMempoolStream()) mempoolStream.push(item);

  assert.equal(blockRange[0].method, 'GetBlockRange');
  assert.equal(subtreeRoots[0].method, 'GetSubtreeRoots');
  assert.equal(taddrTxs[0].method, 'GetTaddressTransactions');
  assert.equal(utxos[0].method, 'GetAddressUtxosStream');
  assert.equal(mempoolTx[0].method, 'GetMempoolTx');
  assert.equal(mempoolStream[0].method, 'GetMempoolStream');

  assert.deepEqual(calls, [
    ['GetBlockRange', { start: { height: 10 }, end: { height: 12 } }],
    ['GetSubtreeRoots', { startIndex: 2, shieldedProtocol: 1, maxEntries: 3 }],
    [
      'GetTaddressTransactions',
      { address: 'tmTest', range: { start: { height: 100 }, end: { height: 120 } } }
    ],
    ['GetAddressUtxosStream', { addresses: ['tmTest'], startHeight: 100, maxEntries: 5 }],
    ['GetMempoolTx', { exclude_txid_suffixes: [Buffer.from('ab', 'hex')] }],
    ['GetMempoolStream', {}]
  ]);
});
