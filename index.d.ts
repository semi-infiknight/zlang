export interface GenerateUnifiedAddressInput {
  seedHex: string;
  network?: 'mainnet' | 'testnet' | 'regtest';
  account?: number;
  receivers?: 'all' | 'shielded' | 'orchard';
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
    lastError(): string | null;
  };
}

export declare class ZcashError extends Error {}

export declare const Zip321Error: typeof ZcashError;

export declare const AddressParseError: typeof ZcashError;

export declare const UnifiedAddressError: typeof ZcashError;

export declare function resolveLibraryPath(explicitPath?: string): string;

export declare function createNativeBindings(explicitPath?: string): {
  parse(uri: string): string | null;
  parseAddress(address: string): string | null;
  generateUnifiedAddress(inputJson: string): string | null;
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
