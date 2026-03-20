use std::cell::RefCell;
use std::collections::BTreeMap;
use std::ffi::{c_char, CStr, CString};
use std::ptr;

use serde::{Deserialize, Serialize};
use zcash_address::{ConversionError, TryFromAddress, ZcashAddress};
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedSpendingKey};
use zcash_protocol::{
    consensus::{BlockHeight, Network, NetworkType, Parameters},
    local_consensus::LocalNetwork,
};
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

struct ParsedAddress(ParsedAddressJson);

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
