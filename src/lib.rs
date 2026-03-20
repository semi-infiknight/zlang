use std::cell::RefCell;
use std::collections::BTreeMap;
use std::error::Error as _;
use std::ffi::{c_char, CStr, CString};
use std::path::Path;
use std::ptr;

use prost::Message;
use rand::rngs::OsRng;
use secrecy::Secret;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zcash_address::{ConversionError, TryFromAddress, ZcashAddress};
use zcash_client_backend::wallet::OvkPolicy;
use zcash_client_backend::{
    data_api::{
        chain::{scan_cached_blocks, CommitmentTreeRoot},
        scanning::ScanPriority,
        wallet::{
            create_proposed_transactions, decrypt_and_store_transaction,
            propose_standard_transfer_to_address, ConfirmationsPolicy, SpendingKeys,
        },
        Account as _, AccountBirthday, AccountSource, BirthdayError, TransactionDataRequest,
        TransactionStatus, WalletCommitmentTrees, WalletRead, WalletWrite,
    },
    encoding::AddressCodec,
    fees::StandardFeeRule,
    proto::{compact_formats::CompactBlock as ProtoCompactBlock, service::TreeState},
    wallet::WalletTransparentOutput,
};
use zcash_client_sqlite::{
    util::SystemClock,
    wallet::init::{init_wallet_db, WalletMigrationError},
    AccountUuid, WalletDb,
};
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedSpendingKey};
use zcash_primitives::transaction::Transaction;
use zcash_proofs::prover::LocalTxProver;
use zcash_protocol::{
    consensus::{BlockHeight, BranchId, Network, NetworkType, Parameters},
    local_consensus::LocalNetwork,
    memo::MemoBytes,
    value::Zatoshis,
    PoolType, ShieldedProtocol, TxId,
};
use zcash_transparent::{
    address::Script,
    bundle::{OutPoint, TxOut},
};
use zip32::fingerprint::SeedFingerprint;
use zip32::AccountId;
use zip321::{memo_to_base64, TransactionRequest};

