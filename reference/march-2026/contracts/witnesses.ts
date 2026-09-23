import { WitnessContext } from '@midnight-ntwrk/compact-runtime';

/**
 * TranscriptPrivateState - Stores the student's private GPA and salt
 * This never goes on the blockchain. It stays on the student's local machine.
 * 
 * gpa: bigint - GPA stored as integer (e.g., 385n = 3.85 GPA)
 * salt: Uint8Array - 32-byte salt for commitment
 */
export type TranscriptPrivateState = {
  gpa: bigint;
  salt: Uint8Array;
};

/**
 * Witnesses implementation for the transcript contract
 * 
 * Witnesses are functions that provide private data to the contract
 * without revealing that data on the public blockchain.
 * 
 * When a student wants to prove their GPA meets a requirement:
 * 1. The contract calls gpaValue() and gpaSalt() to get private values
 * 2. The witnesses read from local private state
 * 3. The contract uses the values to verify commitment and generate ZK proof
 * 4. Only the proof (not the GPA or salt) goes on-chain
 */
export const witnesses = {
  /**
   * gpaValue - Returns the student's private GPA
   * 
   * @param context - WitnessContext containing privateState
   * @returns [newPrivateState, gpaValue] - Tuple of (updated state, return value)
   */
  gpaValue: ({
    privateState,
  }: WitnessContext<any, TranscriptPrivateState>): [TranscriptPrivateState, bigint] => {
    return [privateState, privateState.gpa];
  },

  /**
   * gpaSalt - Returns the student's private salt
   * 
   * @param context - WitnessContext containing privateState
   * @returns [newPrivateState, salt] - Tuple of (updated state, return value)
   */
  gpaSalt: ({
    privateState,
  }: WitnessContext<any, TranscriptPrivateState>): [TranscriptPrivateState, Uint8Array] => {
    return [privateState, privateState.salt];
  },
};
