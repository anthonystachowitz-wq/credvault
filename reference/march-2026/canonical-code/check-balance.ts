// =============================================================================
// REFERENCE: check-balance.ts - Wallet Balance Checker
// SOURCE: /home/ubuntu/credvault-contract/src/utils/check-balance.ts
// STATUS: Working reference implementation
// USE CASE: Check wallet balances (tNIGHT and DUST) on preprod
// =============================================================================

import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, InMemoryTransactionHistoryStorage, PublicKey, createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v7';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as Rx from 'rxjs';
import { Buffer } from 'buffer';
import WebSocket from 'ws';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const networkConfig = {
  node: 'https://rpc.preprod.midnight.network',
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  proofServer: 'http://localhost:6300',
};

function deriveKeys(seedHex: string) {
  const hdWalletResult = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hdWalletResult.type !== 'seedOk') throw new Error('Invalid seed');
  
  const hdWallet = hdWalletResult.hdWallet;
  const accountKey = hdWallet.selectAccount(0);
  
  const keys = {} as Record<number, Uint8Array>;
  
  for (const role of [Roles.Zswap, Roles.NightExternal, Roles.Dust]) {
    const roleKey = accountKey.selectRole(role);
    const derivationResult = roleKey.deriveKeyAt(0);
    if (derivationResult.type !== 'keyDerived') {
      throw new Error('Failed to derive key for role');
    }
    keys[role] = derivationResult.key;
  }
  
  return keys;
}

async function main() {
  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) { console.error('No MIDNIGHT_WALLET_SEED set'); process.exit(1); }

  setNetworkId('preprod');
  const networkId = getNetworkId();

  const keys = deriveKeys(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: { indexerHttpUrl: networkConfig.indexer, indexerWsUrl: networkConfig.indexerWS },
    provingServerUrl: new URL(networkConfig.proofServer),
    relayURL: new URL(networkConfig.node.replace(/^http/, 'ws')),
  };

  const shieldedWallet = ShieldedWallet(walletConfig).startWithSecretKeys(shieldedSecretKeys);
  const unshieldedWallet = UnshieldedWallet({
    networkId,
    indexerClientConnection: walletConfig.indexerClientConnection,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

  const dustWallet = DustWallet({
    ...walletConfig,
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  }).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);

  const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log('Waiting for wallet to sync...\n');

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
    )
  );

  const unshieldedBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  const dustBalance = state.dust.walletBalance(new Date());

  console.log('Unshielded address:', unshieldedKeystore.getBech32Address());
  console.log('tNIGHT balance:', unshieldedBalance.toString());
  console.log('DUST balance:', dustBalance.toString());

  await wallet.stop();
}

main().catch(console.error);
