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


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2",
  }
} as const

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
  10: {message:"NonPositiveAmount"}
}

export type DataKey = {tag: "Token", values: void} | {tag: "Officers", values: void} | {tag: "Threshold", values: void} | {tag: "NextSpendId", values: void} | {tag: "Members", values: void} | {tag: "Categories", values: void} | {tag: "CategoryLimit", values: readonly [string]} | {tag: "Contribution", values: readonly [string]} | {tag: "Spend", values: readonly [u32]};


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
   * Construct and simulate a get_members transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_members: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_officers transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_officers: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_threshold: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
   * Construct and simulate a get_contribution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_contribution: ({who}: {who: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_next_spend_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_next_spend_id: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACgAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAApOb3RPZmZpY2VyAAAAAAACAAAAAAAAABFPdmVyQ2F0ZWdvcnlMaW1pdAAAAAAAAAMAAAAAAAAADVNwZW5kTm90Rm91bmQAAAAAAAAEAAAAAAAAAA9BbHJlYWR5RXhlY3V0ZWQAAAAABQAAAAAAAAASTm90RW5vdWdoQXBwcm92YWxzAAAAAAAGAAAAAAAAAA9BbHJlYWR5QXBwcm92ZWQAAAAABwAAAAAAAAALSW52YWxpZEluaXQAAAAACAAAAAAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAAAJAAAAAAAAABFOb25Qb3NpdGl2ZUFtb3VudAAAAAAAAAo=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAAAAAAAAAAABVRva2VuAAAAAAAAAAAAAAAAAAAIT2ZmaWNlcnMAAAAAAAAAAAAAAAlUaHJlc2hvbGQAAAAAAAAAAAAAAAAAAAtOZXh0U3BlbmRJZAAAAAAAAAAAAAAAAAdNZW1iZXJzAAAAAAAAAAAAAAAACkNhdGVnb3JpZXMAAAAAAAEAAAAAAAAADUNhdGVnb3J5TGltaXQAAAAAAAABAAAAEQAAAAEAAAAAAAAADENvbnRyaWJ1dGlvbgAAAAEAAAATAAAAAQAAAAAAAAAFU3BlbmQAAAAAAAABAAAABA==",
        "AAAAAQAAADZBIHNwZW5kIGNhdGVnb3J5IGFuZCBpdHMgcGVyLXNwZW5kIGNhcCAoMCA9IG5vIGxpbWl0KS4AAAAAAAAAAAAMQ2F0ZWdvcnlJbmZvAAAAAgAAAAAAAAAFbGltaXQAAAAAAAALAAAAAAAAAARuYW1lAAAAEQ==",
        "AAAAAQAAAEJBIHByb3Bvc2VkIGRpc2J1cnNlbWVudCwgYW5kIHRoZSBhcHByb3ZhbHMgaXQgaGFzIGdhdGhlcmVkIHNvIGZhci4AAAAAAAAAAAAMU3BlbmRSZXF1ZXN0AAAACAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlhcHByb3ZhbHMAAAAAAAPqAAAAEwAAAAAAAAAIY2F0ZWdvcnkAAAARAAAAAAAAAAhleGVjdXRlZAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAARtZW1vAAAAEAAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAAT",
        "AAAAAAAAACRBbm90aGVyIG9mZmljZXIgYWRkcyB0aGVpciBhcHByb3ZhbC4AAAAHYXBwcm92ZQAAAAACAAAAAAAAAAdvZmZpY2VyAAAAABMAAAAAAAAACHNwZW5kX2lkAAAABAAAAAA=",
        "AAAAAAAAAJRSZWxlYXNlIHRoZSBmdW5kcyDigJQgcGVybWlzc2lvbmxlc3MsIGJ1dCByZXZlcnRzIHVubGVzcyB0aGUgYXBwcm92YWwKdGhyZXNob2xkIGlzIG1ldC4gQW55b25lIGluIHRoZSBncm91cCBjYW4gcHVzaCB0aGUgYnV0dG9uIG9uY2Ugb2ZmaWNlcnMgYWdyZWUuAAAAB2V4ZWN1dGUAAAAAAQAAAAAAAAAIc3BlbmRfaWQAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAJZ2V0X3NwZW5kAAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6AAAB9AAAAAMU3BlbmRSZXF1ZXN0",
        "AAAAAAAAAEpBIG1lbWJlciBwdWxscyB0aGVpciBjb250cmlidXRpb24gKGluIHRoZSBwb29sZWQgdG9rZW4pIGludG8gdGhlIHRyZWFzdXJ5LgAAAAAACmNvbnRyaWJ1dGUAAAAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAADlBbGwgc3BlbmQgcmVxdWVzdHMgKHBlbmRpbmcgKyBleGVjdXRlZCksIG5ld2VzdCBpZHMgbGFzdC4AAAAAAAAKZ2V0X3NwZW5kcwAAAAAAAAAAAAEAAAPqAAAH0AAAAAxTcGVuZFJlcXVlc3Q=",
        "AAAAAAAAAIlPbmUtdGltZSBzZXR1cC4gYGxpbWl0c1tpXWAgaXMgdGhlIHBlci1zcGVuZCBjYXAgZm9yIGBjYXRlZ29yaWVzW2ldYAoodXNlIDAgZm9yICJubyBsaW1pdCIpLiBgdGhyZXNob2xkYCBvZmZpY2VycyBtdXN0IGFwcHJvdmUgYW55IHNwZW5kLgAAAAAAAAppbml0aWFsaXplAAAAAAAFAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACG9mZmljZXJzAAAD6gAAABMAAAAAAAAACXRocmVzaG9sZAAAAAAAAAQAAAAAAAAACmNhdGVnb3JpZXMAAAAAA+oAAAARAAAAAAAAAAZsaW1pdHMAAAAAA+oAAAALAAAAAA==",
        "AAAAAAAAAAAAAAALZ2V0X2JhbGFuY2UAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAALZ2V0X21lbWJlcnMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAMZ2V0X29mZmljZXJzAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAANZ2V0X3RocmVzaG9sZAAAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAIlBbiBvZmZpY2VyIHByb3Bvc2VzIGEgc3BlbmQuIFJlamVjdGVkIG9uIHRoZSBzcG90IGlmIGl0IGJyZWFrcyB0aGUgY2F0ZWdvcnkKbGltaXQuIFRoZSBwcm9wb3NlcidzIG93biBhcHByb3ZhbCBpcyByZWNvcmRlZCBhdXRvbWF0aWNhbGx5LgAAAAAAAA1yZXF1ZXN0X3NwZW5kAAAAAAAABQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAhjYXRlZ29yeQAAABEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAEbWVtbwAAABAAAAABAAAABA==",
        "AAAAAAAAAEJTcGVuZCBjYXRlZ29yaWVzIGFuZCB0aGVpciBjYXBzIOKAlCBmZWVkcyB0aGUgYnVkZ2V0cyBVSSArIHRoZSBBSS4AAAAAAA5nZXRfY2F0ZWdvcmllcwAAAAAAAAAAAAEAAAPqAAAH0AAAAAxDYXRlZ29yeUluZm8=",
        "AAAAAAAAAAAAAAAQZ2V0X2NvbnRyaWJ1dGlvbgAAAAEAAAAAAAAAA3dobwAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAARZ2V0X25leHRfc3BlbmRfaWQAAAAAAAAAAAAAAQAAAAQ=" ]),
      options
    )
  }
  public readonly fromJSON = {
    approve: this.txFromJSON<null>,
        execute: this.txFromJSON<null>,
        get_spend: this.txFromJSON<Option<SpendRequest>>,
        contribute: this.txFromJSON<null>,
        get_spends: this.txFromJSON<Array<SpendRequest>>,
        initialize: this.txFromJSON<null>,
        get_balance: this.txFromJSON<i128>,
        get_members: this.txFromJSON<Array<string>>,
        get_officers: this.txFromJSON<Array<string>>,
        get_threshold: this.txFromJSON<u32>,
        request_spend: this.txFromJSON<u32>,
        get_categories: this.txFromJSON<Array<CategoryInfo>>,
        get_contribution: this.txFromJSON<i128>,
        get_next_spend_id: this.txFromJSON<u32>
  }
}