'use strict';

const { serializeCompactBlock } = require('../lightwallet/LightWalletClient.js');

const ScanPriority = {
  Ignored: 0,
  Scanned: 1,
  Historic: 2,
  OpenAdjacent: 3,
  FoundNote: 4,
  ChainTip: 5,
  Verify: 6
};

class ZcashSynchronizer {
  constructor(wallet, client, options = {}) {
    this.wallet = wallet;
    this.client = client;
    this.batchSize = options.batchSize || 500;
  }

  async syncOnce() {
    const tip = await this.client.getLatestBlock();
    const tipHeight = Number(tip.height);
    this.wallet.updateChainTip(tipHeight);

    await this._syncSubtreeRoots();

    let ranges = this.wallet
      .suggestScanRanges()
      .filter(range => range.priority >= ScanPriority.Historic)
      .sort((a, b) => b.priority - a.priority);

    while (ranges.length > 0) {
      await this._processRange(ranges[0]);
      ranges = this.wallet
        .suggestScanRanges()
        .filter(range => range.priority >= ScanPriority.Historic)
        .sort((a, b) => b.priority - a.priority);
    }

    return { tipHeight };
  }

  async enhanceTransactions() {
    const requests = this.wallet.transactionDataRequests();

    for (const request of requests) {
      if ((request.request_type === 0 || request.request_type === 1) && request.txid_hex) {
        let raw;
        try {
          raw = await this.client.getTransaction(Buffer.from(request.txid_hex, 'hex'));
        } catch (error) {
          if (request.request_type === 0 && isMissingTransactionError(error)) {
            this.wallet.setTransactionStatus({
              txidHex: request.txid_hex,
              status: 'txid_not_recognized'
            });
            continue;
          }

          throw error;
        }
        if (request.request_type === 0) {
          this.wallet.setTransactionStatus({
            txidHex: request.txid_hex,
            ...transactionStatusFromRaw(raw)
          });
          continue;
        }

        if (raw?.data?.length > 0) {
          this.wallet.decryptAndStoreTransaction({
            txHex: Buffer.from(raw.data).toString('hex'),
            minedHeight: normalizeMinedHeight(raw.height)
          });
        }
        continue;
      }

      if (request.request_type === 2 && request.address && request.block_range_start != null) {
        const startHeight = request.block_range_start;
        const endExclusive = request.block_range_end ?? (startHeight + 1);
        const endInclusive = Math.max(startHeight, endExclusive - 1);

        for await (const raw of this.client.getTaddressTransactions(
          request.address,
          startHeight,
          endInclusive
        )) {
          if (raw?.data?.length > 0) {
            this.wallet.decryptAndStoreTransaction({
              txHex: Buffer.from(raw.data).toString('hex'),
              minedHeight: normalizeMinedHeight(raw.height)
            });
          }
        }

        const utxos = await this.client.getAddressUtxos([request.address], startHeight, 0);
        for (const utxo of utxos.addressUtxos || []) {
          this.wallet.putUtxo({
            txidHex: Buffer.from(utxo.txid).toString('hex'),
            index: utxo.index,
            scriptHex: Buffer.from(utxo.script).toString('hex'),
            value: Number(utxo.valueZat),
            height: Number(utxo.height)
          });
        }
      }
    }

    return { requestCount: requests.length };
  }

  async syncAndEnhance() {
    const sync = await this.syncOnce();
    const enhancement = await this.enhanceTransactions();

    return {
      tipHeight: sync.tipHeight,
      requestCount: enhancement.requestCount
    };
  }

  async _syncSubtreeRoots() {
    const saplingRoots = [];
    for await (const root of this.client.getSubtreeRoots(0, 0, 0)) {
      saplingRoots.push({
        rootHashHex: Buffer.from(root.rootHash).toString('hex'),
        completingBlockHeight: Number(root.completingBlockHeight)
      });
    }
    if (saplingRoots.length > 0) {
      this.wallet.putSaplingSubtreeRoots(0, saplingRoots);
    }

    const orchardRoots = [];
    for await (const root of this.client.getSubtreeRoots(1, 0, 0)) {
      orchardRoots.push({
        rootHashHex: Buffer.from(root.rootHash).toString('hex'),
        completingBlockHeight: Number(root.completingBlockHeight)
      });
    }
    if (orchardRoots.length > 0) {
      this.wallet.putOrchardSubtreeRoots(0, orchardRoots);
    }
  }

  async _processRange(range) {
    let cursor = range.start_height;

    while (cursor < range.end_height) {
      const end = Math.min(cursor + this.batchSize, range.end_height);
      const treeState = await this.client.getTreeState(cursor - 1);
      const blocksHex = [];

      for await (const block of this.client.getBlockRange(cursor, end - 1)) {
        blocksHex.push(serializeCompactBlock(block).toString('hex'));
      }

      if (blocksHex.length === 0) {
        return;
      }

      this.wallet.scanCachedBlocks({
        blocksHex,
        treeState: {
          network: treeState.network,
          height: Number(treeState.height),
          hash: treeState.hash,
          time: treeState.time,
          saplingTree: treeState.saplingTree,
          orchardTree: treeState.orchardTree
        },
        limit: blocksHex.length
      });

      cursor = end;
    }
  }
}

function normalizeMinedHeight(height) {
  const normalized = Number(height);
  if (!Number.isFinite(normalized) || normalized <= 0 || normalized >= Number.MAX_SAFE_INTEGER) {
    return undefined;
  }

  return normalized;
}

function transactionStatusFromRaw(raw) {
  const minedHeight = normalizeMinedHeight(raw?.height);
  if (minedHeight != null) {
    return { status: 'mined', minedHeight };
  }

  return { status: 'not_in_main_chain' };
}

function isMissingTransactionError(error) {
  return error && (
    error.code === 5 ||
    error.details === 'txid not recognized' ||
    /not found|not recognized/i.test(String(error.message || error.details || ''))
  );
}

module.exports = {
  ScanPriority,
  ZcashSynchronizer
};