thread_local! {
    static LAST_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

#[derive(Serialize)]
struct PaymentJson {
    index: usize,
    recipient_address: String,
    amount_zatoshis: u64,
    memo_base64: Option<String>,
    label: Option<String>,
    message: Option<String>,
    other_params: BTreeMap<String, String>,
}

#[derive(Serialize)]
struct RequestJson {
    uri: String,
    total_zatoshis: u64,
    payments: Vec<PaymentJson>,
}

#[derive(Serialize)]
struct ParsedAddressJson {
    address: String,
    normalized: String,
    network: String,
    kind: String,
    can_receive_memo: bool,
}

#[derive(Serialize)]
struct GeneratedUnifiedAddressJson {
    network: String,
    account: u32,
    address: String,
    ufvk: String,
    diversifier_index_hex: String,
    receiver_types: Vec<String>,
}

#[derive(Deserialize)]
struct GenerateUnifiedAddressInput {
    seed_hex: String,
    #[serde(default = "default_network")]
    network: String,
    #[serde(default)]
    account: u32,
    #[serde(default = "default_receivers")]
    receivers: String,
}

#[derive(Deserialize)]
struct DeriveUnifiedFullViewingKeyInput {
    seed_hex: String,
    #[serde(default = "default_network")]
    network: String,
    #[serde(default)]
    account: u32,
}

#[derive(Deserialize)]
struct WalletInitInput {
    db_path: String,
    network: String,
    seed_hex: Option<String>,
}

#[derive(Serialize)]
struct WalletInitOutput {
    status: String,
}

#[derive(Deserialize)]
struct TreeStateInput {
    network: String,
    height: u64,
    hash: String,
    time: u32,
    sapling_tree: String,
    orchard_tree: String,
}

#[derive(Deserialize)]
struct WalletCreateAccountInput {
    db_path: String,
    network: String,
    seed_hex: String,
    account_name: String,
    treestate: TreeStateInput,
    recover_until_height: Option<u32>,
}

#[derive(Serialize)]
struct WalletAccountOutput {
    account_uuid: String,
}

#[derive(Deserialize)]
struct WalletListAccountsInput {
    db_path: String,
    network: String,
}

#[derive(Serialize)]
struct WalletAccountInfo {
    account_uuid: String,
    name: Option<String>,
    birthday_height: u32,
}

#[derive(Deserialize)]
struct WalletAddressInput {
    db_path: String,
    network: String,
    account_uuid: String,
}

#[derive(Deserialize)]
struct WalletUpdateChainTipInput {
    db_path: String,
    network: String,
    tip_height: u32,
}

#[derive(Serialize)]
struct ScanRangeJson {
    start_height: u32,
    end_height: u32,
    priority: u32,
}

#[derive(Deserialize)]
struct WalletScanCachedBlocksInput {
    db_path: String,
    network: String,
    blocks_hex: Vec<String>,
    treestate: TreeStateInput,
    limit: usize,
}

#[derive(Serialize)]
struct ScanSummaryJson {
    start_height: u32,
    end_height: u32,
    spent_sapling_note_count: u64,
    received_sapling_note_count: u64,
    spent_orchard_note_count: u64,
    received_orchard_note_count: u64,
}

#[derive(Deserialize)]
struct SubtreeRootInput {
    root_hash_hex: String,
    completing_block_height: u32,
}

#[derive(Deserialize)]
struct WalletSubtreeRootsInput {
    db_path: String,
    network: String,
    start_index: u64,
    roots: Vec<SubtreeRootInput>,
}

#[derive(Serialize)]
struct StatusOnlyOutput {
    status: &'static str,
}

#[derive(Serialize)]
struct BalanceJson {
    spendable: i64,
    change_pending_confirmation: i64,
    value_pending_spendability: i64,
}

#[derive(Serialize)]
struct AccountBalanceJson {
    account_uuid: String,
    sapling_balance: BalanceJson,
    orchard_balance: BalanceJson,
    unshielded_balance: BalanceJson,
}

#[derive(Serialize)]
struct WalletSummaryJson {
    account_balances: Vec<AccountBalanceJson>,
    chain_tip_height: i64,
    fully_scanned_height: i64,
}

#[derive(Serialize)]
struct TransactionDataRequestJson {
    request_type: u32,
    txid_hex: Option<String>,
    address: Option<String>,
    block_range_start: Option<u32>,
    block_range_end: Option<u32>,
}

#[derive(Deserialize)]
struct WalletPutUtxoInput {
    db_path: String,
    network: String,
    txid_hex: String,
    index: u32,
    script_hex: String,
    value: i64,
    height: u32,
}

#[derive(Deserialize)]
struct WalletProposeTransferInput {
    db_path: String,
    network: String,
    account_uuid: String,
    to_address: String,
    value: i64,
    memo: Option<String>,
    change_memo: Option<String>,
    fallback_change_pool: Option<String>,
}

#[derive(Serialize)]
struct ProposalChangeJson {
    value: i64,
    pool: String,
    memo_base64: Option<String>,
    is_ephemeral: bool,
}

#[derive(Serialize)]
struct ProposalStepJson {
    transaction_request_uri: String,
    payment_count: usize,
    transparent_input_count: usize,
    shielded_input_count: usize,
    prior_step_input_count: usize,
    fee_required: i64,
    change_outputs: Vec<ProposalChangeJson>,
    is_shielding: bool,
}

#[derive(Serialize)]
struct ProposalJson {
    fee_rule: &'static str,
    min_target_height: u32,
    proposal_hex: String,
    steps: Vec<ProposalStepJson>,
}

#[derive(Deserialize)]
struct WalletDecryptAndStoreTransactionInput {
    db_path: String,
    network: String,
    tx_hex: String,
    mined_height: Option<u32>,
}

#[derive(Deserialize)]
struct WalletSetTransactionStatusInput {
    db_path: String,
    network: String,
    txid_hex: String,
    status: String,
    mined_height: Option<u32>,
}

#[derive(Deserialize)]
struct WalletGetTransactionsInput {
    db_path: String,
    network: String,
    account_uuid: String,
    offset: Option<u32>,
    limit: Option<u32>,
}

#[derive(Serialize)]
struct TransactionOverviewJson {
    txid_hex: String,
    mined_height: Option<i64>,
    block_time: Option<i64>,
    account_balance_delta: i64,
    fee: Option<i64>,
    memo_count: i64,
    account_uuid: String,
    is_shielding: bool,
    expired_unmined: bool,
}

#[derive(Deserialize)]
struct WalletGetTransactionOutputsInput {
    db_path: String,
    network: String,
    txid_hex: String,
}

#[derive(Serialize)]
struct TransactionOutputJson {
    pool: String,
    output_index: i64,
    memo_hex: Option<String>,
    address: Option<String>,
    value: i64,
    is_change: bool,
}

#[derive(Deserialize)]
struct WalletCreateProposedTransactionsInput {
    db_path: String,
    network: String,
    account_uuid: String,
    proposal_hex: String,
    seed_hex: String,
    ovk_policy: Option<String>,
    spend_param_path: Option<String>,
    output_param_path: Option<String>,
}

#[derive(Serialize)]
struct CreatedTransactionJson {
    txid_hex: String,
    raw_tx_hex: String,
}

#[derive(Serialize)]
struct CreatedTransactionsJson {
    txids: Vec<String>,
    transactions: Vec<CreatedTransactionJson>,
}

struct ParsedAddress(ParsedAddressJson);

struct MemoryBlockSource {
    blocks: Vec<ProtoCompactBlock>,
}

impl zcash_client_backend::data_api::chain::BlockSource for MemoryBlockSource {
    type Error = std::convert::Infallible;

    fn with_blocks<F, WalletErrT>(
        &self,
        from_height: Option<BlockHeight>,
        limit: Option<usize>,
        mut with_block: F,
    ) -> Result<(), zcash_client_backend::data_api::chain::error::Error<WalletErrT, Self::Error>>
    where
        F: FnMut(
            ProtoCompactBlock,
        ) -> Result<
            (),
            zcash_client_backend::data_api::chain::error::Error<WalletErrT, Self::Error>,
        >,
    {
        let start = from_height.map(u32::from).unwrap_or(0) as u64;
        let iter = self
            .blocks
            .iter()
            .filter(move |block| block.height >= start);
        let blocks: Vec<_> = match limit {
            Some(value) => iter.take(value).collect(),
            None => iter.collect(),
        };

        for block in blocks {
            with_block(block.clone())?;
        }

        Ok(())
    }
}

impl TryFromAddress for ParsedAddress {
    type Error = &'static str;

    fn try_from_sprout(
        net: NetworkType,
        _data: [u8; 64],
    ) -> Result<Self, ConversionError<Self::Error>> {
        Ok(Self(ParsedAddressJson {
            address: String::new(),
            normalized: String::new(),
            network: network_name(net).to_string(),
            kind: "sprout".to_string(),
            can_receive_memo: true,
        }))
    }

    fn try_from_sapling(
        net: NetworkType,
        _data: [u8; 43],
    ) -> Result<Self, ConversionError<Self::Error>> {
        Ok(Self(ParsedAddressJson {
            address: String::new(),
            normalized: String::new(),
            network: network_name(net).to_string(),
            kind: "sapling".to_string(),
            can_receive_memo: true,
        }))
    }

    fn try_from_unified(
        net: NetworkType,
        _data: zcash_address::unified::Address,
    ) -> Result<Self, ConversionError<Self::Error>> {
        Ok(Self(ParsedAddressJson {
            address: String::new(),
            normalized: String::new(),
            network: network_name(net).to_string(),
            kind: "unified".to_string(),
            can_receive_memo: true,
        }))
    }

    fn try_from_transparent_p2pkh(
        net: NetworkType,
        _data: [u8; 20],
    ) -> Result<Self, ConversionError<Self::Error>> {
        Ok(Self(ParsedAddressJson {
            address: String::new(),
            normalized: String::new(),
            network: network_name(net).to_string(),
            kind: "p2pkh".to_string(),
            can_receive_memo: false,
        }))
    }

    fn try_from_transparent_p2sh(
        net: NetworkType,
        _data: [u8; 20],
    ) -> Result<Self, ConversionError<Self::Error>> {
        Ok(Self(ParsedAddressJson {
            address: String::new(),
            normalized: String::new(),
            network: network_name(net).to_string(),
            kind: "p2sh".to_string(),
            can_receive_memo: false,
        }))
    }

    fn try_from_tex(
        net: NetworkType,
        _data: [u8; 20],
    ) -> Result<Self, ConversionError<Self::Error>> {
        Ok(Self(ParsedAddressJson {
            address: String::new(),
            normalized: String::new(),
            network: network_name(net).to_string(),
            kind: "tex".to_string(),
            can_receive_memo: false,
        }))
    }
}

fn set_last_error(message: String) {
    LAST_ERROR.with(|slot| {
        *slot.borrow_mut() = Some(message);
    });
}

fn clear_last_error() {
    LAST_ERROR.with(|slot| {
        *slot.borrow_mut() = None;
    });
}

fn default_network() -> String {
    "mainnet".to_string()
}

fn default_receivers() -> String {
    "all".to_string()
}

fn into_c_string(value: String) -> *mut c_char {
    match CString::new(value) {
        Ok(s) => s.into_raw(),
        Err(_) => {
            set_last_error("native response contained an interior NUL byte".to_string());
            ptr::null_mut()
        }
    }
}

fn network_name(network: NetworkType) -> &'static str {
    match network {
        NetworkType::Main => "mainnet",
        NetworkType::Test => "testnet",
        NetworkType::Regtest => "regtest",
    }
}

fn receiver_request(value: &str) -> Result<UnifiedAddressRequest, String> {
    match value {
        "all" => Ok(UnifiedAddressRequest::ALLOW_ALL),
        "shielded" => Ok(UnifiedAddressRequest::SHIELDED),
        "orchard" => Ok(UnifiedAddressRequest::ORCHARD),
        _ => Err(format!(
            "unsupported receiver set: {value}; expected one of: all, shielded, orchard"
        )),
    }
}

