# Project Record

This file is the source of truth for current status, architecture, validation, and next steps.
Update it on every meaningful change.

This repository is a greenfield npm package for Zcash bindings backed by Rust FFI.

Goal:

- publish a small but real JavaScript package on npm
- keep the implementation backed by upstream Zcash Rust crates
- start with narrow, reliable primitives and expand toward wallet sync and private payments

Current package identity:

- package name: `zcash-zip321-alpha`
- npm entrypoint: [index.js](/Users/semi/Vibecode/zlang/index.js)
- type definitions: [index.d.ts](/Users/semi/Vibecode/zlang/index.d.ts)
- native library: [src/lib.rs](/Users/semi/Vibecode/zlang/src/lib.rs)
- package manifest: [package.json](/Users/semi/Vibecode/zlang/package.json)

## What has been implemented

The JS package currently exposes three functions:

1. `parseZip321(uri)`
2. `parseAddress(address)`
3. `generateUnifiedAddress(input)`

### `parseZip321(uri)`

Implemented in JS:

- exported from [index.js](/Users/semi/Vibecode/zlang/index.js)
- typed in [index.d.ts](/Users/semi/Vibecode/zlang/index.d.ts)

Implemented in Rust:

- FFI symbol: `zcash_zip321_parse`
- uses the upstream `zip321` crate

Behavior:

- parses a `zcash:` ZIP-321 payment URI
- returns normalized JS data
- includes total zatoshis and per-payment metadata

Returned fields:

- `uri`
- `totalZatoshis`
- `payments[]`
- per payment:
  - `index`
  - `recipientAddress`
  - `amountZatoshis`
  - `memoBase64`
  - `label`
  - `message`
  - `otherParams`

### `parseAddress(address)`

Implemented in JS:

- exported from [index.js](/Users/semi/Vibecode/zlang/index.js)
- typed in [index.d.ts](/Users/semi/Vibecode/zlang/index.d.ts)

Implemented in Rust:

- FFI symbol: `zcash_address_parse`
- uses the upstream `zcash_address` crate

Behavior:

- validates a Zcash address
- classifies its network and type
- returns canonical normalized encoding

Returned fields:

- `address`
- `normalized`
- `network`
  - `mainnet`
  - `testnet`
  - `regtest`
- `kind`
  - `sprout`
  - `sapling`
  - `unified`
  - `p2pkh`
  - `p2sh`
  - `tex`
- `canReceiveMemo`

### `generateUnifiedAddress(input)`

Implemented in JS:

- exported from [index.js](/Users/semi/Vibecode/zlang/index.js)
- typed in [index.d.ts](/Users/semi/Vibecode/zlang/index.d.ts)

Implemented in Rust:

- FFI symbol: `zcash_unified_address_generate`
- uses upstream `zcash_keys`, `zip32`, and `zcash_protocol`

Behavior:

- derives a unified spending key from seed bytes
- derives the unified full viewing key for the requested account
- generates a default unified address for the requested network and receiver set

Input fields:

- `seedHex`
- `network`
  - `mainnet`
  - `testnet`
  - `regtest`
- `account`
- `receivers`
  - `all`
  - `shielded`
  - `orchard`

Returned fields:

- `network`
- `account`
- `address`
- `ufvk`
- `diversifierIndexHex`
- `receiverTypes`

Notes:

- `seedHex` must decode to at least 32 bytes
- regtest uses a local consensus config with all supported upgrades activated at height 1
- upstream receiver composition may vary; for example `receivers: "all"` does not guarantee a Sapling receiver in every generated address

## FFI design decisions

The current FFI boundary is intentionally simple:

- every exported Rust function returns a heap-allocated JSON string or null
- JS calls into Rust with `koffi`
- JS parses the JSON and normalizes key naming for consumers
- Rust exposes one shared error string getter:
  - `zcash_zip321_last_error`
- Rust exposes one free function:
  - `zcash_zip321_string_free`

Why this design:

- easier to expand than mapping large C structs immediately
- easier for JS consumers and AI agents to call correctly
- keeps the ABI stable while new operations are added

Current JS native loader:

- `createNativeBindings()` in [index.js](/Users/semi/Vibecode/zlang/index.js)
- bindings are cached per resolved library path
- library discovery checks:
  - explicit `libraryPath` and throws immediately if it does not exist
  - `ZCASH_ZIP321_LIB`
  - `target/release`
  - `target/debug`

## Current dependencies

