'use strict';

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { LightWalletClient } = require('./sdk/lightwallet/LightWalletClient.js');
const { ZcashSynchronizer, ScanPriority } = require('./sdk/synchronizer/ZcashSynchronizer.js');

let rustStringType;
const nativeBindingCache = new Map();

class ZcashError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZcashError';
  }
}

const Zip321Error = ZcashError;
const AddressParseError = ZcashError;
const UnifiedAddressError = ZcashError;
const KeyDerivationError = ZcashError;
const WalletError = ZcashError;

function rejectNullBytes(value, paramName) {
  if (typeof value === 'string' && value.includes('\0')) {
    throw new ZcashError(`Invalid ${paramName}: string contains null bytes`);
  }
}

function normalizeSendResponse(response, txidHex) {
  const errorCode = Number(response?.errorCode ?? 0);
  const errorMessage = response?.errorMessage || '';

  if (errorCode !== 0) {
    throw new WalletError(
      `lightwalletd rejected transaction ${txidHex}: [${errorCode}] ${errorMessage}`
    );
  }

  return {
    errorCode,
    errorMessage
  };
}

function resolveLibraryPath(explicitPath) {
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) {
      return explicitPath;
    }

    throw new ZcashError(`could not locate the native ZIP-321 library at explicit path: ${explicitPath}`);
  }

  const candidates = [];

  if (process.env.ZCASH_ZIP321_LIB) {
    candidates.push(process.env.ZCASH_ZIP321_LIB);
  }

  const extension = process.platform === 'win32'
    ? 'dll'
    : process.platform === 'darwin'
      ? 'dylib'
      : 'so';

  const libraryFile = process.platform === 'win32'
    ? 'zcash_zip321_alpha_native.dll'
    : `libzcash_zip321_alpha_native.${extension}`;

  candidates.push(
    path.join(__dirname, 'target', 'release', libraryFile),
    path.join(__dirname, 'target', 'debug', libraryFile)
  );

  const match = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (match) {
    return match;
  }

  throw new ZcashError(
    `could not locate the native ZIP-321 library; searched: ${candidates.join(', ')}`
  );
}

