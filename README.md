# zcash-zip321-alpha

Alpha JavaScript bindings for useful slices of `librustzcash`: wallet DB/account setup, basic sync plumbing, wallet summary/balances, transaction enhancement inputs, transaction history inspection, transparent UTXO staging, transfer proposal creation, key derivation, unified address generation, address parsing, and ZIP-321 payment URI parsing.

This package wraps a tiny Rust native library over FFI and exposes a Node API that returns structured data for:

- initializing a wallet database and creating accounts
- querying current/next/sapling/orchard/transparent addresses for an account
- talking to `lightwalletd` and driving a basic one-shot sync loop
- querying wallet summary and latest scanned height
- listing pending transaction data requests and transparent receiver addresses
- marking transaction status and reading transaction history/output details
- staging transparent UTXOs discovered outside compact block scanning
- creating ZIP-317 transfer proposals from synced wallet state
- creating, proving, signing, and extracting raw transactions from stored proposals
- deriving seed fingerprints and unified full viewing keys
- deriving unified addresses from a seed
- validating and classifying Zcash addresses
- parsing `zcash:` payment request URIs
- reading amounts in zatoshis
- extracting labels, messages, memos, and extra parameters

## Status

This is intentionally small and alpha. The scope is one operation done cleanly so it can grow into a broader Zcash wallet SDK later.

## Why this shape

The long-term constraint for AI agents is reliability. A narrow API with a native implementation behind it is easier to call correctly than asking an agent to hand-roll ZIP-321 parsing.

## Install

The npm package can be installed once published:

```bash
npm install zcash-zip321-alpha
```

For this alpha release, installation tries the following in order:

1. a packaged prebuilt native library for your platform
2. a matching GitHub release asset for your package version
3. a local Rust build fallback during `npm install`

For local development:

```bash
npm install
npm run build:native
```

The JavaScript bindings will look for the compiled native library in:

- `ZCASH_ZIP321_LIB`
- `prebuilds/<platform>-<arch>`
- `target/debug`
- `target/release`

## Usage

```js
const {
  LightWalletClient,
  ZcashSynchronizer,
  ZcashWallet,
  deriveUnifiedFullViewingKey,
  generateUnifiedAddress,
  parseAddress,
  parseZip321,
  seedFingerprint
} = require('zcash-zip321-alpha');

const request = parseZip321(
  'zcash:zs1exampleaddress?amount=1.25&label=Coffee&message=Hackathon'
);

console.log(request.totalZatoshis);
console.log(request.payments[0].recipientAddress);

const address = parseAddress('zs1exampleaddress');
console.log(address.kind);
console.log(address.network);

const generated = generateUnifiedAddress({
  seedHex: '00'.repeat(32),
  network: 'testnet',
  account: 0,
  receivers: 'all'
});

console.log(generated.address);
console.log(generated.ufvk);
console.log(seedFingerprint('00'.repeat(32)));
console.log(
  deriveUnifiedFullViewingKey({
    seedHex: '00'.repeat(32),
    network: 'testnet',
    account: 0
  })
);

const wallet = new ZcashWallet({
  dbPath: './wallet.db',
  network: 'testnet'
});

console.log(wallet.initDatabase());

const client = new LightWalletClient('lightwalletd.testnet.electriccoin.co:9067', true);
const synchronizer = new ZcashSynchronizer(wallet, client);
// await synchronizer.syncOnce()
```

## API

### `parseZip321(uri: string) => Zip321Request`

Parses a ZIP-321 URI with Rust and returns a typed JavaScript object.

### `parseAddress(address: string) => ParsedAddress`

Validates a Zcash address with Rust and returns normalized metadata:

- `kind`
- `network`
- `canReceiveMemo`
- canonical `normalized` encoding

### `generateUnifiedAddress(input) => GeneratedUnifiedAddress`

Derives a unified address from:

- `seedHex`
- `network`
- `account`
- `receivers`

Returns:

- unified `address`
- `ufvk`
- `diversifierIndexHex`
- `receiverTypes`

### `seedFingerprint(seedHex) => string`