Rust crates in [Cargo.toml](/Users/semi/Vibecode/zlang/Cargo.toml):

- `hex`
- `serde`
- `serde_json`
- `zip32`
- `zip321`
- `zcash_address`
- `zcash_keys`
- `zcash_protocol` with `local-consensus`

JS dependency in [package.json](/Users/semi/Vibecode/zlang/package.json):

- `koffi`

## Testing and validation status

JS tests exist in [test/index.test.js](/Users/semi/Vibecode/zlang/test/index.test.js).

What has been validated:

- `node --test` passes
- `cargo fmt --check` passes
- `cargo check` passes
- `cargo build --release` passes
- `npm install` succeeds and builds the native library
- end-to-end FFI execution from Node works for `parseAddress`, `parseZip321`, and `generateUnifiedAddress`
- automated native integration tests pass when native prereqs are present

Verified smoke tests:

- `parseAddress('t1PKtYdJJHhc3Pxowmznkg7vdTwnhEsCvR4')`
- `parseZip321('zcash:t1PKtYdJJHhc3Pxowmznkg7vdTwnhEsCvR4?amount=1.23&label=Coffee')`
- `generateUnifiedAddress({ seedHex: '00'.repeat(32), network: 'testnet', account: 0, receivers: 'all' })`

Current validation gap:

- automated end-to-end native integration tests only run when `koffi` is installed and the shared library has been built locally
- bare-source `node --test` still relies mostly on mocked native bindings unless native prereqs are present

## Package and publish state

Current publish posture:

- npm package scaffold exists
- package is marked alpha by version: `0.1.0-alpha.0`
- `prepublishOnly` runs tests and native build

Important current limitation:

- `npm install` triggers `cargo build --release`
- this means consumers currently need a Rust toolchain at install time

This is acceptable for alpha, but should be improved later with prebuilt binaries or a better install story.

## What was intentionally not implemented yet

Not in scope yet:

- wallet creation
- seed phrase generation
- ZIP-32 key derivation
- transparent/sapling/orchard balance queries
- sync against `lightwalletd`
- transaction proposal
- signing
- broadcasting
- SQLite-backed wallet state

The package is not yet a wallet SDK. It is a small native-backed utility package.

## Recommended next steps

Recommended build order:

1. Add key derivation or wallet initialization
2. Add a minimal sync flow against `lightwalletd`
3. Add transaction proposal and send
4. Improve packaging for npm consumers
5. Expand native integration tests

### 1. Add wallet initialization / key derivation

Possible feature slices:

- derive keys from seed
- expose UFVK derivation directly
- derive unified address for arbitrary account indices
- optionally support mnemonic-based initialization later

Keep the scope narrow and deterministic.

### 2. Add sync

When moving beyond pure parsing:

- prefer the `zcash-light-client-ffi` style of abstraction or reuse its model where possible
- local `regtest` plus `lightwalletd` is the best practical development target

### 3. Add send flow

Only after wallet state and sync exist:

- create transaction proposal
- build/sign
- submit

## Suggested architectural direction

Keep the same pattern for new exported functions:

- JS function calls native binding
- Rust returns JSON
- JS normalizes field names
- shared error channel remains consistent

This keeps the npm API ergonomic while avoiding a large handwritten ABI.

If the surface area grows a lot, consider:

- renaming the package to reflect a broader wallet SDK
- splitting the native bindings into multiple Rust modules
- using prebuilt binaries for npm consumers

Near-term packaging improvement:

- the current `npm install` builds Rust from source
- a better alpha-to-beta path is publishing prebuilt binaries per platform

## Files to inspect first

The highest-signal files are:

- [PROJECT.md](/Users/semi/Vibecode/zlang/PROJECT.md)
- [README.md](/Users/semi/Vibecode/zlang/README.md)
- [package.json](/Users/semi/Vibecode/zlang/package.json)
- [index.js](/Users/semi/Vibecode/zlang/index.js)
- [index.d.ts](/Users/semi/Vibecode/zlang/index.d.ts)
- [src/lib.rs](/Users/semi/Vibecode/zlang/src/lib.rs)
- [test/index.test.js](/Users/semi/Vibecode/zlang/test/index.test.js)

## Practical cautions

- The repo started empty; everything here is new scaffolding.
- There is no git repo initialized in this directory right now.
- The current package name still reflects the original first feature. If the scope broadens, rename the package.
- The error getter is still named `zcash_zip321_last_error`; if the library becomes more general, rename it to a package-wide native error symbol for clarity.
