import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotOfficer"},
  3: {message:"OverCategoryLimit"},
  4: {message:"SpendNotFound"},
  5: {message:"AlreadyExecuted"},
  6: {message:"NotEnoughApprovals"},
  7: {message:"AlreadyApproved"},
  8: {message:"InvalidInit"},
  9: {message:"InsufficientBalance"},
  10: {message:"NonPositiveAmount"},
  11: {message:"AgentNotConfigured"},
  12: {message:"MandateNotFound"},
  13: {message:"MandatePaused"},
  14: {message:"MandateNotDue"},
  15: {message:"MandateExpired"},
  16: {message:"MandateExhausted"},
  17: {message:"InvalidMandate"},
  18: {message:"ProposalNotFound"},
  19: {message:"ProposalFinalized"},
  20: {message:"InvalidProposalAction"},
  21: {message:"BalanceFloorViolated"}
}

// Default demo deployment. Directory-backed pools always supply their own id.
export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2",
  },
} as const;

export type DataKey = {tag: "Token", values: void} | {tag: "Officers", values: void} | {tag: "Threshold", values: void} | {tag: "NextSpendId", values: void} | {tag: "Members", values: void} | {tag: "Categories", values: void} | {tag: "CategoryLimit", values: readonly [string]} | {tag: "Contribution", values: readonly [string]} | {tag: "Spend", values: readonly [u32]} | {tag: "Version", values: void} | {tag: "Agent", values: void} | {tag: "NextMandateId", values: void} | {tag: "NextMandateProposalId", values: void} | {tag: "Mandate", values: readonly [u32]} | {tag: "MandateProposal", values: readonly [u32]};


/**
 * Authority that officers deliberately delegate to the pool's isolated agent.
 * Recipient, category, and amount are immutable until another threshold-approved
 * proposal replaces the mandate.
 */
export interface Mandate {
  amount: i128;
  category: string;
  /**
 * Hash of the normalized off-chain condition. It is an audit commitment;
 * conditions may delay execution but cannot expand the on-chain allowance.
 */
condition_hash: Buffer;
  executions: u32;
  expires_at: u64;
  id: u32;
  interval_seconds: u64;
  last_executed_at: u64;
  max_executions: u32;
  min_balance: i128;
  not_before: u64;
  paused: boolean;
  recipient: string;
  revoked: boolean;
}


/**
 * A spend category and its per-spend cap (0 = no limit).
 */
export interface CategoryInfo {
  limit: i128;
  name: string;
}


/**
 * A proposed disbursement, and the approvals it has gathered so far.
 */
export interface SpendRequest {
  amount: i128;
  approvals: Array<string>;
  category: string;
  executed: boolean;
  id: u32;
  memo: string;
  proposer: string;
  recipient: string;
}

export type MandateAction = {tag: "Activate", values: void} | {tag: "Resume", values: void} | {tag: "Revoke", values: void};


export interface MandateProposal {
  action: MandateAction;
  approvals: Array<string>;
  finalized: boolean;
  id: u32;
  mandate: Mandate;
}

