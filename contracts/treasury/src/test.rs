#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::Address as _, token, vec, Address, Env, String, Symbol,
};

struct Setup {
    env: Env,
    client: TreasuryContractClient<'static>,
    token: token::TokenClient<'static>,
    officers: [Address; 3],
    member: Address,
    vendor: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    // A test USDC-like asset (Stellar Asset Contract).
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_address = sac.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    let token = token::TokenClient::new(&env, &token_address);

    let officers = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let member = Address::generate(&env);
    let vendor = Address::generate(&env);
    token_admin.mint(&member, &10_000);

    let contract_id = env.register(TreasuryContract, ());
    let client = TreasuryContractClient::new(&env, &contract_id);

    let officer_vec = vec![
        &env,
        officers[0].clone(),
        officers[1].clone(),
        officers[2].clone(),
    ];
    let categories = vec![&env, Symbol::new(&env, "Equipment"), Symbol::new(&env, "Venue")];
    let limits = vec![&env, 5_000i128, 3_000i128];
    client.initialize(&token_address, &officer_vec, &2u32, &categories, &limits);

    Setup { env, client, token, officers, member, vendor }
}

#[test]
fn full_happy_path() {
    let s = setup();

    // Member contributes → treasury holds the funds.
    s.client.contribute(&s.member, &2_000);
    assert_eq!(s.client.get_balance(), 2_000);
    assert_eq!(s.client.get_contribution(&s.member), 2_000);

    // Officer 0 proposes a spend (auto-approves), officer 1 approves → 2 of 3.
    let memo = String::from_str(&s.env, "2 game balls");
    let id = s.client.request_spend(
        &s.officers[0],
        &Symbol::new(&s.env, "Equipment"),
        &1_200i128,
        &s.vendor,
        &memo,
    );
    s.client.approve(&s.officers[1], &id);

    // Anyone can now release; funds land with the vendor.
    s.client.execute(&id);
    assert_eq!(s.token.balance(&s.vendor), 1_200);
    assert_eq!(s.client.get_balance(), 800);
    assert!(s.client.get_spend(&id).unwrap().executed);
}

#[test]
fn cannot_execute_without_threshold() {
    let s = setup();
    s.client.contribute(&s.member, &2_000);

    let id = s.client.request_spend(
        &s.officers[0],
        &Symbol::new(&s.env, "Equipment"),
        &500i128,
        &s.vendor,
        &String::from_str(&s.env, "net"),
    );
    // Only 1 of the required 2 approvals (the proposer's) — execution must revert.
    let res = s.client.try_execute(&id);
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::NotEnoughApprovals as u32
        )))
    );
    assert_eq!(s.token.balance(&s.vendor), 0);
}

#[test]
fn rejects_over_category_limit() {
    let s = setup();
    s.client.contribute(&s.member, &10_000);

    // Equipment cap is 5,000 — a 6,000 request must be rejected on proposal.
    let res = s.client.try_request_spend(
        &s.officers[0],
        &Symbol::new(&s.env, "Equipment"),
        &6_000i128,
        &s.vendor,
        &String::from_str(&s.env, "too much"),
    );
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::OverCategoryLimit as u32
        )))
    );
}

#[test]
fn non_officer_cannot_propose() {
    let s = setup();
    s.client.contribute(&s.member, &2_000);

    let res = s.client.try_request_spend(
        &s.member, // a plain member, not an officer
        &Symbol::new(&s.env, "Equipment"),
        &100i128,
        &s.vendor,
        &String::from_str(&s.env, "nope"),
    );
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::NotOfficer as u32
        )))
    );
}
