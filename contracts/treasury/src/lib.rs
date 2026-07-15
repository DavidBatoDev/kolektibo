#![no_std]
//! Kolektibo Treasury — the trust core.
//!
//! One instance of this contract = one group's pooled fund. The contract holds the
//! group's USDC and will ONLY release it when the group's own on-chain policy is
//! satisfied: the spend is within its category limit AND enough officers have
//! approved. Treasury v2 additionally lets an isolated agent execute only the
//! exact recipient, amount, category, schedule, floor, and count that officers
//! first approved as an on-chain mandate.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env, String, Symbol, Vec,
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
    AgentNotConfigured = 11,
    MandateNotFound = 12,
    MandatePaused = 13,
    MandateNotDue = 14,
    MandateExpired = 15,
    MandateExhausted = 16,
    InvalidMandate = 17,
    ProposalNotFound = 18,
    ProposalFinalized = 19,
    InvalidProposalAction = 20,
    BalanceFloorViolated = 21,
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
    Version,
    Agent,
    NextMandateId,
    NextMandateProposalId,
    Mandate(u32),
    MandateProposal(u32),
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

/// Authority that officers deliberately delegate to the pool's isolated agent.
/// Recipient, category, and amount are immutable until another threshold-approved
/// proposal replaces the mandate.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mandate {
    pub id: u32,
    pub recipient: Address,
    pub category: Symbol,
    pub amount: i128,
    pub not_before: u64,
    pub interval_seconds: u64,
    pub expires_at: u64,
    pub max_executions: u32,
    pub executions: u32,
    pub last_executed_at: u64,
    pub min_balance: i128,
    /// Hash of the normalized off-chain condition. It is an audit commitment;
    /// conditions may delay execution but cannot expand the on-chain allowance.
    pub condition_hash: BytesN<32>,
    pub paused: bool,
    pub revoked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MandateAction {
    Activate,
    Resume,
    Revoke,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MandateProposal {
    pub id: u32,
    pub action: MandateAction,
    pub mandate: Mandate,
    pub approvals: Vec<Address>,
    pub finalized: bool,
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
        store.set(&DataKey::Version, &1u32);
        store.set(&DataKey::NextMandateId, &1u32);
        store.set(&DataKey::NextMandateProposalId, &1u32);
        for i in 0..categories.len() {
            store.set(
                &DataKey::CategoryLimit(categories.get(i).unwrap()),
                &limits.get(i).unwrap(),
            );
        }
        store.extend_ttl(100_000, 100_000);
    }

    /// Agent-compatible initialization. Existing v1 entry points remain intact.
    pub fn initialize_v2(
        env: Env,
        token: Address,
        officers: Vec<Address>,
        threshold: u32,
        categories: Vec<Symbol>,
        limits: Vec<i128>,
        agent: Address,
    ) {
        Self::initialize(
            env.clone(),
            token,
            officers,
            threshold,
            categories,
            limits,
        );
        env.storage().instance().set(&DataKey::Version, &2u32);
        env.storage().instance().set(&DataKey::Agent, &agent);
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

    // ----------------------- delegated agent mandates -----------------------

    /// Propose a fixed autonomous payment allowance. The proposer auto-approves;
    /// activation still requires the pool's normal officer threshold.
    #[allow(clippy::too_many_arguments)]
    pub fn propose_mandate(
        env: Env,
        proposer: Address,
        recipient: Address,
        category: Symbol,
        amount: i128,
        not_before: u64,
        interval_seconds: u64,
        expires_at: u64,
        max_executions: u32,
        min_balance: i128,
        condition_hash: BytesN<32>,
    ) -> u32 {
        proposer.require_auth();
        require_officer(&env, &proposer);
        require_agent(&env);
        validate_mandate(
            &env,
            &category,
            amount,
            not_before,
            interval_seconds,
            expires_at,
            max_executions,
            min_balance,
        );

        let mandate_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextMandateId)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&DataKey::NextMandateId, &(mandate_id + 1));
        let mandate = Mandate {
            id: mandate_id,
            recipient,
            category,
            amount,
            not_before,
            interval_seconds,
            expires_at,
            max_executions,
            executions: 0,
            last_executed_at: 0,
            min_balance,
            condition_hash,
            paused: false,
            revoked: false,
        };
        create_mandate_proposal(&env, proposer, MandateAction::Activate, mandate)
    }

    /// Propose resuming or revoking an existing mandate. Restrictive emergency
    /// pause is immediate; expanding authority always goes through governance.
    pub fn propose_mandate_action(
        env: Env,
        proposer: Address,
        mandate_id: u32,
        action: MandateAction,
    ) -> u32 {
        proposer.require_auth();
        require_officer(&env, &proposer);
        match action {
            MandateAction::Resume | MandateAction::Revoke => {}
            MandateAction::Activate => panic_with_error!(&env, Error::InvalidProposalAction),
        }
        let mandate: Mandate = env
            .storage()
            .persistent()
            .get(&DataKey::Mandate(mandate_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::MandateNotFound));
        create_mandate_proposal(&env, proposer, action, mandate)
    }

    pub fn approve_mandate_proposal(env: Env, officer: Address, proposal_id: u32) {
        officer.require_auth();
        require_officer(&env, &officer);
        let key = DataKey::MandateProposal(proposal_id);
        let mut proposal: MandateProposal = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ProposalNotFound));
        if proposal.finalized {
            panic_with_error!(&env, Error::ProposalFinalized);
        }
        if proposal.approvals.contains(&officer) {
            panic_with_error!(&env, Error::AlreadyApproved);
        }
        proposal.approvals.push_back(officer.clone());
        env.storage().persistent().set(&key, &proposal);
        env.events()
            .publish((symbol_short!("mand_appr"),), (proposal_id, officer));
    }

    /// Permissionless finalization after officers have approved the proposal.
    pub fn finalize_mandate_proposal(env: Env, proposal_id: u32) {
        let key = DataKey::MandateProposal(proposal_id);
        let mut proposal: MandateProposal = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ProposalNotFound));
        if proposal.finalized {
            panic_with_error!(&env, Error::ProposalFinalized);
        }
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        if proposal.approvals.len() < threshold {
            panic_with_error!(&env, Error::NotEnoughApprovals);
        }
        let mkey = DataKey::Mandate(proposal.mandate.id);
        match proposal.action {
            MandateAction::Activate => {
                env.storage().persistent().set(&mkey, &proposal.mandate);
            }
            MandateAction::Resume => {
                let mut mandate: Mandate = env
                    .storage()
                    .persistent()
                    .get(&mkey)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::MandateNotFound));
                if mandate.revoked {
                    panic_with_error!(&env, Error::MandateExpired);
                }
                mandate.paused = false;
                env.storage().persistent().set(&mkey, &mandate);
            }
            MandateAction::Revoke => {
                let mut mandate: Mandate = env
                    .storage()
                    .persistent()
                    .get(&mkey)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::MandateNotFound));
                mandate.paused = true;
                mandate.revoked = true;
                env.storage().persistent().set(&mkey, &mandate);
            }
        }
        proposal.finalized = true;
        env.storage().persistent().set(&key, &proposal);
        env.events().publish(
            (symbol_short!("mand_act"),),
            (proposal_id, proposal.mandate.id),
        );
    }

    /// Any officer may immediately reduce authority. Resuming needs a proposal.
    pub fn pause_mandate(env: Env, officer: Address, mandate_id: u32) {
        officer.require_auth();
        require_officer(&env, &officer);
        let key = DataKey::Mandate(mandate_id);
        let mut mandate: Mandate = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::MandateNotFound));
        mandate.paused = true;
        env.storage().persistent().set(&key, &mandate);
        env.events()
            .publish((symbol_short!("mand_paus"),), (mandate_id, officer));
    }

    /// Move the exact pre-approved amount to the exact pre-approved recipient.
    /// The model supplies only a mandate id and an audit memo.
    pub fn execute_mandate(env: Env, agent: Address, mandate_id: u32, memo: String) {
        agent.require_auth();
        let configured: Address = require_agent(&env);
        if agent != configured {
            panic_with_error!(&env, Error::AgentNotConfigured);
        }
        let key = DataKey::Mandate(mandate_id);
        let mut mandate: Mandate = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::MandateNotFound));
        if mandate.paused || mandate.revoked {
            panic_with_error!(&env, Error::MandatePaused);
        }
        let now = env.ledger().timestamp();
        if now < mandate.not_before
            || (mandate.last_executed_at > 0
                && now < mandate.last_executed_at.saturating_add(mandate.interval_seconds))
        {
            panic_with_error!(&env, Error::MandateNotDue);
        }
        if mandate.expires_at > 0 && now > mandate.expires_at {
            panic_with_error!(&env, Error::MandateExpired);
        }
        if mandate.executions >= mandate.max_executions {
            panic_with_error!(&env, Error::MandateExhausted);
        }
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let client = token::TokenClient::new(&env, &token);
        let balance = client.balance(&env.current_contract_address());
        if balance < mandate.amount {
            panic_with_error!(&env, Error::InsufficientBalance);
        }
        if balance - mandate.amount < mandate.min_balance {
            panic_with_error!(&env, Error::BalanceFloorViolated);
        }

        // Persist before the external token call. A failed transfer reverts the
        // invocation atomically, and successful retries cannot double-pay.
        mandate.executions += 1;
        mandate.last_executed_at = now;
        env.storage().persistent().set(&key, &mandate);
        client.transfer(
            &env.current_contract_address(),
            &mandate.recipient,
            &mandate.amount,
        );
        env.events().publish(
            (symbol_short!("mand_pay"),),
            (mandate_id, mandate.amount, mandate.recipient, memo),
        );
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

    pub fn get_version(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Version).unwrap_or(1)
    }

    pub fn get_agent(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Agent)
    }

    pub fn get_mandate(env: Env, id: u32) -> Option<Mandate> {
        env.storage().persistent().get(&DataKey::Mandate(id))
    }

    pub fn get_mandates(env: Env) -> Vec<Mandate> {
        let next: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextMandateId)
            .unwrap_or(1);
        let mut out = Vec::new(&env);
        let mut id = 1u32;
        while id < next {
            if let Some(mandate) = env
                .storage()
                .persistent()
                .get::<_, Mandate>(&DataKey::Mandate(id))
            {
                out.push_back(mandate);
            }
            id += 1;
        }
        out
    }

    pub fn get_mandate_proposal(env: Env, id: u32) -> Option<MandateProposal> {
        env.storage()
            .persistent()
            .get(&DataKey::MandateProposal(id))
    }
}

