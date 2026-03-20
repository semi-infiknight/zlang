# zcash-zip321-alpha

Alpha JavaScript bindings for useful slices of `librustzcash`: unified address generation, address parsing, and ZIP-321 payment URI parsing.

This package wraps a tiny Rust native library over FFI and exposes a Node API that returns structured data for:

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

For this alpha release, installation expects a working Rust toolchain because the native library is built during `npm install`.

For local development:

```bash
npm install
npm run build:native
```

The JavaScript bindings will look for the compiled native library in:

- `ZCASH_ZIP321_LIB`
- `target/debug`
- `target/release`

## Usage

```js
const {
  generateUnifiedAddress,
  parseAddress,
  parseZip321
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

## Current roadmap

1. Address parsing and validation
2. ZIP-321 parsing
3. Unified address generation
4. Wallet initialization and key derivation
5. Chain sync against `lightwalletd`
6. Transaction proposal and send

## Project layout

- [index.js](/Users/semi/Vibecode/zlang/index.js)
- [index.d.ts](/Users/semi/Vibecode/zlang/index.d.ts)
- [src/lib.rs](/Users/semi/Vibecode/zlang/src/lib.rs)

## Publish

1. Create a GitHub repo.
2. Push this directory.
3. Build and test the Rust library.
4. Publish the npm package with `npm publish --access public`.

Before publishing, keep the `alpha` pre-release marker in the npm version until the API stabilizes.