fn reject_null_bytes(value: &str, param_name: &str) -> Result<(), String> {
    if value.contains('\0') {
        Err(format!("Invalid {param_name}: string contains null bytes"))
    } else {
        Ok(())
    }
}

fn parse_wallet_network(value: &str) -> Result<Network, String> {
    match value {
        "mainnet" => Ok(Network::MainNetwork),
        "testnet" => Ok(Network::TestNetwork),
        "regtest" => Err("wallet database operations do not yet support regtest".to_string()),
        _ => Err(format!(
            "unsupported network: {value}; expected one of: mainnet, testnet"
        )),
    }
}

fn open_wallet_db(
    db_path: &str,
    network: Network,
) -> Result<WalletDb<rusqlite::Connection, Network, SystemClock, OsRng>, String> {
    WalletDb::for_path(Path::new(db_path), network, SystemClock, OsRng)
        .map_err(|err| format!("Error opening wallet database: {err}"))
}

fn parse_account_uuid(value: &str) -> Result<AccountUuid, String> {
    reject_null_bytes(value, "account_uuid")?;
    let uuid = Uuid::parse_str(value).map_err(|err| format!("invalid account_uuid: {err}"))?;
    Ok(AccountUuid::from_uuid(uuid))
}

fn priority_code(priority: ScanPriority) -> u32 {
    match priority {
        ScanPriority::Ignored => 0,
        ScanPriority::Scanned => 1,
        ScanPriority::Historic => 2,
        ScanPriority::OpenAdjacent => 3,
        ScanPriority::FoundNote => 4,
        ScanPriority::ChainTip => 5,
        ScanPriority::Verify => 6,
    }
}

fn balance_to_json(balance: &zcash_client_backend::data_api::Balance) -> BalanceJson {
    use zcash_protocol::value::ZatBalance;

    BalanceJson {
        spendable: i64::from(ZatBalance::from(balance.spendable_value())),
        change_pending_confirmation: i64::from(ZatBalance::from(
            balance.change_pending_confirmation(),
        )),
        value_pending_spendability: i64::from(ZatBalance::from(
            balance.value_pending_spendability(),
        )),
    }
}

fn pool_name(pool: PoolType) -> &'static str {
    match pool {
        PoolType::Transparent => "transparent",
        PoolType::Shielded(ShieldedProtocol::Sapling) => "sapling",
        PoolType::Shielded(ShieldedProtocol::Orchard) => "orchard",
    }
}

fn parse_optional_memo(
    value: Option<String>,
    field_name: &str,
) -> Result<Option<MemoBytes>, String> {
    match value {
        Some(value) => {
            reject_null_bytes(&value, field_name)?;
            MemoBytes::from_bytes(value.as_bytes())
                .map(Some)
                .map_err(|err| format!("invalid {field_name}: {err}"))
        }
        None => Ok(None),
    }
}

fn parse_change_pool(value: Option<String>) -> Result<ShieldedProtocol, String> {
    match value.as_deref().unwrap_or("orchard") {
        "orchard" => Ok(ShieldedProtocol::Orchard),
        "sapling" => Ok(ShieldedProtocol::Sapling),
        other => Err(format!(
            "unsupported fallback_change_pool: {other}; expected one of: orchard, sapling"
        )),
    }
}

fn parse_transaction_status(
    status: &str,
    mined_height: Option<u32>,
) -> Result<TransactionStatus, String> {
    match status {
        "txid_not_recognized" => Ok(TransactionStatus::TxidNotRecognized),
        "not_in_main_chain" => Ok(TransactionStatus::NotInMainChain),
        "mined" => mined_height
            .map(BlockHeight::from_u32)
            .map(TransactionStatus::Mined)
            .ok_or_else(|| "mined_height is required when status is 'mined'".to_string()),
        other => Err(format!(
            "unsupported status: {other}; expected one of: txid_not_recognized, not_in_main_chain, mined"
        )),
    }
}

fn output_pool_name(code: i64) -> &'static str {
    match code {
        0 => "transparent",
        2 => "sapling",
        3 => "orchard",
        _ => "unknown",
    }
}

fn parse_ovk_policy(value: Option<String>) -> Result<OvkPolicy, String> {
    match value.as_deref().unwrap_or("sender") {
        "sender" => Ok(OvkPolicy::Sender),
        "discard" => Ok(OvkPolicy::Discard),
        other => Err(format!(
            "unsupported ovk_policy: {other}; expected one of: sender, discard"
        )),
    }
}

fn make_local_tx_prover(
    spend_param_path: Option<String>,
    output_param_path: Option<String>,
) -> Result<LocalTxProver, String> {
    match (spend_param_path, output_param_path) {
        (Some(spend), Some(output)) => {
            reject_null_bytes(&spend, "spend_param_path")?;
            reject_null_bytes(&output, "output_param_path")?;
            Ok(LocalTxProver::new(Path::new(&spend), Path::new(&output)))
        }
        (None, None) => LocalTxProver::with_default_location().ok_or_else(|| {
            "Sapling proving parameters were not found in the default location; set spend_param_path and output_param_path or install parameters with zcash-fetch-params".to_string()
        }),
        _ => Err(
            "spend_param_path and output_param_path must either both be provided or both omitted"
                .to_string(),
        ),
    }
}

fn parse_input(input: *const c_char, label: &str) -> Result<String, String> {
    if input.is_null() {
        return Err(format!("{label} pointer was null"));
    }

    let value = unsafe { CStr::from_ptr(input) };
    value
        .to_str()
        .map(|value| value.to_string())
        .map_err(|err| format!("{label} was not valid UTF-8: {err}"))
}

