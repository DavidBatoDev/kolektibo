#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger}, token, vec, Address, BytesN, Env, String, Symbol,
};

struct Setup {
    env: Env,
    client: TreasuryContractClient<'static>,
    token: token::TokenClient<'static>,
    officers: [Address; 3],
    member: Address,
    vendor: Address,
}

fn setup_v2() -> (Setup, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

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
    let agent = Address::generate(&env);
    token_admin.mint(&member, &20_000);

    let contract_id = env.register(TreasuryContract, ());
    let client = TreasuryContractClient::new(&env, &contract_id);
    client.initialize_v2(
        &token_address,
        &vec![&env, officers[0].clone(), officers[1].clone(), officers[2].clone()],
        &2u32,
        &vec![&env, Symbol::new(&env, "Equipment"), Symbol::new(&env, "Venue")],
        &vec![&env, 5_000i128, 3_000i128],
        &agent,
    );
    (
        Setup { env, client, token, officers, member, vendor },
        agent,
    )
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

#[test]
fn threshold_approved_mandate_executes_without_payment_approval() {
    let (s, agent) = setup_v2();
    s.client.contribute(&s.member, &10_000);
    let proposal = s.client.propose_mandate(
        &s.officers[0],
        &s.vendor,
        &Symbol::new(&s.env, "Equipment"),
        &1_200i128,
        &1_000u64,
        &604_800u64,
        &0u64,
        &3u32,
        &2_000i128,
        &BytesN::from_array(&s.env, &[0; 32]),
    );
    assert!(s.client.get_mandate(&1).is_none());
    s.client.approve_mandate_proposal(&s.officers[1], &proposal);
    s.client.finalize_mandate_proposal(&proposal);

    s.client.execute_mandate(&agent, &1, &String::from_str(&s.env, "weekly supplies"));
    assert_eq!(s.token.balance(&s.vendor), 1_200);
    assert_eq!(s.client.get_mandate(&1).unwrap().executions, 1);
}

#[test]
fn mandate_cannot_execute_twice_inside_interval() {
    let (s, agent) = setup_v2();
    s.client.contribute(&s.member, &10_000);
    let proposal = s.client.propose_mandate(
        &s.officers[0],
        &s.vendor,
        &Symbol::new(&s.env, "Equipment"),
        &500i128,
        &1_000u64,
        &3_600u64,
        &0u64,
        &2u32,
        &0i128,
        &BytesN::from_array(&s.env, &[0; 32]),
    );
    s.client.approve_mandate_proposal(&s.officers[1], &proposal);
    s.client.finalize_mandate_proposal(&proposal);
    s.client.execute_mandate(&agent, &1, &String::from_str(&s.env, "first"));
    assert_eq!(
        s.client.try_execute_mandate(&agent, &1, &String::from_str(&s.env, "duplicate")),
        Err(Ok(soroban_sdk::Error::from_contract_error(Error::MandateNotDue as u32)))
    );
}

#[test]
fn any_officer_can_pause_but_threshold_is_needed_to_resume() {
    let (s, agent) = setup_v2();
    s.client.contribute(&s.member, &10_000);
    let proposal = s.client.propose_mandate(
        &s.officers[0],
        &s.vendor,
        &Symbol::new(&s.env, "Venue"),
        &1_000i128,
        &1_000u64,
        &0u64,
        &0u64,
        &1u32,
        &0i128,
        &BytesN::from_array(&s.env, &[0; 32]),
    );
    s.client.approve_mandate_proposal(&s.officers[1], &proposal);
    s.client.finalize_mandate_proposal(&proposal);
    s.client.pause_mandate(&s.officers[2], &1);
    assert_eq!(
        s.client.try_execute_mandate(&agent, &1, &String::from_str(&s.env, "blocked")),
        Err(Ok(soroban_sdk::Error::from_contract_error(Error::MandatePaused as u32)))
    );

    let resume = s.client.propose_mandate_action(&s.officers[0], &1, &MandateAction::Resume);
    assert_eq!(
        s.client.try_finalize_mandate_proposal(&resume),
        Err(Ok(soroban_sdk::Error::from_contract_error(Error::NotEnoughApprovals as u32)))
    );
    s.client.approve_mandate_proposal(&s.officers[1], &resume);
    s.client.finalize_mandate_proposal(&resume);
    s.client.execute_mandate(&agent, &1, &String::from_str(&s.env, "resumed"));
    assert_eq!(s.token.balance(&s.vendor), 1_000);
}

#[test]
fn mandate_enforces_category_cap_and_balance_floor() {
    let (s, agent) = setup_v2();
    s.client.contribute(&s.member, &5_000);
    assert_eq!(
        s.client.try_propose_mandate(
            &s.officers[0],
            &s.vendor,
            &Symbol::new(&s.env, "Venue"),
            &3_001i128,
            &1_000u64,
            &0u64,
            &0u64,
            &1u32,
            &0i128,
            &BytesN::from_array(&s.env, &[0; 32]),
        ),
        Err(Ok(soroban_sdk::Error::from_contract_error(Error::OverCategoryLimit as u32)))
    );
    let proposal = s.client.propose_mandate(
        &s.officers[0],
        &s.vendor,
        &Symbol::new(&s.env, "Venue"),
        &2_000i128,
        &1_000u64,
        &0u64,
        &0u64,
        &1u32,
        &4_000i128,
        &BytesN::from_array(&s.env, &[0; 32]),
    );
    s.client.approve_mandate_proposal(&s.officers[1], &proposal);
    s.client.finalize_mandate_proposal(&proposal);
    assert_eq!(
        s.client.try_execute_mandate(&agent, &1, &String::from_str(&s.env, "floor")),
        Err(Ok(soroban_sdk::Error::from_contract_error(Error::BalanceFloorViolated as u32)))
    );
}
