'use strict';

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const protobuf = require('protobufjs');
const path = require('node:path');

const PROTO_DIR = path.join(__dirname, 'proto');
const SERVICE_PROTO_PATH = path.join(PROTO_DIR, 'service.proto');
const COMPACT_PROTO_PATH = path.join(PROTO_DIR, 'compact_formats.proto');

const packageDefinition = protoLoader.loadSync(SERVICE_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const rpc = protoDescriptor.cash.z.wallet.sdk.rpc;

const compactRoot = protobuf.loadSync(COMPACT_PROTO_PATH);
const CompactBlockProto = compactRoot.lookupType('cash.z.wallet.sdk.rpc.CompactBlock');

function serializeCompactBlock(block) {
  const message = CompactBlockProto.fromObject(block);
  return Buffer.from(CompactBlockProto.encode(message).finish());
}

class LightWalletClient {
  constructor(host, tls = true) {
    const credentials = tls
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    this.client = new rpc.CompactTxStreamer(host, credentials);
  }

  close() {
    this.client.close();
  }

  getLatestBlock() {
    return this._unary('GetLatestBlock', {});
  }

  getBlock(height) {
    return this._unary('GetBlock', { height });
  }

  getTransaction(txid) {
    return this._unary('GetTransaction', { hash: txid });
  }

  sendTransaction(data, height = 0) {
    return this._unary('SendTransaction', { data, height });
  }

  getTreeState(height) {
    return this._unary('GetTreeState', { height });
  }

  getLatestTreeState() {
    return this._unary('GetLatestTreeState', {});
  }

  getLightdInfo() {
    return this._unary('GetLightdInfo', {});
  }

  getTaddressBalance(addresses) {
    return this._unary('GetTaddressBalance', { addresses });
  }

  getAddressUtxos(addresses, startHeight, maxEntries = 0) {
    return this._unary('GetAddressUtxos', {
      addresses,
      startHeight,
      maxEntries
    });
  }

  async *getBlockRange(startHeight, endHeight) {
    yield* this._serverStream('GetBlockRange', {
      start: { height: startHeight },
      end: { height: endHeight }
    });
  }

  async *getSubtreeRoots(protocol, startIndex = 0, maxEntries = 0) {
    yield* this._serverStream('GetSubtreeRoots', {
      startIndex,
      shieldedProtocol: protocol,
      maxEntries
    });
  }

  async *getTaddressTransactions(address, startHeight, endHeight) {
    yield* this._serverStream('GetTaddressTransactions', {
      address,
      range: {
        start: { height: startHeight },
        end: { height: endHeight }
      }
    });
  }

  async *getAddressUtxosStream(addresses, startHeight, maxEntries = 0) {
    yield* this._serverStream('GetAddressUtxosStream', {
      addresses,
      startHeight,
      maxEntries
    });
  }

  async *getMempoolTx(excludeTxidSuffixes = []) {
    yield* this._serverStream('GetMempoolTx', {
      exclude_txid_suffixes: excludeTxidSuffixes
    });
  }

  async *getMempoolStream() {
    yield* this._serverStream('GetMempoolStream', {});
  }

  _unary(method, request) {
    return new Promise((resolve, reject) => {
      this.client[method](request, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }

  async *_serverStream(method, request) {
    const stream = this.client[method](request);
    const buffer = [];
    let error = null;
    let done = false;
    let waiting = null;

    stream.on('data', message => {
      buffer.push(message);
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve();
      }
    });

    stream.on('error', err => {
      error = err;
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve();
      }
    });

    stream.on('end', () => {
      done = true;
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve();
      }
    });

    while (true) {
      if (buffer.length > 0) {
        yield buffer.shift();
        continue;
      }
      if (error) throw error;
      if (done) return;
      await new Promise(resolve => {
        waiting = resolve;
      });
    }
  }
}

module.exports = {
  LightWalletClient,
  serializeCompactBlock
};
