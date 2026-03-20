export interface GenerateUnifiedAddressInput {
  seedHex: string;
  network?: 'mainnet' | 'testnet' | 'regtest';
  account?: number;
  receivers?: 'all' | 'shielded' | 'orchard';
}

export interface DeriveUnifiedFullViewingKeyInput {
  seedHex: string;
  network?: 'mainnet' | 'testnet' | 'regtest';
  account?: number;
}

export interface TreeStateInput {
  network: string;
  height: number;
  hash: string;
  time: number;
  saplingTree: string;
  orchardTree: string;
}

export interface WalletAccount {
  account_uuid: string;
  name: string | null;
  birthday_height: number;
}

export interface ScanRange {
  start_height: number;
  end_height: number;
  priority: number;
}

export interface ScanSummary {
  start_height: number;
  end_height: number;
  spent_sapling_note_count: number;
  received_sapling_note_count: number;
  spent_orchard_note_count: number;
  received_orchard_note_count: number;
}

export interface Balance {
  spendable: number;
  change_pending_confirmation: number;
  value_pending_spendability: number;
}

export interface AccountBalance {
  account_uuid: string;
  sapling_balance: Balance;
  orchard_balance: Balance;
  unshielded_balance: Balance;
}

export interface WalletSummary {
  account_balances: AccountBalance[];
  chain_tip_height: number;
  fully_scanned_height: number;
}

export interface TransactionDataRequest {
  request_type: number;
  txid_hex: string | null;
  address: string | null;
  block_range_start: number | null;
  block_range_end: number | null;
}

export interface TransactionOverview {
  txid_hex: string;
  mined_height: number | null;
  block_time: number | null;
  account_balance_delta: number;
  fee: number | null;
  memo_count: number;
  account_uuid: string;
  is_shielding: boolean;
  expired_unmined: boolean;
}

export interface TransactionOutput {
  pool: 'transparent' | 'sapling' | 'orchard' | 'unknown';
  output_index: number;
  memo_hex: string | null;
  address: string | null;
  value: number;
  is_change: boolean;
}

export interface CreatedTransaction {
  txid_hex: string;
  raw_tx_hex: string;
}

export interface CreatedTransactions {
  txids: string[];
  transactions: CreatedTransaction[];
}

export interface SentTransactions {
  txids: string[];
  results: Array<{
    txidHex: string;
    rawTxHex: string;
    response: { errorCode: number; errorMessage: string };
  }>;
}

export interface ProposalChange {
  value: number;
  pool: 'transparent' | 'sapling' | 'orchard';
  memo_base64: string | null;
  is_ephemeral: boolean;
}

export interface TransferProposalStep {
  transaction_request_uri: string;
  payment_count: number;
  transparent_input_count: number;
  shielded_input_count: number;
  prior_step_input_count: number;
  fee_required: number;
  change_outputs: ProposalChange[];
  is_shielding: boolean;
}

export interface TransferProposal {
  fee_rule: 'zip317';
  min_target_height: number;
  proposal_hex: string;
  steps: TransferProposalStep[];
}

export interface GeneratedUnifiedAddress {
  network: 'mainnet' | 'testnet' | 'regtest';
  account: number;
  address: string;
  ufvk: string;
  diversifierIndexHex: string;
  receiverTypes: string[];
}

export interface ParsedAddress {
  address: string;
  normalized: string;
  network: 'mainnet' | 'testnet' | 'regtest';
  kind: 'sprout' | 'sapling' | 'unified' | 'p2pkh' | 'p2sh' | 'tex';
  canReceiveMemo: boolean;
}

export interface Zip321Payment {
  index: number;
  recipientAddress: string;
  amountZatoshis: number;
  memoBase64: string | null;
  label: string | null;
  message: string | null;
  otherParams: Record<string, string>;
}

export interface Zip321Request {
  uri: string;
  totalZatoshis: number;
  payments: Zip321Payment[];
}

export interface ParseZip321Options {
  libraryPath?: string;
  native?: {
    parse(uri: string): string | null;
    parseAddress(address: string): string | null;
    generateUnifiedAddress(inputJson: string): string | null;
    seedFingerprint(seedHex: string): string | null;
    deriveUnifiedFullViewingKey(inputJson: string): string | null;
    walletInitDatabase(inputJson: string): string | null;
    walletCreateAccount(inputJson: string): string | null;
    walletListAccounts(inputJson: string): string | null;
    walletGetCurrentAddress(inputJson: string): string | null;
    walletGetNextAvailableAddress(inputJson: string): string | null;
    walletGetSaplingAddress(inputJson: string): string | null;
    walletGetOrchardAddress(inputJson: string): string | null;
    walletGetTransparentAddress(inputJson: string): string | null;
    walletUpdateChainTip(inputJson: string): string | null;
    walletSuggestScanRanges(inputJson: string): string | null;
    walletScanCachedBlocks(inputJson: string): string | null;
    walletPutSaplingSubtreeRoots(inputJson: string): string | null;
    walletPutOrchardSubtreeRoots(inputJson: string): string | null;
    walletGetSummary(inputJson: string): string | null;
    walletLatestHeight(inputJson: string): string | null;
    walletTransactionDataRequests(inputJson: string): string | null;
    walletGetAllTransparentAddresses(inputJson: string): string | null;
    walletPutUtxo(inputJson: string): string | null;
    walletProposeTransfer(inputJson: string): string | null;
    walletDecryptAndStoreTransaction(inputJson: string): string | null;
    walletSetTransactionStatus(inputJson: string): string | null;
    walletGetTransactions(inputJson: string): string | null;
    walletGetTransactionOutputs(inputJson: string): string | null;
    walletCreateProposedTransactions(inputJson: string): string | null;
    lastError(): string | null;
  };
}

