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

module.exports = {
  ScanPriority,
  ZcashSynchronizer
};