fn parse_uri(uri: &str) -> Result<String, String> {
    let request = TransactionRequest::from_uri(uri).map_err(|err| err.to_string())?;
    let total_zatoshis = request.total().map_err(|err| err.to_string())?.into_u64();

    let payments = request
        .payments()
        .iter()
        .map(|(index, payment)| {
            let other_params = payment
                .other_params()
                .iter()
                .cloned()
                .collect::<BTreeMap<String, String>>();

            PaymentJson {
                index: *index,
                recipient_address: payment.recipient_address().encode(),
                amount_zatoshis: payment.amount().into_u64(),
                memo_base64: payment.memo().map(memo_to_base64),
                label: payment.label().cloned(),
                message: payment.message().cloned(),
                other_params,
            }
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&RequestJson {
        uri: uri.to_string(),
        total_zatoshis,
        payments,
    })
    .map_err(|err| err.to_string())
}

fn parse_address(address: &str) -> Result<String, String> {
    let parsed = ZcashAddress::try_from_encoded(address).map_err(|err| err.to_string())?;
    let normalized = parsed.encode();
    let can_receive_memo = parsed.can_receive_memo();
    let parsed_address = parsed
        .convert::<ParsedAddress>()
        .map_err(|err| err.to_string())?;

    serde_json::to_string(&ParsedAddressJson {
        address: address.to_string(),
        normalized,
        network: parsed_address.0.network,
        kind: parsed_address.0.kind,
        can_receive_memo,
    })
    .map_err(|err| err.to_string())
}

fn regtest_network() -> LocalNetwork {
    LocalNetwork {
        overwinter: Some(BlockHeight::from_u32(1)),
        sapling: Some(BlockHeight::from_u32(1)),
        blossom: Some(BlockHeight::from_u32(1)),
        heartwood: Some(BlockHeight::from_u32(1)),
        canopy: Some(BlockHeight::from_u32(1)),
        nu5: Some(BlockHeight::from_u32(1)),
        nu6: Some(BlockHeight::from_u32(1)),
        nu6_1: Some(BlockHeight::from_u32(1)),
    }
}

fn generate_unified_address_with<P: Parameters>(
    params: &P,
    input: &GenerateUnifiedAddressInput,
) -> Result<String, String> {
    let seed =
        hex::decode(&input.seed_hex).map_err(|err| format!("seed_hex was not valid hex: {err}"))?;
    if seed.len() < 32 {
        return Err("seed_hex must decode to at least 32 bytes".to_string());
    }

    let account = AccountId::try_from(input.account)
        .map_err(|_| "account must be in the range 0..2^31".to_string())?;
    let request = receiver_request(&input.receivers)?;
    let usk =
        UnifiedSpendingKey::from_seed(params, &seed, account).map_err(|err| err.to_string())?;
    let ufvk = usk.to_unified_full_viewing_key();
    let (address, diversifier_index) = ufvk
        .default_address(request)
        .map_err(|err| err.to_string())?;

    serde_json::to_string(&GeneratedUnifiedAddressJson {
        network: network_name(params.network_type()).to_string(),
        account: input.account,
        address: address.encode(params),
        ufvk: ufvk.encode(params),
        diversifier_index_hex: hex::encode(diversifier_index.as_bytes()),
        receiver_types: address
            .receiver_types()
            .into_iter()
            .map(|typecode| format!("{typecode:?}").to_lowercase())
            .collect(),
    })
    .map_err(|err| err.to_string())
}

fn derive_unified_full_viewing_key_with<P: Parameters>(
    params: &P,
    input: &DeriveUnifiedFullViewingKeyInput,
) -> Result<String, String> {
    let seed =
        hex::decode(&input.seed_hex).map_err(|err| format!("seed_hex was not valid hex: {err}"))?;
    if seed.len() < 32 {
        return Err("seed_hex must decode to at least 32 bytes".to_string());
    }

    let account = AccountId::try_from(input.account)
        .map_err(|_| "account must be in the range 0..2^31".to_string())?;
    let usk =
        UnifiedSpendingKey::from_seed(params, &seed, account).map_err(|err| err.to_string())?;

    Ok(usk.to_unified_full_viewing_key().encode(params))
}

fn generate_unified_address(input_json: &str) -> Result<String, String> {
    let input: GenerateUnifiedAddressInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;

    match input.network.as_str() {
        "mainnet" => generate_unified_address_with(&Network::MainNetwork, &input),
        "testnet" => generate_unified_address_with(&Network::TestNetwork, &input),
        "regtest" => {
            let params = regtest_network();
            generate_unified_address_with(&params, &input)
        }
        value => Err(format!(
            "unsupported network: {value}; expected one of: mainnet, testnet, regtest"
        )),
    }
}

fn derive_unified_full_viewing_key(input_json: &str) -> Result<String, String> {
    let input: DeriveUnifiedFullViewingKeyInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;

    match input.network.as_str() {
        "mainnet" => derive_unified_full_viewing_key_with(&Network::MainNetwork, &input),
        "testnet" => derive_unified_full_viewing_key_with(&Network::TestNetwork, &input),
        "regtest" => {
            let params = regtest_network();
            derive_unified_full_viewing_key_with(&params, &input)
        }
        value => Err(format!(
            "unsupported network: {value}; expected one of: mainnet, testnet, regtest"
        )),
    }
}

fn seed_fingerprint(seed_hex: &str) -> Result<String, String> {
    let seed = hex::decode(seed_hex).map_err(|err| format!("seed_hex was not valid hex: {err}"))?;
    let fingerprint = SeedFingerprint::from_seed(&seed)
        .ok_or_else(|| "seed_hex must decode to 32..252 bytes".to_string())?;

    Ok(fingerprint.to_string())
}

fn wallet_init_database(input_json: &str) -> Result<String, String> {
    let input: WalletInitInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    if let Some(seed_hex) = &input.seed_hex {
        reject_null_bytes(seed_hex, "seed_hex")?;
    }

    let network = parse_wallet_network(&input.network)?;
    let mut db = open_wallet_db(&input.db_path, network)?;
    let seed = match input.seed_hex {
        Some(seed_hex) => {
            Some(Secret::new(hex::decode(seed_hex).map_err(|err| {
                format!("seed_hex was not valid hex: {err}")
            })?))
        }
        None => None,
    };

    let status = match init_wallet_db(&mut db, seed) {
        Ok(_) => "ok".to_string(),
        Err(err) => match err
            .source()
            .and_then(|source| source.downcast_ref::<WalletMigrationError>())
        {
            Some(WalletMigrationError::SeedRequired) => "seed_required".to_string(),
            Some(WalletMigrationError::SeedNotRelevant) => "seed_not_relevant".to_string(),
            _ => return Err(format!("Error initializing wallet database: {err}")),
        },
    };

    serde_json::to_string(&WalletInitOutput { status }).map_err(|err| err.to_string())
}

fn wallet_create_account(input_json: &str) -> Result<String, String> {
    let input: WalletCreateAccountInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    reject_null_bytes(&input.account_name, "account_name")?;
    reject_null_bytes(&input.seed_hex, "seed_hex")?;

    let network = parse_wallet_network(&input.network)?;
    let seed = Secret::new(
        hex::decode(&input.seed_hex).map_err(|err| format!("seed_hex was not valid hex: {err}"))?,
    );

    let treestate = TreeState {
        network: input.treestate.network,
        height: input.treestate.height,
        hash: input.treestate.hash,
        time: input.treestate.time,
        sapling_tree: input.treestate.sapling_tree,
        orchard_tree: input.treestate.orchard_tree,
    };

    let recover_until = input.recover_until_height.map(BlockHeight::from_u32);
    let birthday =
        AccountBirthday::from_treestate(treestate, recover_until).map_err(|err| match err {
            BirthdayError::HeightInvalid(inner) => format!("Invalid TreeState height: {inner}"),
            BirthdayError::Decode(inner) => format!("Invalid TreeState encoding: {inner}"),
        })?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    let (account_uuid, _) = db
        .create_account(&input.account_name, &seed, &birthday, None)
        .map_err(|err| format!("Error creating account: {err}"))?;

    serde_json::to_string(&WalletAccountOutput {
        account_uuid: account_uuid.expose_uuid().to_string(),
    })
    .map_err(|err| err.to_string())
}

fn wallet_list_accounts(input_json: &str) -> Result<String, String> {
    let input: WalletListAccountsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let mut accounts = vec![];

    for id in db
        .get_account_ids()
        .map_err(|err| format!("Error listing accounts: {err}"))?
    {
        let account = db
            .get_account(id)
            .map_err(|err| format!("Error getting account: {err}"))?
            .ok_or_else(|| format!("Account {} disappeared during lookup", id.expose_uuid()))?;
        let birthday_height = db
            .get_account_birthday(account.id())
            .map_err(|err| format!("Error getting account birthday: {err}"))?;

        accounts.push(WalletAccountInfo {
            account_uuid: account.id().expose_uuid().to_string(),
            name: account.name().map(|value| value.to_string()),
            birthday_height: u32::from(birthday_height),
        });
    }

    serde_json::to_string(&accounts).map_err(|err| err.to_string())
}

fn wallet_get_current_address(input_json: &str) -> Result<String, String> {
    let input: WalletAddressInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let db = open_wallet_db(&input.db_path, network)?;

    match db
        .get_last_generated_address_matching(account_uuid, UnifiedAddressRequest::AllAvailableKeys)
    {
        Ok(Some(address)) => Ok(address.encode(&network)),
        Ok(None) => Err(format!(
            "No address available for account {}",
            account_uuid.expose_uuid()
        )),
        Err(err) => Err(format!("Error fetching address: {err}")),
    }
}

fn wallet_get_next_available_address(input_json: &str) -> Result<String, String> {
    let input: WalletAddressInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let mut db = open_wallet_db(&input.db_path, network)?;

    match db.get_next_available_address(account_uuid, UnifiedAddressRequest::AllAvailableKeys) {
        Ok(Some((address, _))) => Ok(address.encode(&network)),
        Ok(None) => Err(format!(
            "No address available for account {}",
            account_uuid.expose_uuid()
        )),
        Err(err) => Err(format!("Error generating address: {err}")),
    }
}

fn wallet_get_sapling_address(input_json: &str) -> Result<String, String> {
    let input: WalletAddressInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let address = db
        .get_last_generated_address_matching(account_uuid, UnifiedAddressRequest::AllAvailableKeys)
        .map_err(|err| format!("Error fetching address: {err}"))?;

    address
        .and_then(|ua| ua.sapling().map(|value| value.encode(&network)))
        .ok_or_else(|| {
            format!(
                "No sapling receiver available for account {}",
                account_uuid.expose_uuid()
            )
        })
}

fn wallet_get_orchard_address(input_json: &str) -> Result<String, String> {
    use zcash_address::unified::{self, Encoding as _};

    let input: WalletAddressInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let address = db
        .get_last_generated_address_matching(account_uuid, UnifiedAddressRequest::AllAvailableKeys)
        .map_err(|err| format!("Error fetching address: {err}"))?;

    let orchard = address
        .and_then(|ua| ua.orchard().cloned())
        .ok_or_else(|| {
            format!(
                "No orchard receiver available for account {}",
                account_uuid.expose_uuid()
            )
        })?;

    let receiver = unified::Receiver::Orchard(orchard.to_raw_address_bytes());
    let orchard_only = unified::Address::try_from_items(vec![receiver])
        .map_err(|err| format!("Error creating Orchard UA: {err}"))?;
    Ok(orchard_only.encode(&network.network_type()))
}

fn wallet_get_transparent_address(input_json: &str) -> Result<String, String> {
    let input: WalletAddressInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let address = db
        .get_last_generated_address_matching(account_uuid, UnifiedAddressRequest::AllAvailableKeys)
        .map_err(|err| format!("Error fetching address: {err}"))?;

    address
        .and_then(|ua| ua.transparent().map(|value| value.encode(&network)))
        .ok_or_else(|| {
            format!(
                "No transparent receiver available for account {}",
                account_uuid.expose_uuid()
            )
        })
}

fn wallet_update_chain_tip(input_json: &str) -> Result<String, String> {
    let input: WalletUpdateChainTipInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let mut db = open_wallet_db(&input.db_path, network)?;
    db.update_chain_tip(BlockHeight::from_u32(input.tip_height))
        .map_err(|err| format!("Error updating chain tip: {err}"))?;

    serde_json::to_string(&StatusOnlyOutput { status: "ok" }).map_err(|err| err.to_string())
}

fn wallet_suggest_scan_ranges(input_json: &str) -> Result<String, String> {
    let input: WalletListAccountsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let ranges = db
        .suggest_scan_ranges()
        .map_err(|err| format!("Error getting scan ranges: {err}"))?
        .into_iter()
        .map(|range| ScanRangeJson {
            start_height: u32::from(range.block_range().start),
            end_height: u32::from(range.block_range().end),
            priority: priority_code(range.priority()),
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&ranges).map_err(|err| err.to_string())
}

fn wallet_scan_cached_blocks(input_json: &str) -> Result<String, String> {
    let input: WalletScanCachedBlocksInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let mut blocks = Vec::with_capacity(input.blocks_hex.len());
    for (index, encoded) in input.blocks_hex.iter().enumerate() {
        let bytes = hex::decode(encoded)
            .map_err(|err| format!("block {index} hex decode failed: {err}"))?;
        let block = prost::Message::decode(bytes.as_slice())
            .map_err(|err| format!("block {index} protobuf decode failed: {err}"))?;
        blocks.push(block);
    }
    blocks.sort_by_key(|block: &ProtoCompactBlock| block.height);
    let block_source = MemoryBlockSource { blocks };

    let treestate = TreeState {
        network: input.treestate.network,
        height: input.treestate.height,
        hash: input.treestate.hash,
        time: input.treestate.time,
        sapling_tree: input.treestate.sapling_tree,
        orchard_tree: input.treestate.orchard_tree,
    };
    let chain_state = treestate
        .to_chain_state()
        .map_err(|err| format!("Error parsing TreeState into ChainState: {err}"))?;
    let from_height = chain_state.block_height() + 1;

    let mut db = open_wallet_db(&input.db_path, network)?;
    let summary = scan_cached_blocks(
        &network,
        &block_source,
        &mut db,
        from_height,
        &chain_state,
        input.limit,
    )
    .map_err(|err| format!("Error scanning blocks: {err}"))?;

    serde_json::to_string(&ScanSummaryJson {
        start_height: u32::from(summary.scanned_range().start),
        end_height: u32::from(summary.scanned_range().end),
        spent_sapling_note_count: summary.spent_sapling_note_count() as u64,
        received_sapling_note_count: summary.received_sapling_note_count() as u64,
        spent_orchard_note_count: summary.spent_orchard_note_count() as u64,
        received_orchard_note_count: summary.received_orchard_note_count() as u64,
    })
    .map_err(|err| err.to_string())
}

fn wallet_put_sapling_subtree_roots(input_json: &str) -> Result<String, String> {
    let input: WalletSubtreeRootsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let roots = input
        .roots
        .into_iter()
        .map(|root| {
            let hash_bytes = hex::decode(root.root_hash_hex)
                .map_err(|err| format!("sapling root hex decode failed: {err}"))?;
            let hash_bytes: [u8; 32] = hash_bytes
                .try_into()
                .map_err(|_| "Sapling root hash must be 32 bytes".to_string())?;
            let node = Option::from(sapling::Node::from_bytes(hash_bytes))
                .ok_or_else(|| "Invalid Sapling root hash encoding".to_string())?;
            Ok(CommitmentTreeRoot::from_parts(
                BlockHeight::from_u32(root.completing_block_height),
                node,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    db.put_sapling_subtree_roots(input.start_index, &roots)
        .map_err(|err| format!("Error storing Sapling subtree roots: {err}"))?;

    serde_json::to_string(&StatusOnlyOutput { status: "ok" }).map_err(|err| err.to_string())
}

fn wallet_put_orchard_subtree_roots(input_json: &str) -> Result<String, String> {
    let input: WalletSubtreeRootsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let roots = input
        .roots
        .into_iter()
        .map(|root| {
            let hash_bytes = hex::decode(root.root_hash_hex)
                .map_err(|err| format!("orchard root hex decode failed: {err}"))?;
            let hash_bytes: [u8; 32] = hash_bytes
                .try_into()
                .map_err(|_| "Orchard root hash must be 32 bytes".to_string())?;
            let node = Option::from(orchard::tree::MerkleHashOrchard::from_bytes(&hash_bytes))
                .ok_or_else(|| "Invalid Orchard root hash encoding".to_string())?;
            Ok(CommitmentTreeRoot::from_parts(
                BlockHeight::from_u32(root.completing_block_height),
                node,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    db.put_orchard_subtree_roots(input.start_index, &roots)
        .map_err(|err| format!("Error storing Orchard subtree roots: {err}"))?;

    serde_json::to_string(&StatusOnlyOutput { status: "ok" }).map_err(|err| err.to_string())
}

fn wallet_get_summary(input_json: &str) -> Result<String, String> {
    let input: WalletListAccountsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let summary = db
        .get_wallet_summary(ConfirmationsPolicy::default())
        .map_err(|err| format!("Error getting wallet summary: {err}"))?;

    let payload = match summary {
        None => None,
        Some(summary) => Some(WalletSummaryJson {
            account_balances: summary
                .account_balances()
                .iter()
                .map(|(uuid, balance)| AccountBalanceJson {
                    account_uuid: uuid.expose_uuid().to_string(),
                    sapling_balance: balance_to_json(balance.sapling_balance()),
                    orchard_balance: balance_to_json(balance.orchard_balance()),
                    unshielded_balance: balance_to_json(balance.unshielded_balance()),
                })
                .collect(),
            chain_tip_height: i64::from(u32::from(summary.chain_tip_height())),
            fully_scanned_height: i64::from(u32::from(summary.fully_scanned_height())),
        }),
    };

    serde_json::to_string(&payload).map_err(|err| err.to_string())
}

fn wallet_latest_height(input_json: &str) -> Result<String, String> {
    let input: WalletListAccountsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let height = db
        .chain_height()
        .map_err(|err| format!("Error getting chain height: {err}"))?;

    serde_json::to_string(&height.map(|value| i64::from(u32::from(value))))
        .map_err(|err| err.to_string())
}

fn wallet_transaction_data_requests(input_json: &str) -> Result<String, String> {
    let input: WalletListAccountsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let requests = db
        .transaction_data_requests()
        .map_err(|err| format!("Error getting transaction data requests: {err}"))?
        .into_iter()
        .map(|request| match request {
            TransactionDataRequest::GetStatus(txid) => TransactionDataRequestJson {
                request_type: 0,
                txid_hex: Some(hex::encode(txid.as_ref())),
                address: None,
                block_range_start: None,
                block_range_end: None,
            },
            TransactionDataRequest::Enhancement(txid) => TransactionDataRequestJson {
                request_type: 1,
                txid_hex: Some(hex::encode(txid.as_ref())),
                address: None,
                block_range_start: None,
                block_range_end: None,
            },
            TransactionDataRequest::TransactionsInvolvingAddress(request) => {
                TransactionDataRequestJson {
                    request_type: 2,
                    txid_hex: None,
                    address: Some(request.address().encode(&network)),
                    block_range_start: Some(u32::from(request.block_range_start())),
                    block_range_end: request.block_range_end().map(u32::from),
                }
            }
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&requests).map_err(|err| err.to_string())
}

fn wallet_get_all_transparent_addresses(input_json: &str) -> Result<String, String> {
    let input: WalletListAccountsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let db = open_wallet_db(&input.db_path, network)?;
    let mut addresses = Vec::new();

    for account_id in db
        .get_account_ids()
        .map_err(|err| format!("Error listing accounts: {err}"))?
    {
        let receivers = db
            .get_transparent_receivers(account_id, true, false)
            .map_err(|err| format!("Error listing transparent receivers: {err}"))?;
        addresses.extend(receivers.keys().map(|address| address.encode(&network)));
    }

    serde_json::to_string(&addresses).map_err(|err| err.to_string())
}

fn wallet_put_utxo(input_json: &str) -> Result<String, String> {
    let input: WalletPutUtxoInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    reject_null_bytes(&input.txid_hex, "txid_hex")?;
    reject_null_bytes(&input.script_hex, "script_hex")?;

    let network = parse_wallet_network(&input.network)?;
    let txid_bytes =
        hex::decode(&input.txid_hex).map_err(|err| format!("txid_hex was not valid hex: {err}"))?;
    let txid_bytes: [u8; 32] = txid_bytes
        .try_into()
        .map_err(|_| "txid_hex must decode to 32 bytes".to_string())?;
    let script_bytes = hex::decode(&input.script_hex)
        .map_err(|err| format!("script_hex was not valid hex: {err}"))?;
    let script_pubkey = Script(zcash_script::script::Code(script_bytes));

    let output = WalletTransparentOutput::from_parts(
        OutPoint::new(txid_bytes, input.index),
        TxOut::new(
            Zatoshis::from_nonnegative_i64(input.value)
                .map_err(|_| "Invalid UTXO value".to_string())?,
            script_pubkey,
        ),
        Some(BlockHeight::from_u32(input.height)),
    )
    .ok_or_else(|| "Script is not a valid P2PKH or P2SH scriptPubKey".to_string())?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    db.put_received_transparent_utxo(&output)
        .map_err(|err| format!("Error storing UTXO: {err}"))?;

    serde_json::to_string(&StatusOnlyOutput { status: "ok" }).map_err(|err| err.to_string())
}

fn wallet_propose_transfer(input_json: &str) -> Result<String, String> {
    let input: WalletProposeTransferInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    reject_null_bytes(&input.account_uuid, "account_uuid")?;
    reject_null_bytes(&input.to_address, "to_address")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let recipient = ZcashAddress::try_from_encoded(&input.to_address)
        .map_err(|err| format!("invalid to_address: {err}"))?
        .convert::<zcash_keys::address::Address>()
        .map_err(|err| format!("unsupported to_address: {err}"))?;
    let amount =
        Zatoshis::from_nonnegative_i64(input.value).map_err(|_| "invalid value".to_string())?;
    let memo = parse_optional_memo(input.memo, "memo")?;
    let change_memo = parse_optional_memo(input.change_memo, "change_memo")?;
    let fallback_change_pool = parse_change_pool(input.fallback_change_pool)?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    let proposal = propose_standard_transfer_to_address::<_, _, std::convert::Infallible>(
        &mut db,
        &network,
        StandardFeeRule::Zip317,
        account_uuid,
        ConfirmationsPolicy::default(),
        &recipient,
        amount,
        memo,
        change_memo,
        fallback_change_pool,
    )
    .map_err(|err| format!("Error creating transfer proposal: {err}"))?;

    let proposal_bytes =
        zcash_client_backend::proto::proposal::Proposal::from_standard_proposal(&proposal)
            .encode_to_vec();
    let steps = proposal
        .steps()
        .iter()
        .map(|step| ProposalStepJson {
            transaction_request_uri: step.transaction_request().to_uri(),
            payment_count: step.transaction_request().payments().len(),
            transparent_input_count: step.transparent_inputs().len(),
            shielded_input_count: step
                .shielded_inputs()
                .map(|inputs| inputs.notes().len())
                .unwrap_or(0),
            prior_step_input_count: step.prior_step_inputs().len(),
            fee_required: i64::from(zcash_protocol::value::ZatBalance::from(
                step.balance().fee_required(),
            )),
            change_outputs: step
                .balance()
                .proposed_change()
                .iter()
                .map(|change| ProposalChangeJson {
                    value: i64::from(zcash_protocol::value::ZatBalance::from(change.value())),
                    pool: pool_name(change.output_pool()).to_string(),
                    memo_base64: change.memo().map(memo_to_base64),
                    is_ephemeral: change.is_ephemeral(),
                })
                .collect(),
            is_shielding: step.is_shielding(),
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&ProposalJson {
        fee_rule: "zip317",
        min_target_height: u32::from(proposal.min_target_height()),
        proposal_hex: hex::encode(proposal_bytes),
        steps,
    })
    .map_err(|err| err.to_string())
}

fn wallet_decrypt_and_store_transaction(input_json: &str) -> Result<String, String> {
    let input: WalletDecryptAndStoreTransactionInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    reject_null_bytes(&input.tx_hex, "tx_hex")?;

    let network = parse_wallet_network(&input.network)?;
    let tx_bytes =
        hex::decode(&input.tx_hex).map_err(|err| format!("tx_hex was not valid hex: {err}"))?;
    let parse_height = BlockHeight::from_u32(input.mined_height.unwrap_or(1));
    let branch_id = BranchId::for_height(&network, parse_height);
    let tx = Transaction::read(std::io::Cursor::new(tx_bytes), branch_id)
        .map_err(|err| format!("transaction decode failed: {err}"))?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    decrypt_and_store_transaction(
        &network,
        &mut db,
        &tx,
        input.mined_height.map(BlockHeight::from_u32),
    )
    .map_err(|err| format!("Error storing decrypted transaction: {err}"))?;

    serde_json::to_string(&StatusOnlyOutput { status: "ok" }).map_err(|err| err.to_string())
}

fn wallet_set_transaction_status(input_json: &str) -> Result<String, String> {
    let input: WalletSetTransactionStatusInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    reject_null_bytes(&input.txid_hex, "txid_hex")?;

    let network = parse_wallet_network(&input.network)?;
    let txid_bytes =
        hex::decode(&input.txid_hex).map_err(|err| format!("txid_hex was not valid hex: {err}"))?;
    let txid_bytes: [u8; 32] = txid_bytes
        .try_into()
        .map_err(|_| "txid_hex must decode to 32 bytes".to_string())?;
    let status = parse_transaction_status(&input.status, input.mined_height)?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    db.set_transaction_status(TxId::from_bytes(txid_bytes), status)
        .map_err(|err| format!("Error setting transaction status: {err}"))?;

    serde_json::to_string(&StatusOnlyOutput { status: "ok" }).map_err(|err| err.to_string())
}

fn wallet_get_transactions(input_json: &str) -> Result<String, String> {
    let input: WalletGetTransactionsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let offset = i64::from(input.offset.unwrap_or(0));
    let limit = i64::from(input.limit.unwrap_or(50));
    let uuid_bytes = account_uuid.expose_uuid().as_bytes().to_vec();
    let _db = open_wallet_db(&input.db_path, network)?;
    let conn = rusqlite::Connection::open(&input.db_path)
        .map_err(|err| format!("Error opening wallet database: {err}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT txid, mined_height, block_time, account_balance_delta,
                    fee_paid, memo_count, is_shielding, expired_unmined, account_uuid
             FROM v_transactions
             WHERE account_uuid = ?1
             ORDER BY mined_height IS NOT NULL, mined_height DESC, txid
             LIMIT ?2 OFFSET ?3",
        )
        .map_err(|err| format!("Error preparing transaction query: {err}"))?;

    let rows = stmt
        .query_map(rusqlite::params![uuid_bytes, limit, offset], |row| {
            let txid: Vec<u8> = row.get(0)?;
            let mined_height: Option<i64> = row.get(1)?;
            let block_time: Option<i64> = row.get(2)?;
            let account_balance_delta: i64 = row.get(3)?;
            let fee: Option<i64> = row.get(4)?;
            let memo_count: i64 = row.get(5)?;
            let is_shielding: bool = row.get(6)?;
            let expired_unmined: bool = row.get(7)?;
            let account_uuid: Vec<u8> = row.get(8)?;

            Ok(TransactionOverviewJson {
                txid_hex: hex::encode(txid),
                mined_height,
                block_time,
                account_balance_delta,
                fee,
                memo_count,
                account_uuid: Uuid::from_slice(&account_uuid)
                    .map(|uuid| uuid.to_string())
                    .unwrap_or_else(|_| hex::encode(account_uuid)),
                is_shielding,
                expired_unmined,
            })
        })
        .map_err(|err| format!("Error querying transactions: {err}"))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|err| format!("Error reading transaction row: {err}"))?);
    }

    serde_json::to_string(&results).map_err(|err| err.to_string())
}

fn wallet_get_transaction_outputs(input_json: &str) -> Result<String, String> {
    let input: WalletGetTransactionOutputsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    reject_null_bytes(&input.txid_hex, "txid_hex")?;

    let network = parse_wallet_network(&input.network)?;
    let txid_bytes =
        hex::decode(&input.txid_hex).map_err(|err| format!("txid_hex was not valid hex: {err}"))?;
    let txid_bytes: [u8; 32] = txid_bytes
        .try_into()
        .map_err(|_| "txid_hex must decode to 32 bytes".to_string())?;
    let _db = open_wallet_db(&input.db_path, network)?;
    let conn = rusqlite::Connection::open(&input.db_path)
        .map_err(|err| format!("Error opening wallet database: {err}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT output_pool, output_index, memo, to_address, value, is_change
             FROM v_tx_outputs
             WHERE txid = ?1
             ORDER BY output_pool, output_index",
        )
        .map_err(|err| format!("Error preparing transaction output query: {err}"))?;

    let rows = stmt
        .query_map(rusqlite::params![&txid_bytes[..]], |row| {
            let output_pool: i64 = row.get(0)?;
            let output_index: i64 = row.get(1)?;
            let memo_bytes: Option<Vec<u8>> = row.get(2)?;
            let address: Option<String> = row.get(3)?;
            let value: i64 = row.get(4)?;
            let is_change: bool = row.get(5)?;

            let memo_hex = memo_bytes.and_then(|bytes| {
                if bytes.is_empty()
                    || (bytes[0] == 0xF6 && bytes[1..].iter().all(|&byte| byte == 0))
                {
                    None
                } else {
                    Some(hex::encode(bytes))
                }
            });

            Ok(TransactionOutputJson {
                pool: output_pool_name(output_pool).to_string(),
                output_index,
                memo_hex,
                address,
                value,
                is_change,
            })
        })
        .map_err(|err| format!("Error querying transaction outputs: {err}"))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|err| format!("Error reading transaction output row: {err}"))?);
    }

    serde_json::to_string(&results).map_err(|err| err.to_string())
}

fn wallet_create_proposed_transactions(input_json: &str) -> Result<String, String> {
    let input: WalletCreateProposedTransactionsInput =
        serde_json::from_str(input_json).map_err(|err| format!("invalid JSON input: {err}"))?;
    reject_null_bytes(&input.db_path, "db_path")?;
    reject_null_bytes(&input.account_uuid, "account_uuid")?;
    reject_null_bytes(&input.proposal_hex, "proposal_hex")?;
    reject_null_bytes(&input.seed_hex, "seed_hex")?;

    let network = parse_wallet_network(&input.network)?;
    let account_uuid = parse_account_uuid(&input.account_uuid)?;
    let proposal_bytes = hex::decode(&input.proposal_hex)
        .map_err(|err| format!("proposal_hex was not valid hex: {err}"))?;
    let proposal_proto =
        zcash_client_backend::proto::proposal::Proposal::decode(proposal_bytes.as_slice())
            .map_err(|err| format!("proposal_hex was not valid proposal protobuf: {err}"))?;
    let seed =
        hex::decode(&input.seed_hex).map_err(|err| format!("seed_hex was not valid hex: {err}"))?;
    if seed.len() < 32 {
        return Err("seed_hex must decode to at least 32 bytes".to_string());
    }
    let ovk_policy = parse_ovk_policy(input.ovk_policy)?;

    let mut db = open_wallet_db(&input.db_path, network)?;
    let account = db
        .get_account(account_uuid)
        .map_err(|err| format!("Error getting account: {err}"))?
        .ok_or_else(|| format!("Account {} not found", account_uuid.expose_uuid()))?;
    let account_index = match account.source() {
        AccountSource::Derived { derivation, .. } => derivation.account_index(),
        AccountSource::Imported { purpose, .. } => match purpose {
            zcash_client_backend::data_api::AccountPurpose::Spending {
                derivation: Some(derivation),
            } => derivation.account_index(),
            _ => {
                return Err(
                    "account does not expose ZIP-32 derivation metadata required for spending"
                        .to_string(),
                )
            }
        },
    };
    let usk = UnifiedSpendingKey::from_seed(&network, &seed, account_index)
        .map_err(|err| format!("Error deriving unified spending key: {err}"))?;
    let spending_keys = SpendingKeys::from_unified_spending_key(usk);
    let proposal = proposal_proto
        .try_into_standard_proposal(&db)
        .map_err(|err| format!("Error decoding transfer proposal: {err}"))?;
    let prover = make_local_tx_prover(input.spend_param_path, input.output_param_path)?;
    let txids = create_proposed_transactions::<
        _,
        _,
        std::convert::Infallible,
        _,
        std::convert::Infallible,
        _,
    >(
        &mut db,
        &network,
        &prover,
        &prover,
        &spending_keys,
        ovk_policy,
        &proposal,
    )
    .map_err(|err| format!("Error creating proposed transactions: {err}"))?;

    let mut txid_strings = Vec::new();
    let mut transactions = Vec::new();
    for txid in txids {
        let tx = db
            .get_transaction(txid)
            .map_err(|err| format!("Error fetching created transaction: {err}"))?
            .ok_or_else(|| format!("Created transaction {} not found in wallet DB", txid))?;
        let mut raw_tx = Vec::new();
        tx.write(&mut raw_tx)
            .map_err(|err| format!("Error serializing created transaction: {err}"))?;
        let txid_hex = txid.to_string();
        txid_strings.push(txid_hex.clone());
        transactions.push(CreatedTransactionJson {
            txid_hex,
            raw_tx_hex: hex::encode(raw_tx),
        });
    }

    serde_json::to_string(&CreatedTransactionsJson {
        txids: txid_strings,
        transactions,
    })
    .map_err(|err| err.to_string())
}

#[no_mangle]
pub extern "C" fn zcash_zip321_parse(uri: *const c_char) -> *mut c_char {
    clear_last_error();

    let uri = match parse_input(uri, "uri") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match parse_uri(&uri) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_address_parse(address: *const c_char) -> *mut c_char {
    clear_last_error();

    let address = match parse_input(address, "address") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match parse_address(&address) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_unified_address_generate(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match generate_unified_address(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_seed_fingerprint(seed_hex: *const c_char) -> *mut c_char {
    clear_last_error();

    let seed_hex = match parse_input(seed_hex, "seed_hex") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match seed_fingerprint(&seed_hex) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_unified_full_viewing_key_derive(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match derive_unified_full_viewing_key(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_init_database(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_init_database(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_create_account(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_create_account(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_list_accounts(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_list_accounts(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_current_address(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_current_address(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_next_available_address(
    input_json: *const c_char,
) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_next_available_address(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_sapling_address(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_sapling_address(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_orchard_address(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_orchard_address(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_transparent_address(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_transparent_address(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_update_chain_tip(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_update_chain_tip(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_suggest_scan_ranges(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_suggest_scan_ranges(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_scan_cached_blocks(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_scan_cached_blocks(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_put_sapling_subtree_roots(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_put_sapling_subtree_roots(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_put_orchard_subtree_roots(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_put_orchard_subtree_roots(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_summary(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_summary(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_latest_height(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_latest_height(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_transaction_data_requests(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_transaction_data_requests(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_all_transparent_addresses(
    input_json: *const c_char,
) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_all_transparent_addresses(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_put_utxo(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_put_utxo(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_propose_transfer(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_propose_transfer(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_decrypt_and_store_transaction(
    input_json: *const c_char,
) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_decrypt_and_store_transaction(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_set_transaction_status(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_set_transaction_status(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_transactions(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_transactions(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_get_transaction_outputs(input_json: *const c_char) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_get_transaction_outputs(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_wallet_create_proposed_transactions(
    input_json: *const c_char,
) -> *mut c_char {
    clear_last_error();

    let input_json = match parse_input(input_json, "input_json") {
        Ok(value) => value,
        Err(err) => {
            set_last_error(err);
            return ptr::null_mut();
        }
    };

    match wallet_create_proposed_transactions(&input_json) {
        Ok(payload) => into_c_string(payload),
        Err(err) => {
            set_last_error(err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn zcash_zip321_last_error() -> *mut c_char {
    let message = LAST_ERROR.with(|slot| slot.borrow().clone());
    match message {
        Some(message) => into_c_string(message),
        None => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn zcash_zip321_string_free(value: *mut c_char) {
    if value.is_null() {
        return;
    }

    unsafe {
        drop(CString::from_raw(value));
    }
}