export declare class ZcashError extends Error {}

export declare const Zip321Error: typeof ZcashError;

export declare const AddressParseError: typeof ZcashError;

export declare const UnifiedAddressError: typeof ZcashError;

export declare const KeyDerivationError: typeof ZcashError;

export declare const WalletError: typeof ZcashError;

export declare const ScanPriority: {
  Ignored: 0;
  Scanned: 1;
  Historic: 2;
  OpenAdjacent: 3;
  FoundNote: 4;
  ChainTip: 5;
  Verify: 6;
};

export declare function resolveLibraryPath(explicitPath?: string): string;

export declare function createNativeBindings(explicitPath?: string): {
  parse(uri: string): string | null;
  parseAddress(address: string): string | null;
  generateUnifiedAddress(inputJson: string): string | null;
  seedFingerprint(seedHex: string): string | null;
  deriveUnifiedFullViewingKey(inputJson: string): string | null;
  walletInitDatabase(inputJson: string): string | null;
  walletCreateAccount(inputJson: string): string | null;
  walletListAccounts(inputJson: string): string | null;
  walletGetCurrentAddress(inputJson: string): string | null;
  walletGetNextAvailableAddress(inputJson: string): string | null;
  walletGetSaplingAddress(inputJson: string): string | null;
  walletGetOrchardAddress(inputJson: string): string | null;
  walletGetTransparentAddress(inputJson: string): string | null;
  walletUpdateChainTip(inputJson: string): string | null;
  walletSuggestScanRanges(inputJson: string): string | null;
  walletScanCachedBlocks(inputJson: string): string | null;
  walletPutSaplingSubtreeRoots(inputJson: string): string | null;
  walletPutOrchardSubtreeRoots(inputJson: string): string | null;
  walletGetSummary(inputJson: string): string | null;
  walletLatestHeight(inputJson: string): string | null;
  walletTransactionDataRequests(inputJson: string): string | null;
  walletGetAllTransparentAddresses(inputJson: string): string | null;
  walletPutUtxo(inputJson: string): string | null;
  walletProposeTransfer(inputJson: string): string | null;
  walletDecryptAndStoreTransaction(inputJson: string): string | null;
  walletSetTransactionStatus(inputJson: string): string | null;
  walletGetTransactions(inputJson: string): string | null;
  walletGetTransactionOutputs(inputJson: string): string | null;
  walletCreateProposedTransactions(inputJson: string): string | null;
  lastError(): string | null;
};

export declare function parseZip321(
  uri: string,
  options?: ParseZip321Options
): Zip321Request;

export declare function parseAddress(
  address: string,
  options?: ParseZip321Options
): ParsedAddress;

export declare function generateUnifiedAddress(
  input: GenerateUnifiedAddressInput,
  options?: ParseZip321Options
): GeneratedUnifiedAddress;

export declare function seedFingerprint(
  seedHex: string,
  options?: ParseZip321Options
): string;

export declare function deriveUnifiedFullViewingKey(
  input: DeriveUnifiedFullViewingKeyInput,
  options?: ParseZip321Options
): string;

export declare class ZcashWallet {
  constructor(
    config: { dbPath: string; network?: 'mainnet' | 'testnet' | 'regtest' },
    options?: ParseZip321Options
  );

  readonly dbPath: string;
  readonly network: string;