function createNativeBindings(explicitPath) {
  const libraryPath = resolveLibraryPath(explicitPath);
  const cached = nativeBindingCache.get(libraryPath);
  if (cached) {
    return cached;
  }

  const koffi = require('koffi');
  const lib = koffi.load(libraryPath);
  const freeRustString = lib.func('void zcash_zip321_string_free(void *ptr)');
  rustStringType ||= koffi.disposable('RustString', 'str', freeRustString);

  const bindings = {
    parse: lib.func('RustString zcash_zip321_parse(const char *uri)'),
    parseAddress: lib.func('RustString zcash_address_parse(const char *address)'),
    generateUnifiedAddress: lib.func('RustString zcash_unified_address_generate(const char *input_json)'),
    seedFingerprint: lib.func('RustString zcash_seed_fingerprint(const char *seed_hex)'),
    deriveUnifiedFullViewingKey: lib.func('RustString zcash_unified_full_viewing_key_derive(const char *input_json)'),
    walletInitDatabase: lib.func('RustString zcash_wallet_init_database(const char *input_json)'),
    walletCreateAccount: lib.func('RustString zcash_wallet_create_account(const char *input_json)'),
    walletListAccounts: lib.func('RustString zcash_wallet_list_accounts(const char *input_json)'),
    walletGetCurrentAddress: lib.func('RustString zcash_wallet_get_current_address(const char *input_json)'),
    walletGetNextAvailableAddress: lib.func('RustString zcash_wallet_get_next_available_address(const char *input_json)'),
    walletGetSaplingAddress: lib.func('RustString zcash_wallet_get_sapling_address(const char *input_json)'),
    walletGetOrchardAddress: lib.func('RustString zcash_wallet_get_orchard_address(const char *input_json)'),
    walletGetTransparentAddress: lib.func('RustString zcash_wallet_get_transparent_address(const char *input_json)'),
    walletUpdateChainTip: lib.func('RustString zcash_wallet_update_chain_tip(const char *input_json)'),
    walletSuggestScanRanges: lib.func('RustString zcash_wallet_suggest_scan_ranges(const char *input_json)'),
    walletScanCachedBlocks: lib.func('RustString zcash_wallet_scan_cached_blocks(const char *input_json)'),
    walletPutSaplingSubtreeRoots: lib.func('RustString zcash_wallet_put_sapling_subtree_roots(const char *input_json)'),
    walletPutOrchardSubtreeRoots: lib.func('RustString zcash_wallet_put_orchard_subtree_roots(const char *input_json)'),
    walletGetSummary: lib.func('RustString zcash_wallet_get_summary(const char *input_json)'),
    walletLatestHeight: lib.func('RustString zcash_wallet_latest_height(const char *input_json)'),
    walletTransactionDataRequests: lib.func('RustString zcash_wallet_transaction_data_requests(const char *input_json)'),
    walletGetAllTransparentAddresses: lib.func('RustString zcash_wallet_get_all_transparent_addresses(const char *input_json)'),
    walletPutUtxo: lib.func('RustString zcash_wallet_put_utxo(const char *input_json)'),
    walletProposeTransfer: lib.func('RustString zcash_wallet_propose_transfer(const char *input_json)'),
    walletDecryptAndStoreTransaction: lib.func('RustString zcash_wallet_decrypt_and_store_transaction(const char *input_json)'),
    walletSetTransactionStatus: lib.func('RustString zcash_wallet_set_transaction_status(const char *input_json)'),
    walletGetTransactions: lib.func('RustString zcash_wallet_get_transactions(const char *input_json)'),
    walletGetTransactionOutputs: lib.func('RustString zcash_wallet_get_transaction_outputs(const char *input_json)'),
    walletCreateProposedTransactions: lib.func('RustString zcash_wallet_create_proposed_transactions(const char *input_json)'),
    lastError: lib.func('RustString zcash_zip321_last_error(void)')
  };

  nativeBindingCache.set(libraryPath, bindings);
  return bindings;
}

function normalizeRequest(payload) {
  return {
    uri: payload.uri,
    totalZatoshis: payload.total_zatoshis,
    payments: payload.payments.map(payment => ({
      index: payment.index,
      recipientAddress: payment.recipient_address,
      amountZatoshis: payment.amount_zatoshis,
      memoBase64: payment.memo_base64,
      label: payment.label,
      message: payment.message,
      otherParams: payment.other_params
    }))
  };
}

function parseZip321(uri, options = {}) {
  rejectNullBytes(uri, 'uri');
  const native = options.native || createNativeBindings(options.libraryPath);
  const response = native.parse(uri);

  if (response == null) {
    const message = native.lastError() || 'native ZIP-321 parser failed';
    throw new Zip321Error(message);
  }

  return normalizeRequest(JSON.parse(response));
}

function normalizeParsedAddress(payload) {
  return {
    address: payload.address,
    normalized: payload.normalized,
    network: payload.network,
    kind: payload.kind,
    canReceiveMemo: payload.can_receive_memo
  };
}

function parseAddress(address, options = {}) {
  rejectNullBytes(address, 'address');
  const native = options.native || createNativeBindings(options.libraryPath);
  const response = native.parseAddress(address);

  if (response == null) {
    const message = native.lastError() || 'native Zcash address parser failed';
    throw new AddressParseError(message);
  }

  return normalizeParsedAddress(JSON.parse(response));
}

function normalizeGeneratedUnifiedAddress(payload) {
  return {
    network: payload.network,
    account: payload.account,
    address: payload.address,
    ufvk: payload.ufvk,
    diversifierIndexHex: payload.diversifier_index_hex,
    receiverTypes: payload.receiver_types
  };
}