Derives the ZIP-32 seed fingerprint for a 32..252-byte seed.

### `deriveUnifiedFullViewingKey(input) => string`

Derives a UFVK string from:

- `seedHex`
- `network`
- `account`

### `new ZcashWallet({ dbPath, network })`

Builder-facing wallet/database wrapper.

Current methods:

- `initDatabase({ seedHex? })`
- `createAccount({ seedHex, accountName, treeState, recoverUntilHeight? })`
- `listAccounts()`
- `getCurrentAddress(accountUuid)`
- `getNextAvailableAddress(accountUuid)`
- `getSaplingAddress(accountUuid)`
- `getOrchardAddress(accountUuid)`
- `getTransparentAddress(accountUuid)`
- `updateChainTip(tipHeight)`
- `suggestScanRanges()`
- `scanCachedBlocks({ blocksHex, treeState, limit })`
- `putSaplingSubtreeRoots(startIndex, roots)`
- `putOrchardSubtreeRoots(startIndex, roots)`
- `getWalletSummary()`
- `latestHeight()`
- `transactionDataRequests()`
- `getAllTransparentAddresses()`
- `putUtxo({ txidHex, index, scriptHex, value, height })`
- `proposeTransfer({ accountUuid, toAddress, value, memo?, changeMemo?, fallbackChangePool? })`
- `decryptAndStoreTransaction({ txHex, minedHeight? })`
- `setTransactionStatus({ txidHex, status, minedHeight? })`
- `getTransactions(accountUuid, { offset?, limit? })`
- `getTransactionOutputs(txidHex)`
- `createProposedTransactions({ accountUuid, proposalHex, seedHex, ovkPolicy?, spendParamPath?, outputParamPath? })`
- `sendProposedTransactions({ accountUuid, proposalHex, seedHex, client, ovkPolicy?, spendParamPath?, outputParamPath?, height? })`
- `sendTransfer({ accountUuid, toAddress, value, memo?, changeMemo?, fallbackChangePool?, seedHex, client, ovkPolicy?, spendParamPath?, outputParamPath?, height? })`

Notes:

- proposal execution works out of the box because Sapling proving parameters are bundled into the native library
- `spendParamPath` and `outputParamPath` are still accepted if you want to override the bundled prover inputs explicitly

### `new LightWalletClient(host, tls?)`

Minimal gRPC client for `lightwalletd`.

Current methods:

- `getBlock(height)`
- `getTransaction(txid)`
- `sendTransaction(data, height?)`
- `getLatestBlock()`
- `getLatestTreeState()`
- `getTreeState(height)`
- `getLightdInfo()`
- `getTaddressBalance(addresses)`
- `getAddressUtxos(addresses, startHeight, maxEntries?)`
- `getBlockRange(startHeight, endHeight)`
- `getSubtreeRoots(protocol, startIndex?, maxEntries?)`
- `getTaddressTransactions(address, startHeight, endHeight)`
- `getAddressUtxosStream(addresses, startHeight, maxEntries?)`
- `getMempoolTx(excludeTxidSuffixes?)`
- `getMempoolStream()`

### `new ZcashSynchronizer(wallet, client, options?)`

Minimal sync engine.

Current methods:

- `syncOnce()`
- `enhanceTransactions()`
- `syncAndEnhance()`

## Current roadmap

1. Address parsing and validation
2. ZIP-321 parsing
3. Unified address generation
4. Wallet initialization and key derivation
5. Chain sync against `lightwalletd`
6. Transaction enhancement, history inspection, and proposal creation
7. Transaction construction, signing, and broadcast
8. Broader prebuilt-binary coverage across platforms

## Project layout

- [index.js](/Users/semi/Vibecode/zlang/index.js)
- [index.d.ts](/Users/semi/Vibecode/zlang/index.d.ts)
- [src/lib.rs](/Users/semi/Vibecode/zlang/src/lib.rs)

## Release assets

This repo includes GitHub Actions workflows to:

- test on Linux, macOS Intel, macOS Apple Silicon, and Windows
- build native release binaries for those platforms on tagged releases
- upload predictable release assets that the npm installer can download automatically
