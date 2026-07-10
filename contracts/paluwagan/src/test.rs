#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, token, vec, Address, Env};

struct Setup {
    env: Env,
    client: PaluwaganContractClient<'static>,
    token: token::TokenClient<'static>,
    members: [Address; 3],
}

const START: i128 = 1_000;
const CONTRIB: i128 = 100;

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_address = sac.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    let token = token::TokenClient::new(&env, &token_address);

    let members = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    for m in &members {
        token_admin.mint(m, &START);
    }

    let contract_id = env.register(PaluwaganContract, ());
    let client = PaluwaganContractClient::new(&env, &contract_id);
    client.initialize(
        &token_address,
        &vec![&env, members[0].clone(), members[1].clone(), members[2].clone()],
        &CONTRIB,
    );

    Setup { env, client, token, members }
}

/// Everyone contributes each cycle; the pot rotates to each member once; after a
/// full rotation every member is back to their starting balance (zero-sum) and
/// the contract holds nothing. This is the whole paluwagan invariant in one test.
#[test]
fn full_rotation_is_zero_sum() {
    let s = setup();
    assert_eq!(s.client.total_cycles(), 3);

    for cycle in 0..3u32 {
        assert_eq!(s.client.get_current_cycle(), cycle);
        for m in &s.members {
            s.client.contribute(m);
        }
        assert_eq!(s.client.paid_count(&cycle), 3);
        assert_eq!(s.client.get_balance(), CONTRIB * 3);

        s.client.advance_cycle();
        // recipient of this cycle is members[cycle]
        assert_eq!(s.client.get_balance(), 0);
    }

    assert!(s.client.is_complete());
    for m in &s.members {
        assert_eq!(s.token.balance(m), START); // net zero over a full rotation
    }
}

#[test]
fn cannot_advance_until_all_paid() {
    let s = setup();
    s.client.contribute(&s.members[0]);
    s.client.contribute(&s.members[1]); // members[2] hasn't paid
    let res = s.client.try_advance_cycle();
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::NotAllContributed as u32
        )))
    );
    assert_eq!(s.client.get_current_cycle(), 0);
}

#[test]
fn non_member_cannot_contribute() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    let res = s.client.try_contribute(&stranger);
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::NotMember as u32
        )))
    );
}

#[test]
fn double_contribute_in_same_cycle_rejected() {
    let s = setup();
    s.client.contribute(&s.members[0]);
    let res = s.client.try_contribute(&s.members[0]);
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::AlreadyContributed as u32
        )))
    );
}

#[test]
fn init_rejects_too_few_members() {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let id = env.register(PaluwaganContract, ());
    let client = PaluwaganContractClient::new(&env, &id);
    let res = client.try_initialize(
        &sac.address(),
        &vec![&env, Address::generate(&env)], // only 1 member
        &CONTRIB,
    );
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::TooFewMembers as u32
        )))
    );
}

#[test]
fn init_rejects_non_positive_contribution() {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let id = env.register(PaluwaganContract, ());
    let client = PaluwaganContractClient::new(&env, &id);
    let res = client.try_initialize(
        &sac.address(),
        &vec![&env, Address::generate(&env), Address::generate(&env)],
        &0i128,
    );
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::NonPositiveAmount as u32
        )))
    );
}
