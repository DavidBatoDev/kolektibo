#![no_std]
//! Kolektibo Paluwagan — on-chain rotating savings (ROSCA / "paluwagan").
//!
//! N members each contribute a fixed amount every cycle. When everyone has paid
//! in a cycle, the whole pot rotates to the next member in a fixed order. After
//! N cycles everyone has received the pot exactly once. The rotation is enforced
//! by the contract — there is no "paluwagan queen" who holds the money and could
//! run off with it. The group's own contributions move only when the rule is met.
//!
//! This is the strict core: `advance_cycle` requires all members to have paid.
//! Officer-gated force/skip for defaulters is a deliberate later increment; the
//! off-chain layer handles reminders/penalties (see the production roadmap).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    TooFewMembers = 2,
    NonPositiveAmount = 3,
    NotMember = 4,
    AlreadyContributed = 5,
    Completed = 6,
    NotAllContributed = 7,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Token,
    Members,
    Contribution,
    CurrentCycle,
    /// Has `Address` contributed in cycle `u32`?
    Paid(u32, Address),
}

#[contract]
pub struct PaluwaganContract;

#[contractimpl]
impl PaluwaganContract {
    /// One-time setup. `members` is BOTH the roster and the payout order:
    /// the member at index `i` receives the pot in cycle `i`.
    pub fn initialize(env: Env, token: Address, members: Vec<Address>, contribution: i128) {
        let store = env.storage().instance();
        if store.has(&DataKey::Token) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if members.len() < 2 {
            panic_with_error!(&env, Error::TooFewMembers);
        }
        if contribution <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Members, &members);
        store.set(&DataKey::Contribution, &contribution);
        store.set(&DataKey::CurrentCycle, &0u32);
        store.extend_ttl(100_000, 100_000);
    }

    /// A member pays their fixed contribution for the current cycle.
    pub fn contribute(env: Env, from: Address) {
        from.require_auth();
        let members: Vec<Address> = env.storage().instance().get(&DataKey::Members).unwrap();
        if !members.contains(&from) {
            panic_with_error!(&env, Error::NotMember);
        }
        let cycle: u32 = env.storage().instance().get(&DataKey::CurrentCycle).unwrap();
        if cycle >= members.len() {
            panic_with_error!(&env, Error::Completed);
        }
        let paid_key = DataKey::Paid(cycle, from.clone());
        if env.storage().persistent().get::<_, bool>(&paid_key).unwrap_or(false) {
            panic_with_error!(&env, Error::AlreadyContributed);
        }

        let contribution: i128 = env.storage().instance().get(&DataKey::Contribution).unwrap();
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &contribution,
        );

        env.storage().persistent().set(&paid_key, &true);
        env.events()
            .publish((symbol_short!("contrib"),), (cycle, from));
    }

    /// Permissionless: once EVERY member has paid this cycle, rotate the whole
    /// pot to this cycle's recipient and advance. Reverts otherwise.
    pub fn advance_cycle(env: Env) {
        let members: Vec<Address> = env.storage().instance().get(&DataKey::Members).unwrap();
        let cycle: u32 = env.storage().instance().get(&DataKey::CurrentCycle).unwrap();
        if cycle >= members.len() {
            panic_with_error!(&env, Error::Completed);
        }
        // Everyone must have paid this cycle.
        for i in 0..members.len() {
            let m = members.get(i).unwrap();
            let paid = env
                .storage()
                .persistent()
                .get::<_, bool>(&DataKey::Paid(cycle, m))
                .unwrap_or(false);
            if !paid {
                panic_with_error!(&env, Error::NotAllContributed);
            }
        }

        let contribution: i128 = env.storage().instance().get(&DataKey::Contribution).unwrap();
        let pot: i128 = contribution * (members.len() as i128);
        let recipient = members.get(cycle).unwrap();
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &pot,
        );

        env.storage().instance().set(&DataKey::CurrentCycle, &(cycle + 1));
        env.events()
            .publish((symbol_short!("payout"),), (cycle, recipient, pot));
    }

    // ───────────────────────── read-only views ─────────────────────────

    pub fn get_members(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::Members).unwrap()
    }

    pub fn get_contribution(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Contribution).unwrap()
    }

    pub fn get_current_cycle(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::CurrentCycle).unwrap()
    }

    pub fn total_cycles(env: Env) -> u32 {
        let members: Vec<Address> = env.storage().instance().get(&DataKey::Members).unwrap();
        members.len()
    }

    pub fn is_complete(env: Env) -> bool {
        let members: Vec<Address> = env.storage().instance().get(&DataKey::Members).unwrap();
        let cycle: u32 = env.storage().instance().get(&DataKey::CurrentCycle).unwrap();
        cycle >= members.len()
    }

    /// Who receives the pot in `cycle` (members[cycle]).
    pub fn get_payout_recipient(env: Env, cycle: u32) -> Address {
        let members: Vec<Address> = env.storage().instance().get(&DataKey::Members).unwrap();
        members.get(cycle).unwrap()
    }

    pub fn has_paid(env: Env, cycle: u32, who: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::Paid(cycle, who))
            .unwrap_or(false)
    }

    /// How many members have paid in `cycle` (for progress UI).
    pub fn paid_count(env: Env, cycle: u32) -> u32 {
        let members: Vec<Address> = env.storage().instance().get(&DataKey::Members).unwrap();
        let mut n = 0u32;
        for i in 0..members.len() {
            let m = members.get(i).unwrap();
            if env
                .storage()
                .persistent()
                .get::<_, bool>(&DataKey::Paid(cycle, m))
                .unwrap_or(false)
            {
                n += 1;
            }
        }
        n
    }

    pub fn get_balance(env: Env) -> i128 {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(&env, &token).balance(&env.current_contract_address())
    }
}

#[cfg(test)]
mod test;