fn require_officer(env: &Env, who: &Address) {
    let officers: Vec<Address> = env.storage().instance().get(&DataKey::Officers).unwrap();
    if !officers.contains(who) {
        panic_with_error!(env, Error::NotOfficer);
    }
}

fn require_agent(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Agent)
        .unwrap_or_else(|| panic_with_error!(env, Error::AgentNotConfigured))
}

#[allow(clippy::too_many_arguments)]
fn validate_mandate(
    env: &Env,
    category: &Symbol,
    amount: i128,
    not_before: u64,
    interval_seconds: u64,
    expires_at: u64,
    max_executions: u32,
    min_balance: i128,
) {
    if amount <= 0
        || max_executions == 0
        || min_balance < 0
        || (max_executions > 1 && interval_seconds == 0)
        || (expires_at > 0 && expires_at < not_before)
    {
        panic_with_error!(env, Error::InvalidMandate);
    }
    let limit: Option<i128> = env
        .storage()
        .instance()
        .get(&DataKey::CategoryLimit(category.clone()));
    match limit {
        Some(cap) if cap == 0 || amount <= cap => {}
        Some(_) => panic_with_error!(env, Error::OverCategoryLimit),
        None => panic_with_error!(env, Error::InvalidMandate),
    }
}

fn create_mandate_proposal(
    env: &Env,
    proposer: Address,
    action: MandateAction,
    mandate: Mandate,
) -> u32 {
    let id: u32 = env
        .storage()
        .instance()
        .get(&DataKey::NextMandateProposalId)
        .unwrap_or(1);
    env.storage()
        .instance()
        .set(&DataKey::NextMandateProposalId, &(id + 1));
    let mut approvals = Vec::new(env);
    approvals.push_back(proposer);
    let proposal = MandateProposal {
        id,
        action,
        mandate,
        approvals,
        finalized: false,
    };
    env.storage()
        .persistent()
        .set(&DataKey::MandateProposal(id), &proposal);
    env.events()
        .publish((symbol_short!("mand_prop"),), (id, proposal.mandate.id));
    id
}

#[cfg(test)]
mod test;