export interface Client {
  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Another officer adds their approval.
   */
  approve: ({officer, spend_id}: {officer: string, spend_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a execute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Release the funds — permissionless, but reverts unless the approval
   * threshold is met. Anyone in the group can push the button once officers agree.
   */
  execute: ({spend_id}: {spend_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_agent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_agent: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_spend transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_spend: ({id}: {id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Option<SpendRequest>>>

  /**
   * Construct and simulate a contribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A member pulls their contribution (in the pooled token) into the treasury.
   */
  contribute: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_spends transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * All spend requests (pending + executed), newest ids last.
   */
  get_spends: (options?: MethodOptions) => Promise<AssembledTransaction<Array<SpendRequest>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. `limits[i]` is the per-spend cap for `categories[i]`
   * (use 0 for "no limit"). `threshold` officers must approve any spend.
   */
  initialize: ({token, officers, threshold, categories, limits}: {token: string, officers: Array<string>, threshold: u32, categories: Array<string>, limits: Array<i128>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_balance: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_mandate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_mandate: ({id}: {id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Mandate>>>

  /**
   * Construct and simulate a get_members transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_members: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_mandates transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_mandates: (options?: MethodOptions) => Promise<AssembledTransaction<Array<Mandate>>>

  /**
   * Construct and simulate a get_officers transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_officers: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_threshold: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a initialize_v2 transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Agent-compatible initialization. Existing v1 entry points remain intact.
   */
  initialize_v2: ({token, officers, threshold, categories, limits, agent}: {token: string, officers: Array<string>, threshold: u32, categories: Array<string>, limits: Array<i128>, agent: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a pause_mandate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Any officer may immediately reduce authority. Resuming needs a proposal.
   */
  pause_mandate: ({officer, mandate_id}: {officer: string, mandate_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a request_spend transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * An officer proposes a spend. Rejected on the spot if it breaks the category
   * limit. The proposer's own approval is recorded automatically.
   */
  request_spend: ({proposer, category, amount, recipient, memo}: {proposer: string, category: string, amount: i128, recipient: string, memo: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_categories transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Spend categories and their caps — feeds the budgets UI + the AI.
   */
  get_categories: (options?: MethodOptions) => Promise<AssembledTransaction<Array<CategoryInfo>>>

  /**
   * Construct and simulate a execute_mandate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Move the exact pre-approved amount to the exact pre-approved recipient.
   * The model supplies only a mandate id and an audit memo.
   */
  execute_mandate: ({agent, mandate_id, memo}: {agent: string, mandate_id: u32, memo: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a propose_mandate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Propose a fixed autonomous payment allowance. The proposer auto-approves;
   * activation still requires the pool's normal officer threshold.
   */
  propose_mandate: ({proposer, recipient, category, amount, not_before, interval_seconds, expires_at, max_executions, min_balance, condition_hash}: {proposer: string, recipient: string, category: string, amount: i128, not_before: u64, interval_seconds: u64, expires_at: u64, max_executions: u32, min_balance: i128, condition_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_contribution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_contribution: ({who}: {who: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_next_spend_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_next_spend_id: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_mandate_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_mandate_proposal: ({id}: {id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Option<MandateProposal>>>

  /**
   * Construct and simulate a propose_mandate_action transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Propose resuming or revoking an existing mandate. Restrictive emergency
   * pause is immediate; expanding authority always goes through governance.
   */
  propose_mandate_action: ({proposer, mandate_id, action}: {proposer: string, mandate_id: u32, action: MandateAction}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a approve_mandate_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  approve_mandate_proposal: ({officer, proposal_id}: {officer: string, proposal_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a finalize_mandate_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permissionless finalization after officers have approved the proposal.
   */
  finalize_mandate_proposal: ({proposal_id}: {proposal_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAApOb3RPZmZpY2VyAAAAAAACAAAAAAAAABFPdmVyQ2F0ZWdvcnlMaW1pdAAAAAAAAAMAAAAAAAAADVNwZW5kTm90Rm91bmQAAAAAAAAEAAAAAAAAAA9BbHJlYWR5RXhlY3V0ZWQAAAAABQAAAAAAAAASTm90RW5vdWdoQXBwcm92YWxzAAAAAAAGAAAAAAAAAA9BbHJlYWR5QXBwcm92ZWQAAAAABwAAAAAAAAALSW52YWxpZEluaXQAAAAACAAAAAAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAAAJAAAAAAAAABFOb25Qb3NpdGl2ZUFtb3VudAAAAAAAAAoAAAAAAAAAEkFnZW50Tm90Q29uZmlndXJlZAAAAAAACwAAAAAAAAAPTWFuZGF0ZU5vdEZvdW5kAAAAAAwAAAAAAAAADU1hbmRhdGVQYXVzZWQAAAAAAAANAAAAAAAAAA1NYW5kYXRlTm90RHVlAAAAAAAADgAAAAAAAAAOTWFuZGF0ZUV4cGlyZWQAAAAAAA8AAAAAAAAAEE1hbmRhdGVFeGhhdXN0ZWQAAAAQAAAAAAAAAA5JbnZhbGlkTWFuZGF0ZQAAAAAAEQAAAAAAAAAQUHJvcG9zYWxOb3RGb3VuZAAAABIAAAAAAAAAEVByb3Bvc2FsRmluYWxpemVkAAAAAAAAEwAAAAAAAAAVSW52YWxpZFByb3Bvc2FsQWN0aW9uAAAAAAAAFAAAAAAAAAAUQmFsYW5jZUZsb29yVmlvbGF0ZWQAAAAV",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADwAAAAAAAAAAAAAABVRva2VuAAAAAAAAAAAAAAAAAAAIT2ZmaWNlcnMAAAAAAAAAAAAAAAlUaHJlc2hvbGQAAAAAAAAAAAAAAAAAAAtOZXh0U3BlbmRJZAAAAAAAAAAAAAAAAAdNZW1iZXJzAAAAAAAAAAAAAAAACkNhdGVnb3JpZXMAAAAAAAEAAAAAAAAADUNhdGVnb3J5TGltaXQAAAAAAAABAAAAEQAAAAEAAAAAAAAADENvbnRyaWJ1dGlvbgAAAAEAAAATAAAAAQAAAAAAAAAFU3BlbmQAAAAAAAABAAAABAAAAAAAAAAAAAAAB1ZlcnNpb24AAAAAAAAAAAAAAAAFQWdlbnQAAAAAAAAAAAAAAAAAAA1OZXh0TWFuZGF0ZUlkAAAAAAAAAAAAAAAAAAAVTmV4dE1hbmRhdGVQcm9wb3NhbElkAAAAAAAAAQAAAAAAAAAHTWFuZGF0ZQAAAAABAAAABAAAAAEAAAAAAAAAD01hbmRhdGVQcm9wb3NhbAAAAAABAAAABA==",
        "AAAAAQAAALlBdXRob3JpdHkgdGhhdCBvZmZpY2VycyBkZWxpYmVyYXRlbHkgZGVsZWdhdGUgdG8gdGhlIHBvb2wncyBpc29sYXRlZCBhZ2VudC4KUmVjaXBpZW50LCBjYXRlZ29yeSwgYW5kIGFtb3VudCBhcmUgaW1tdXRhYmxlIHVudGlsIGFub3RoZXIgdGhyZXNob2xkLWFwcHJvdmVkCnByb3Bvc2FsIHJlcGxhY2VzIHRoZSBtYW5kYXRlLgAAAAAAAAAAAAAHTWFuZGF0ZQAAAAAOAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACGNhdGVnb3J5AAAAEQAAAI9IYXNoIG9mIHRoZSBub3JtYWxpemVkIG9mZi1jaGFpbiBjb25kaXRpb24uIEl0IGlzIGFuIGF1ZGl0IGNvbW1pdG1lbnQ7CmNvbmRpdGlvbnMgbWF5IGRlbGF5IGV4ZWN1dGlvbiBidXQgY2Fubm90IGV4cGFuZCB0aGUgb24tY2hhaW4gYWxsb3dhbmNlLgAAAAAOY29uZGl0aW9uX2hhc2gAAAAAA+4AAAAgAAAAAAAAAApleGVjdXRpb25zAAAAAAAEAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAQaW50ZXJ2YWxfc2Vjb25kcwAAAAYAAAAAAAAAEGxhc3RfZXhlY3V0ZWRfYXQAAAAGAAAAAAAAAA5tYXhfZXhlY3V0aW9ucwAAAAAABAAAAAAAAAALbWluX2JhbGFuY2UAAAAACwAAAAAAAAAKbm90X2JlZm9yZQAAAAAABgAAAAAAAAAGcGF1c2VkAAAAAAABAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAdyZXZva2VkAAAAAAE=",
        "AAAAAQAAADZBIHNwZW5kIGNhdGVnb3J5IGFuZCBpdHMgcGVyLXNwZW5kIGNhcCAoMCA9IG5vIGxpbWl0KS4AAAAAAAAAAAAMQ2F0ZWdvcnlJbmZvAAAAAgAAAAAAAAAFbGltaXQAAAAAAAALAAAAAAAAAARuYW1lAAAAEQ==",
        "AAAAAQAAAEJBIHByb3Bvc2VkIGRpc2J1cnNlbWVudCwgYW5kIHRoZSBhcHByb3ZhbHMgaXQgaGFzIGdhdGhlcmVkIHNvIGZhci4AAAAAAAAAAAAMU3BlbmRSZXF1ZXN0AAAACAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlhcHByb3ZhbHMAAAAAAAPqAAAAEwAAAAAAAAAIY2F0ZWdvcnkAAAARAAAAAAAAAAhleGVjdXRlZAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAARtZW1vAAAAEAAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAAT",
        "AAAAAgAAAAAAAAAAAAAADU1hbmRhdGVBY3Rpb24AAAAAAAADAAAAAAAAAAAAAAAIQWN0aXZhdGUAAAAAAAAAAAAAAAZSZXN1bWUAAAAAAAAAAAAAAAAABlJldm9rZQAA",
        "AAAAAQAAAAAAAAAAAAAAD01hbmRhdGVQcm9wb3NhbAAAAAAFAAAAAAAAAAZhY3Rpb24AAAAAB9AAAAANTWFuZGF0ZUFjdGlvbgAAAAAAAAAAAAAJYXBwcm92YWxzAAAAAAAD6gAAABMAAAAAAAAACWZpbmFsaXplZAAAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAdtYW5kYXRlAAAAB9AAAAAHTWFuZGF0ZQA=",
        "AAAAAAAAACRBbm90aGVyIG9mZmljZXIgYWRkcyB0aGVpciBhcHByb3ZhbC4AAAAHYXBwcm92ZQAAAAACAAAAAAAAAAdvZmZpY2VyAAAAABMAAAAAAAAACHNwZW5kX2lkAAAABAAAAAA=",
        "AAAAAAAAAJRSZWxlYXNlIHRoZSBmdW5kcyDigJQgcGVybWlzc2lvbmxlc3MsIGJ1dCByZXZlcnRzIHVubGVzcyB0aGUgYXBwcm92YWwKdGhyZXNob2xkIGlzIG1ldC4gQW55b25lIGluIHRoZSBncm91cCBjYW4gcHVzaCB0aGUgYnV0dG9uIG9uY2Ugb2ZmaWNlcnMgYWdyZWUuAAAAB2V4ZWN1dGUAAAAAAQAAAAAAAAAIc3BlbmRfaWQAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAJZ2V0X2FnZW50AAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAAAAAAAJZ2V0X3NwZW5kAAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6AAAB9AAAAAMU3BlbmRSZXF1ZXN0",
        "AAAAAAAAAEpBIG1lbWJlciBwdWxscyB0aGVpciBjb250cmlidXRpb24gKGluIHRoZSBwb29sZWQgdG9rZW4pIGludG8gdGhlIHRyZWFzdXJ5LgAAAAAACmNvbnRyaWJ1dGUAAAAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAADlBbGwgc3BlbmQgcmVxdWVzdHMgKHBlbmRpbmcgKyBleGVjdXRlZCksIG5ld2VzdCBpZHMgbGFzdC4AAAAAAAAKZ2V0X3NwZW5kcwAAAAAAAAAAAAEAAAPqAAAH0AAAAAxTcGVuZFJlcXVlc3Q=",
        "AAAAAAAAAIlPbmUtdGltZSBzZXR1cC4gYGxpbWl0c1tpXWAgaXMgdGhlIHBlci1zcGVuZCBjYXAgZm9yIGBjYXRlZ29yaWVzW2ldYAoodXNlIDAgZm9yICJubyBsaW1pdCIpLiBgdGhyZXNob2xkYCBvZmZpY2VycyBtdXN0IGFwcHJvdmUgYW55IHNwZW5kLgAAAAAAAAppbml0aWFsaXplAAAAAAAFAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACG9mZmljZXJzAAAD6gAAABMAAAAAAAAACXRocmVzaG9sZAAAAAAAAAQAAAAAAAAACmNhdGVnb3JpZXMAAAAAA+oAAAARAAAAAAAAAAZsaW1pdHMAAAAAA+oAAAALAAAAAA==",
        "AAAAAAAAAAAAAAALZ2V0X2JhbGFuY2UAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAALZ2V0X21hbmRhdGUAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6AAAB9AAAAAHTWFuZGF0ZQA=",
        "AAAAAAAAAAAAAAALZ2V0X21lbWJlcnMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAALZ2V0X3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAMZ2V0X21hbmRhdGVzAAAAAAAAAAEAAAPqAAAH0AAAAAdNYW5kYXRlAA==",
        "AAAAAAAAAAAAAAAMZ2V0X29mZmljZXJzAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAANZ2V0X3RocmVzaG9sZAAAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAEhBZ2VudC1jb21wYXRpYmxlIGluaXRpYWxpemF0aW9uLiBFeGlzdGluZyB2MSBlbnRyeSBwb2ludHMgcmVtYWluIGludGFjdC4AAAANaW5pdGlhbGl6ZV92MgAAAAAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIb2ZmaWNlcnMAAAPqAAAAEwAAAAAAAAAJdGhyZXNob2xkAAAAAAAABAAAAAAAAAAKY2F0ZWdvcmllcwAAAAAD6gAAABEAAAAAAAAABmxpbWl0cwAAAAAD6gAAAAsAAAAAAAAABWFnZW50AAAAAAAAEwAAAAA=",
        "AAAAAAAAAEhBbnkgb2ZmaWNlciBtYXkgaW1tZWRpYXRlbHkgcmVkdWNlIGF1dGhvcml0eS4gUmVzdW1pbmcgbmVlZHMgYSBwcm9wb3NhbC4AAAANcGF1c2VfbWFuZGF0ZQAAAAAAAAIAAAAAAAAAB29mZmljZXIAAAAAEwAAAAAAAAAKbWFuZGF0ZV9pZAAAAAAABAAAAAA=",
        "AAAAAAAAAIlBbiBvZmZpY2VyIHByb3Bvc2VzIGEgc3BlbmQuIFJlamVjdGVkIG9uIHRoZSBzcG90IGlmIGl0IGJyZWFrcyB0aGUgY2F0ZWdvcnkKbGltaXQuIFRoZSBwcm9wb3NlcidzIG93biBhcHByb3ZhbCBpcyByZWNvcmRlZCBhdXRvbWF0aWNhbGx5LgAAAAAAAA1yZXF1ZXN0X3NwZW5kAAAAAAAABQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAhjYXRlZ29yeQAAABEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAEbWVtbwAAABAAAAABAAAABA==",
        "AAAAAAAAAEJTcGVuZCBjYXRlZ29yaWVzIGFuZCB0aGVpciBjYXBzIOKAlCBmZWVkcyB0aGUgYnVkZ2V0cyBVSSArIHRoZSBBSS4AAAAAAA5nZXRfY2F0ZWdvcmllcwAAAAAAAAAAAAEAAAPqAAAH0AAAAAxDYXRlZ29yeUluZm8=",
        "AAAAAAAAAH9Nb3ZlIHRoZSBleGFjdCBwcmUtYXBwcm92ZWQgYW1vdW50IHRvIHRoZSBleGFjdCBwcmUtYXBwcm92ZWQgcmVjaXBpZW50LgpUaGUgbW9kZWwgc3VwcGxpZXMgb25seSBhIG1hbmRhdGUgaWQgYW5kIGFuIGF1ZGl0IG1lbW8uAAAAAA9leGVjdXRlX21hbmRhdGUAAAAAAwAAAAAAAAAFYWdlbnQAAAAAAAATAAAAAAAAAAptYW5kYXRlX2lkAAAAAAAEAAAAAAAAAARtZW1vAAAAEAAAAAA=",
        "AAAAAAAAAIhQcm9wb3NlIGEgZml4ZWQgYXV0b25vbW91cyBwYXltZW50IGFsbG93YW5jZS4gVGhlIHByb3Bvc2VyIGF1dG8tYXBwcm92ZXM7CmFjdGl2YXRpb24gc3RpbGwgcmVxdWlyZXMgdGhlIHBvb2wncyBub3JtYWwgb2ZmaWNlciB0aHJlc2hvbGQuAAAAD3Byb3Bvc2VfbWFuZGF0ZQAAAAAKAAAAAAAAAAhwcm9wb3NlcgAAABMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACGNhdGVnb3J5AAAAEQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAApub3RfYmVmb3JlAAAAAAAGAAAAAAAAABBpbnRlcnZhbF9zZWNvbmRzAAAABgAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAObWF4X2V4ZWN1dGlvbnMAAAAAAAQAAAAAAAAAC21pbl9iYWxhbmNlAAAAAAsAAAAAAAAADmNvbmRpdGlvbl9oYXNoAAAAAAPuAAAAIAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAQZ2V0X2NvbnRyaWJ1dGlvbgAAAAEAAAAAAAAAA3dobwAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAARZ2V0X25leHRfc3BlbmRfaWQAAAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAUZ2V0X21hbmRhdGVfcHJvcG9zYWwAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPoAAAH0AAAAA9NYW5kYXRlUHJvcG9zYWwA",
        "AAAAAAAAAI9Qcm9wb3NlIHJlc3VtaW5nIG9yIHJldm9raW5nIGFuIGV4aXN0aW5nIG1hbmRhdGUuIFJlc3RyaWN0aXZlIGVtZXJnZW5jeQpwYXVzZSBpcyBpbW1lZGlhdGU7IGV4cGFuZGluZyBhdXRob3JpdHkgYWx3YXlzIGdvZXMgdGhyb3VnaCBnb3Zlcm5hbmNlLgAAAAAWcHJvcG9zZV9tYW5kYXRlX2FjdGlvbgAAAAAAAwAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAptYW5kYXRlX2lkAAAAAAAEAAAAAAAAAAZhY3Rpb24AAAAAB9AAAAANTWFuZGF0ZUFjdGlvbgAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAYYXBwcm92ZV9tYW5kYXRlX3Byb3Bvc2FsAAAAAgAAAAAAAAAHb2ZmaWNlcgAAAAATAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAAEAAAAAA==",
        "AAAAAAAAAEZQZXJtaXNzaW9ubGVzcyBmaW5hbGl6YXRpb24gYWZ0ZXIgb2ZmaWNlcnMgaGF2ZSBhcHByb3ZlZCB0aGUgcHJvcG9zYWwuAAAAAAAZZmluYWxpemVfbWFuZGF0ZV9wcm9wb3NhbAAAAAAAAAEAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAQAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    approve: this.txFromJSON<null>,
        execute: this.txFromJSON<null>,
        get_agent: this.txFromJSON<Option<string>>,
        get_spend: this.txFromJSON<Option<SpendRequest>>,
        contribute: this.txFromJSON<null>,
        get_spends: this.txFromJSON<Array<SpendRequest>>,
        initialize: this.txFromJSON<null>,
        get_balance: this.txFromJSON<i128>,
        get_mandate: this.txFromJSON<Option<Mandate>>,
        get_members: this.txFromJSON<Array<string>>,
        get_version: this.txFromJSON<u32>,
        get_mandates: this.txFromJSON<Array<Mandate>>,
        get_officers: this.txFromJSON<Array<string>>,
        get_threshold: this.txFromJSON<u32>,
        initialize_v2: this.txFromJSON<null>,
        pause_mandate: this.txFromJSON<null>,
        request_spend: this.txFromJSON<u32>,
        get_categories: this.txFromJSON<Array<CategoryInfo>>,
        execute_mandate: this.txFromJSON<null>,
        propose_mandate: this.txFromJSON<u32>,
        get_contribution: this.txFromJSON<i128>,
        get_next_spend_id: this.txFromJSON<u32>,
        get_mandate_proposal: this.txFromJSON<Option<MandateProposal>>,
        propose_mandate_action: this.txFromJSON<u32>,
        approve_mandate_proposal: this.txFromJSON<null>,
        finalize_mandate_proposal: this.txFromJSON<null>
  }
}