function generateUnifiedAddress(input, options = {}) {
  rejectNullBytes(input.seedHex, 'seedHex');
  if (input.network != null) rejectNullBytes(input.network, 'network');
  if (input.receivers != null) rejectNullBytes(input.receivers, 'receivers');
  const native = options.native || createNativeBindings(options.libraryPath);
  const normalizedInput = {
    seed_hex: input.seedHex,
    network: input.network,
    account: input.account,
    receivers: input.receivers
  };
  const response = native.generateUnifiedAddress(JSON.stringify(normalizedInput));

  if (response == null) {
    const message = native.lastError() || 'native unified address generation failed';
    throw new UnifiedAddressError(message);
  }

  return normalizeGeneratedUnifiedAddress(JSON.parse(response));
}

function seedFingerprint(seedHex, options = {}) {
  rejectNullBytes(seedHex, 'seedHex');
  const native = options.native || createNativeBindings(options.libraryPath);
  const response = native.seedFingerprint(seedHex);

  if (response == null) {
    const message = native.lastError() || 'native seed fingerprint derivation failed';
    throw new KeyDerivationError(message);
  }

  return response;
}

function deriveUnifiedFullViewingKey(input, options = {}) {
  rejectNullBytes(input.seedHex, 'seedHex');
  if (input.network != null) rejectNullBytes(input.network, 'network');
  const native = options.native || createNativeBindings(options.libraryPath);
  const normalizedInput = {
    seed_hex: input.seedHex,
    network: input.network,
    account: input.account
  };
  const response = native.deriveUnifiedFullViewingKey(JSON.stringify(normalizedInput));

  if (response == null) {
    const message = native.lastError() || 'native UFVK derivation failed';
    throw new KeyDerivationError(message);
  }

  return response;
}

class ZcashWallet {
  constructor({ dbPath, network = 'mainnet' }, options = {}) {
    rejectNullBytes(dbPath, 'dbPath');
    rejectNullBytes(network, 'network');
    this.dbPath = dbPath;
    this.network = network;
    this._native = options.native || createNativeBindings(options.libraryPath);
  }

  initDatabase({ seedHex } = {}) {
    if (seedHex != null) rejectNullBytes(seedHex, 'seedHex');
    const response = this._native.walletInitDatabase(
      JSON.stringify({
        db_path: this.dbPath,
        network: this.network,
        seed_hex: seedHex
      })
    );
    if (response == null) {
      throw new WalletError(this._native.lastError() || 'wallet database initialization failed');
    }
    return JSON.parse(response).status;
  }

  createAccount({ seedHex, accountName, treeState, recoverUntilHeight }) {
    rejectNullBytes(seedHex, 'seedHex');
    rejectNullBytes(accountName, 'accountName');
    const response = this._native.walletCreateAccount(
      JSON.stringify({
        db_path: this.dbPath,
        network: this.network,
        seed_hex: seedHex,
        account_name: accountName,
        treestate: {
          network: treeState.network,
          height: treeState.height,
          hash: treeState.hash,
          time: treeState.time,
          sapling_tree: treeState.saplingTree,
          orchard_tree: treeState.orchardTree
        },
        recover_until_height: recoverUntilHeight
      })
    );
    if (response == null) {
      throw new WalletError(this._native.lastError() || 'wallet account creation failed');
    }
    return JSON.parse(response).account_uuid;
  }

  listAccounts() {
    const response = this._native.walletListAccounts(
      JSON.stringify({
        db_path: this.dbPath,
        network: this.network
      })
    );
    if (response == null) {
      throw new WalletError(this._native.lastError() || 'wallet account listing failed');
    }
    return JSON.parse(response);
  }

  getCurrentAddress(accountUuid) {
    return this._walletStringCall('walletGetCurrentAddress', accountUuid);
  }

  getNextAvailableAddress(accountUuid) {
    return this._walletStringCall('walletGetNextAvailableAddress', accountUuid);
  }

