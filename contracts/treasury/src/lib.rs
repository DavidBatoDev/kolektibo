#![no_std]
//! Kolektibo Treasury — the trust core.
//!
//! One instance of this contract = one group's pooled fund. The contract holds the
//! group's USDC and will ONLY release it when the group's own on-chain policy is
//! satisfied: the spend is within its category limit AND enough officers have
//! approved. No single officer — and no off-chain AI — can move the money.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, String, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotOfficer = 2,
    OverCategoryLimit = 3,
    SpendNotFound = 4,
    AlreadyExecuted = 5,
    NotEnoughApprovals = 6,
    AlreadyApproved = 7,
    InvalidInit = 8,
    InsufficientBalance = 9,
    NonPositiveAmount = 10,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Token,
    Officers,
    Threshold,
    NextSpendId,
    Members,
    Categories,
    CategoryLimit(Symbol),
    Contribution(Address),
    Spend(u32),
}

/// A spend category and its per-spend cap (0 = no limit).
#[contracttype]
#[derive(Clone)]
pub struct CategoryInfo {
    pub name: Symbol,
    pub limit: i128,
}

/// A proposed disbursement, and the approvals it has gathered so far.
#[contracttype]
#[derive(Clone)]
pub struct SpendRequest {
    pub id: u32,
    pub proposer: Address,
    pub category: Symbol,
    pub amount: i128,
    pub recipient: Address,
    pub memo: String,
    pub approvals: Vec<Address>,
    pub executed: bool,
}

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    /// One-time setup. `limits[i]` is the per-spend cap for `categories[i]`
    /// (use 0 for "no limit"). `threshold` officers must approve any spend.
    pub fn initialize(
        env: Env,
        token: Address,
        officers: Vec<Address>,
        threshold: u32,
        categories: Vec<Symbol>,
        limits: Vec<i128>,
    ) {
        let store = env.storage().instance();
        if store.has(&DataKey::Token) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if threshold == 0 || threshold > officers.len() || categories.len() != limits.len() {
            panic_with_error!(&env, Error::InvalidInit);
        }

        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Officers, &officers);
        store.set(&DataKey::Threshold, &threshold);
        store.set(&DataKey::NextSpendId, &1u32);
        store.set(&DataKey::Members, &Vec::<Address>::new(&env));
        store.set(&DataKey::Categories, &categories);
        for i in 0..categories.len() {
            store.set(
                &DataKey::CategoryLimit(categories.get(i).unwrap()),
                &limits.get(i).unwrap(),
            );
        }
        store.extend_ttl(100_000, 100_000);
    }

    /// A member pulls their contribution (in the pooled token) into the treasury.
    pub fn contribute(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        let ckey = DataKey::Contribution(from.clone());
        let prev: i128 = env.storage().persistent().get(&ckey).unwrap_or(0);
        env.storage().persistent().set(&ckey, &(prev + amount));

        let mut members: Vec<Address> =
            env.storage().instance().get(&DataKey::Members).unwrap();
        if !members.contains(&from) {
            members.push_back(from.clone());
            env.storage().instance().set(&DataKey::Members, &members);
        }
        env.events().publish((symbol_short!("contrib"),), (from, amount));
    }

    /// An officer proposes a spend. Rejected on the spot if it breaks the category
    /// limit. The proposer's own approval is recorded automatically.
    pub fn request_spend(
        env: Env,
        proposer: Address,
        category: Symbol,
        amount: i128,
        recipient: Address,
        memo: String,
    ) -> u32 {
        proposer.require_auth();
        require_officer(&env, &proposer);
        if amount <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        let limit: Option<i128> = env
            .storage()
            .instance()
            .get(&DataKey::CategoryLimit(category.clone()));
        if let Some(l) = limit {
            if l > 0 && amount > l {
                panic_with_error!(&env, Error::OverCategoryLimit);
            }
        }

        let id: u32 = env.storage().instance().get(&DataKey::NextSpendId).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextSpendId, &(id + 1));

        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());
        let spend = SpendRequest {
            id,
            proposer,
            category,
            amount,
            recipient,
            memo,
            approvals,
            executed: false,
        };
        env.storage().persistent().set(&DataKey::Spend(id), &spend);
        env.events().publish((symbol_short!("spend_req"),), id);
        id
    }

    /// Another officer adds their approval.
    pub fn approve(env: Env, officer: Address, spend_id: u32) {
        officer.require_auth();
        require_officer(&env, &officer);

        let key = DataKey::Spend(spend_id);
        let mut spend: SpendRequest = match env.storage().persistent().get(&key) {
            Some(s) => s,
            None => panic_with_error!(&env, Error::SpendNotFound),
        };
        if spend.executed {
            panic_with_error!(&env, Error::AlreadyExecuted);
        }
        if spend.approvals.contains(&officer) {
            panic_with_error!(&env, Error::AlreadyApproved);
        }
        spend.approvals.push_back(officer.clone());
        env.storage().persistent().set(&key, &spend);
        env.events()
            .publish((symbol_short!("approve"),), (spend_id, officer));
    }

    /// Release the funds — permissionless, but reverts unless the approval
    /// threshold is met. Anyone in the group can push the button once officers agree.
    pub fn execute(env: Env, spend_id: u32) {
        let key = DataKey::Spend(spend_id);
        let mut spend: SpendRequest = match env.storage().persistent().get(&key) {
            Some(s) => s,
            None => panic_with_error!(&env, Error::SpendNotFound),
        };
        if spend.executed {
            panic_with_error!(&env, Error::AlreadyExecuted);
        }
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        if spend.approvals.len() < threshold {
            panic_with_error!(&env, Error::NotEnoughApprovals);
        }

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let client = token::TokenClient::new(&env, &token);
        if client.balance(&env.current_contract_address()) < spend.amount {
            panic_with_error!(&env, Error::InsufficientBalance);
        }
        client.transfer(&env.current_contract_address(), &spend.recipient, &spend.amount);

        spend.executed = true;
        env.storage().persistent().set(&key, &spend);
        env.events()
            .publish((symbol_short!("execute"),), (spend_id, spend.amount));
    }

    // ─────────────── read-only views (feed the app + the AI) ───────────────

    pub fn get_balance(env: Env) -> i128 {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(&env, &token).balance(&env.current_contract_address())
    }

    pub fn get_spend(env: Env, id: u32) -> Option<SpendRequest> {
        env.storage().persistent().get(&DataKey::Spend(id))
    }

    /// All spend requests (pending + executed), newest ids last.
    pub fn get_spends(env: Env) -> Vec<SpendRequest> {
        let next: u32 = env.storage().instance().get(&DataKey::NextSpendId).unwrap();
        let mut out = Vec::new(&env);
        let mut i = 1u32;
        while i < next {
            if let Some(s) = env
                .storage()
                .persistent()
                .get::<_, SpendRequest>(&DataKey::Spend(i))
            {
                out.push_back(s);
            }
            i += 1;
        }
        out
    }

    /// Spend categories and their caps — feeds the budgets UI + the AI.
    pub fn get_categories(env: Env) -> Vec<CategoryInfo> {
        let cats: Vec<Symbol> = env.storage().instance().get(&DataKey::Categories).unwrap();
        let mut out = Vec::new(&env);
        for i in 0..cats.len() {
            let name = cats.get(i).unwrap();
            let limit: i128 = env
                .storage()
                .instance()
                .get(&DataKey::CategoryLimit(name.clone()))
                .unwrap_or(0);
            out.push_back(CategoryInfo { name, limit });
        }
        out
    }

    pub fn get_officers(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::Officers).unwrap()
    }

    pub fn get_threshold(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Threshold).unwrap()
    }

    pub fn get_members(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::Members).unwrap()
    }

    pub fn get_contribution(env: Env, who: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(who))
            .unwrap_or(0)
    }

    pub fn get_next_spend_id(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NextSpendId).unwrap()
    }
}

fn require_officer(env: &Env, who: &Address) {
    let officers: Vec<Address> = env.storage().instance().get(&DataKey::Officers).unwrap();
    if !officers.contains(who) {
        panic_with_error!(env, Error::NotOfficer);
    }
}

#[cfg(test)]
mod test;
