import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  issuerSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  fieldValue(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  fieldSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  addCohortRoot(context: __compactRuntime.CircuitContext<PS>, root_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifyRange(context: __compactRuntime.CircuitContext<PS>,
              credId_0: Uint8Array,
              fieldCommit_0: Uint8Array,
              min_0: bigint,
              max_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  addCohortRoot(context: __compactRuntime.CircuitContext<PS>, root_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifyRange(context: __compactRuntime.CircuitContext<PS>,
              credId_0: Uint8Array,
              fieldCommit_0: Uint8Array,
              min_0: bigint,
              max_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  addCohortRoot(context: __compactRuntime.CircuitContext<PS>, root_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifyRange(context: __compactRuntime.CircuitContext<PS>,
              credId_0: Uint8Array,
              fieldCommit_0: Uint8Array,
              min_0: bigint,
              max_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly authority: Uint8Array;
  validRoots: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  revoked: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