  getSaplingAddress(accountUuid) {
    return this._walletStringCall('walletGetSaplingAddress', accountUuid);
  }

  getOrchardAddress(accountUuid) {
    return this._walletStringCall('walletGetOrchardAddress', accountUuid);
  }

  getTransparentAddress(accountUuid) {
    return this._walletStringCall('walletGetTransparentAddress', accountUuid);
  }

  updateChainTip(tipHeight) {
    this._walletJsonCall('walletUpdateChainTip', {
      db_path: this.dbPath,
      network: this.network,
      tip_height: tipHeight
    });
  }

  suggestScanRanges() {
    return this._walletJsonCall('walletSuggestScanRanges', {
      db_path: this.dbPath,
      network: this.network
    });
  }

  scanCachedBlocks({ blocksHex, treeState, limit }) {
    return this._walletJsonCall('walletScanCachedBlocks', {
      db_path: this.dbPath,
      network: this.network,
      blocks_hex: blocksHex,
      treestate: {
        network: treeState.network,
        height: treeState.height,
        hash: treeState.hash,
        time: treeState.time,
        sapling_tree: treeState.saplingTree,
        orchard_tree: treeState.orchardTree
      },
      limit
    });
  }

  putSaplingSubtreeRoots(startIndex, roots) {
    this._walletJsonCall('walletPutSaplingSubtreeRoots', {
      db_path: this.dbPath,
      network: this.network,
      start_index: startIndex,
      roots: roots.map(root => ({
        root_hash_hex: root.rootHashHex,
        completing_block_height: root.completingBlockHeight
      }))
    });
  }

  putOrchardSubtreeRoots(startIndex, roots) {
    this._walletJsonCall('walletPutOrchardSubtreeRoots', {
      db_path: this.dbPath,
      network: this.network,
      start_index: startIndex,
      roots: roots.map(root => ({
        root_hash_hex: root.rootHashHex,
        completing_block_height: root.completingBlockHeight
      }))
    });
  }

  getWalletSummary() {
    return this._walletJsonCall('walletGetSummary', {
      db_path: this.dbPath,
      network: this.network
    });
  }

  latestHeight() {
    return this._walletJsonCall('walletLatestHeight', {
      db_path: this.dbPath,
      network: this.network
    });
  }

  transactionDataRequests() {
    return this._walletJsonCall('walletTransactionDataRequests', {
      db_path: this.dbPath,
      network: this.network
    });
  }

  getAllTransparentAddresses() {
    return this._walletJsonCall('walletGetAllTransparentAddresses', {
      db_path: this.dbPath,
      network: this.network
    });
  }

  putUtxo({ txidHex, index, scriptHex, value, height }) {
    this._walletJsonCall('walletPutUtxo', {
      db_path: this.dbPath,
      network: this.network,
      txid_hex: txidHex,
      index,
      script_hex: scriptHex,
      value,
      height
    });
  }

  proposeTransfer({ accountUuid, toAddress, value, memo, changeMemo, fallbackChangePool }) {
    return this._walletJsonCall('walletProposeTransfer', {
      db_path: this.dbPath,
      network: this.network,
      account_uuid: accountUuid,
      to_address: toAddress,
      value,
      memo,
      change_memo: changeMemo,
      fallback_change_pool: fallbackChangePool
    });
  }

  decryptAndStoreTransaction({ txHex, minedHeight }) {
    return this._walletJsonCall('walletDecryptAndStoreTransaction', {
      db_path: this.dbPath,
      network: this.network,
      tx_hex: txHex,
      mined_height: minedHeight
    });
  }

  setTransactionStatus({ txidHex, status, minedHeight }) {
    return this._walletJsonCall('walletSetTransactionStatus', {
      db_path: this.dbPath,
      network: this.network,
      txid_hex: txidHex,
      status,
      mined_height: minedHeight
    });
  }

