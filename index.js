'use strict';

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

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

module.exports = {
  AddressParseError,
  UnifiedAddressError,
  ZcashError,
  Zip321Error,
  createNativeBindings,
  generateUnifiedAddress,
  parseAddress,
  parseZip321,
  resolveLibraryPath
};
