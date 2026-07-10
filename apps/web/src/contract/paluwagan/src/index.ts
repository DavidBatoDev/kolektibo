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
    contractId: "CBX7WXQ5STPXPR2K3YFEBMPLMMDFBEIVPUVJTTPBSVJNWBG5WVGIL4SW",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"TooFewMembers"},
  3: {message:"NonPositiveAmount"},
  4: {message:"NotMember"},
  5: {message:"AlreadyContributed"},
  6: {message:"Completed"},
  7: {message:"NotAllContributed"}
}

export type DataKey = {tag: "Token", values: void} | {tag: "Members", values: void} | {tag: "Contribution", values: void} | {tag: "CurrentCycle", values: void} | {tag: "Paid", values: readonly [u32, string]};

export interface Client {
  /**
   * Construct and simulate a has_paid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_paid: ({cycle, who}: {cycle: u32, who: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a contribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A member pays their fixed contribution for the current cycle.
   */
  contribute: ({from}: {from: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. `members` is BOTH the roster and the payout order:
   * the member at index `i` receives the pot in cycle `i`.
   */
  initialize: ({token, members, contribution}: {token: string, members: Array<string>, contribution: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a paid_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many members have paid in `cycle` (for progress UI).
   */
  paid_count: ({cycle}: {cycle: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_balance: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_members transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_members: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a is_complete transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_complete: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a total_cycles transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_cycles: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a advance_cycle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permissionless: once EVERY member has paid this cycle, rotate the whole
   * pot to this cycle's recipient and advance. Reverts otherwise.
   */
  advance_cycle: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_contribution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_contribution: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_current_cycle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_current_cycle: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_payout_recipient transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Who receives the pot in `cycle` (members[cycle]).
   */
  get_payout_recipient: ({cycle}: {cycle: u32}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA1Ub29GZXdNZW1iZXJzAAAAAAAAAgAAAAAAAAARTm9uUG9zaXRpdmVBbW91bnQAAAAAAAADAAAAAAAAAAlOb3RNZW1iZXIAAAAAAAAEAAAAAAAAABJBbHJlYWR5Q29udHJpYnV0ZWQAAAAAAAUAAAAAAAAACUNvbXBsZXRlZAAAAAAAAAYAAAAAAAAAEU5vdEFsbENvbnRyaWJ1dGVkAAAAAAAABw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABVRva2VuAAAAAAAAAAAAAAAAAAAHTWVtYmVycwAAAAAAAAAAAAAAAAxDb250cmlidXRpb24AAAAAAAAAAAAAAAxDdXJyZW50Q3ljbGUAAAABAAAAKUhhcyBgQWRkcmVzc2AgY29udHJpYnV0ZWQgaW4gY3ljbGUgYHUzMmA/AAAAAAAABFBhaWQAAAACAAAABAAAABM=",
        "AAAAAAAAAAAAAAAIaGFzX3BhaWQAAAACAAAAAAAAAAVjeWNsZQAAAAAAAAQAAAAAAAAAA3dobwAAAAATAAAAAQAAAAE=",
        "AAAAAAAAAD1BIG1lbWJlciBwYXlzIHRoZWlyIGZpeGVkIGNvbnRyaWJ1dGlvbiBmb3IgdGhlIGN1cnJlbnQgY3ljbGUuAAAAAAAACmNvbnRyaWJ1dGUAAAAAAAEAAAAAAAAABGZyb20AAAATAAAAAA==",
        "AAAAAAAAAHlPbmUtdGltZSBzZXR1cC4gYG1lbWJlcnNgIGlzIEJPVEggdGhlIHJvc3RlciBhbmQgdGhlIHBheW91dCBvcmRlcjoKdGhlIG1lbWJlciBhdCBpbmRleCBgaWAgcmVjZWl2ZXMgdGhlIHBvdCBpbiBjeWNsZSBgaWAuAAAAAAAACmluaXRpYWxpemUAAAAAAAMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAHbWVtYmVycwAAAAPqAAAAEwAAAAAAAAAMY29udHJpYnV0aW9uAAAACwAAAAA=",
        "AAAAAAAAADhIb3cgbWFueSBtZW1iZXJzIGhhdmUgcGFpZCBpbiBgY3ljbGVgIChmb3IgcHJvZ3Jlc3MgVUkpLgAAAApwYWlkX2NvdW50AAAAAAABAAAAAAAAAAVjeWNsZQAAAAAAAAQAAAABAAAABA==",
        "AAAAAAAAAAAAAAALZ2V0X2JhbGFuY2UAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAALZ2V0X21lbWJlcnMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAALaXNfY29tcGxldGUAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAMdG90YWxfY3ljbGVzAAAAAAAAAAEAAAAE",
        "AAAAAAAAAIVQZXJtaXNzaW9ubGVzczogb25jZSBFVkVSWSBtZW1iZXIgaGFzIHBhaWQgdGhpcyBjeWNsZSwgcm90YXRlIHRoZSB3aG9sZQpwb3QgdG8gdGhpcyBjeWNsZSdzIHJlY2lwaWVudCBhbmQgYWR2YW5jZS4gUmV2ZXJ0cyBvdGhlcndpc2UuAAAAAAAADWFkdmFuY2VfY3ljbGUAAAAAAAAAAAAAAA==",
        "AAAAAAAAAAAAAAAQZ2V0X2NvbnRyaWJ1dGlvbgAAAAAAAAABAAAACw==",
        "AAAAAAAAAAAAAAARZ2V0X2N1cnJlbnRfY3ljbGUAAAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAADFXaG8gcmVjZWl2ZXMgdGhlIHBvdCBpbiBgY3ljbGVgIChtZW1iZXJzW2N5Y2xlXSkuAAAAAAAAFGdldF9wYXlvdXRfcmVjaXBpZW50AAAAAQAAAAAAAAAFY3ljbGUAAAAAAAAEAAAAAQAAABM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    has_paid: this.txFromJSON<boolean>,
        contribute: this.txFromJSON<null>,
        initialize: this.txFromJSON<null>,
        paid_count: this.txFromJSON<u32>,
        get_balance: this.txFromJSON<i128>,
        get_members: this.txFromJSON<Array<string>>,
        is_complete: this.txFromJSON<boolean>,
        total_cycles: this.txFromJSON<u32>,
        advance_cycle: this.txFromJSON<null>,
        get_contribution: this.txFromJSON<i128>,
        get_current_cycle: this.txFromJSON<u32>,
        get_payout_recipient: this.txFromJSON<string>
  }
}