  initDatabase(options?: { seedHex?: string }): 'ok' | 'seed_required' | 'seed_not_relevant';
  createAccount(input: {
    seedHex: string;
    accountName: string;
    treeState: TreeStateInput;
    recoverUntilHeight?: number;
  }): string;
  listAccounts(): WalletAccount[];
  getCurrentAddress(accountUuid: string): string;
  getNextAvailableAddress(accountUuid: string): string;
  getSaplingAddress(accountUuid: string): string;
  getOrchardAddress(accountUuid: string): string;
  getTransparentAddress(accountUuid: string): string;
  updateChainTip(tipHeight: number): void;
  suggestScanRanges(): ScanRange[];
  scanCachedBlocks(input: {
    blocksHex: string[];
    treeState: TreeStateInput;
    limit: number;
  }): ScanSummary;
  putSaplingSubtreeRoots(
    startIndex: number,
    roots: Array<{ rootHashHex: string; completingBlockHeight: number }>
  ): void;
  putOrchardSubtreeRoots(
    startIndex: number,
    roots: Array<{ rootHashHex: string; completingBlockHeight: number }>
  ): void;
  getWalletSummary(): WalletSummary | null;
  latestHeight(): number | null;
  transactionDataRequests(): TransactionDataRequest[];
  getAllTransparentAddresses(): string[];
  putUtxo(input: {
    txidHex: string;
    index: number;
    scriptHex: string;
    value: number;
    height: number;
  }): void;
  proposeTransfer(input: {
    accountUuid: string;
    toAddress: string;
    value: number;
    memo?: string;
    changeMemo?: string;
    fallbackChangePool?: 'orchard' | 'sapling';
  }): TransferProposal;
  decryptAndStoreTransaction(input: {
    txHex: string;
    minedHeight?: number;
  }): { status: 'ok' };
  setTransactionStatus(input: {
    txidHex: string;
    status: 'txid_not_recognized' | 'not_in_main_chain' | 'mined';
    minedHeight?: number;
  }): { status: 'ok' };
  getTransactions(
    accountUuid: string,
    options?: { offset?: number; limit?: number }
  ): TransactionOverview[];
  getTransactionOutputs(txidHex: string): TransactionOutput[];
  createProposedTransactions(input: {
    accountUuid: string;
    proposalHex: string;
    seedHex: string;
    ovkPolicy?: 'sender' | 'discard';
    spendParamPath?: string;
    outputParamPath?: string;
  }): CreatedTransactions;
  sendProposedTransactions(input: {
    accountUuid: string;
    proposalHex: string;
    seedHex: string;
    client: LightWalletClient;
    ovkPolicy?: 'sender' | 'discard';
    spendParamPath?: string;
    outputParamPath?: string;
    height?: number;
  }): Promise<SentTransactions>;
  sendTransfer(input: {
    accountUuid: string;
    toAddress: string;
    value: number;
    memo?: string;
    changeMemo?: string;
    fallbackChangePool?: 'orchard' | 'sapling';
    seedHex: string;
    client: LightWalletClient;
    ovkPolicy?: 'sender' | 'discard';
    spendParamPath?: string;
    outputParamPath?: string;
    height?: number;
  }): Promise<{
    proposal: TransferProposal;
    txids: string[];
    results: SentTransactions['results'];
  }>;
}

export declare class LightWalletClient {
  constructor(host: string, tls?: boolean);
  close(): void;
  getLatestBlock(): Promise<{ height: string; hash: Buffer }>;
  getBlock(height: number): Promise<Record<string, unknown>>;
  getTransaction(txid: Buffer): Promise<{ data: Buffer; height: string }>;
  sendTransaction(data: Buffer, height?: number): Promise<{
    errorCode: number;
    errorMessage: string;
  }>;
  getTreeState(height: number): Promise<{
    network: string;
    height: string;
    hash: string;
    time: number;
    saplingTree: string;
    orchardTree: string;
  }>;
  getLatestTreeState(): Promise<{
    network: string;
    height: string;
    hash: string;
    time: number;
    saplingTree: string;
    orchardTree: string;
  }>;
  getLightdInfo(): Promise<Record<string, unknown>>;
  getTaddressBalance(addresses: string[]): Promise<{ valueZat: string }>;
  getAddressUtxos(
    addresses: string[],
    startHeight: number,
    maxEntries?: number
  ): Promise<{ addressUtxos: Array<Record<string, unknown>> }>;
  getBlockRange(startHeight: number, endHeight: number): AsyncGenerator<Record<string, unknown>>;
  getSubtreeRoots(protocol: 0 | 1, startIndex?: number, maxEntries?: number): AsyncGenerator<{
    rootHash: Buffer;
    completingBlockHash: Buffer;
    completingBlockHeight: string;
  }>;
  getTaddressTransactions(
    address: string,
    startHeight: number,
    endHeight: number
  ): AsyncGenerator<{ data: Buffer; height: string }>;
  getAddressUtxosStream(
    addresses: string[],
    startHeight: number,
    maxEntries?: number
  ): AsyncGenerator<Record<string, unknown>>;
  getMempoolTx(excludeTxidSuffixes?: Buffer[]): AsyncGenerator<Record<string, unknown>>;
  getMempoolStream(): AsyncGenerator<{ data: Buffer; height: string }>;
}

export declare class ZcashSynchronizer {
  constructor(wallet: ZcashWallet, client: LightWalletClient, options?: { batchSize?: number });
  syncOnce(): Promise<{ tipHeight: number }>;
  enhanceTransactions(): Promise<{ requestCount: number }>;
  syncAndEnhance(): Promise<{ tipHeight: number; requestCount: number }>;
}