  getTransactions(accountUuid, options = {}) {
    rejectNullBytes(accountUuid, 'accountUuid');
    return this._walletJsonCall('walletGetTransactions', {
      db_path: this.dbPath,
      network: this.network,
      account_uuid: accountUuid,
      offset: options.offset,
      limit: options.limit
    });
  }

  getTransactionOutputs(txidHex) {
    rejectNullBytes(txidHex, 'txidHex');
    return this._walletJsonCall('walletGetTransactionOutputs', {
      db_path: this.dbPath,
      network: this.network,
      txid_hex: txidHex
    });
  }

  createProposedTransactions({
    accountUuid,
    proposalHex,
    seedHex,
    ovkPolicy,
    spendParamPath,
    outputParamPath
  }) {
    rejectNullBytes(accountUuid, 'accountUuid');
    rejectNullBytes(proposalHex, 'proposalHex');
    rejectNullBytes(seedHex, 'seedHex');
    rejectNullBytes(spendParamPath, 'spendParamPath');
    rejectNullBytes(outputParamPath, 'outputParamPath');
    return this._walletJsonCall('walletCreateProposedTransactions', {
      db_path: this.dbPath,
      network: this.network,
      account_uuid: accountUuid,
      proposal_hex: proposalHex,
      seed_hex: seedHex,
      ovk_policy: ovkPolicy,
      spend_param_path: spendParamPath,
      output_param_path: outputParamPath
    });
  }

  async sendProposedTransactions({
    accountUuid,
    proposalHex,
    seedHex,
    client,
    ovkPolicy,
    spendParamPath,
    outputParamPath,
    height = 0
  }) {
    const created = this.createProposedTransactions({
      accountUuid,
      proposalHex,
      seedHex,
      ovkPolicy,
      spendParamPath,
      outputParamPath
    });

    const results = [];
    for (const tx of created.transactions) {
      const response = normalizeSendResponse(
        await client.sendTransaction(Buffer.from(tx.raw_tx_hex, 'hex'), height),
        tx.txid_hex
      );
      results.push({
        txidHex: tx.txid_hex,
        rawTxHex: tx.raw_tx_hex,
        response
      });
    }

    return {
      txids: created.txids,
      results
    };
  }

  async sendTransfer({
    accountUuid,
    toAddress,
    value,
    memo,
    changeMemo,
    fallbackChangePool,
    seedHex,
    client,
    ovkPolicy,
    spendParamPath,
    outputParamPath,
    height = 0
  }) {
    const proposal = this.proposeTransfer({
      accountUuid,
      toAddress,
      value,
      memo,
      changeMemo,
      fallbackChangePool
    });

    const sent = await this.sendProposedTransactions({
      accountUuid,
      proposalHex: proposal.proposal_hex,
      seedHex,
      client,
      ovkPolicy,
      spendParamPath,
      outputParamPath,
      height
    });

    return {
      proposal,
      txids: sent.txids,
      results: sent.results
    };
  }

  _walletStringCall(methodName, accountUuid) {
    rejectNullBytes(accountUuid, 'accountUuid');
    const response = this._native[methodName](
      JSON.stringify({
        db_path: this.dbPath,
        network: this.network,
        account_uuid: accountUuid
      })
    );
    if (response == null) {
      throw new WalletError(this._native.lastError() || `${methodName} failed`);
    }
    return response;
  }

  _walletJsonCall(methodName, payload) {
    const response = this._native[methodName](JSON.stringify(payload));
    if (response == null) {
      throw new WalletError(this._native.lastError() || `${methodName} failed`);
    }
    return JSON.parse(response);
  }
}

module.exports = {
  AddressParseError,
  LightWalletClient,
  KeyDerivationError,
  ScanPriority,
  UnifiedAddressError,
  WalletError,
  ZcashError,
  ZcashWallet,
  ZcashSynchronizer,
  Zip321Error,
  createNativeBindings,
  deriveUnifiedFullViewingKey,
  generateUnifiedAddress,
  parseAddress,
  parseZip321,
  seedFingerprint,
  resolveLibraryPath
};
