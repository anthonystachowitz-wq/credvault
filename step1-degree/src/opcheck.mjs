import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { networkConfig, projectRoot } from './common.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'packages', 'STU-001.package.json'), 'utf-8'));
const pdp = indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS);
const cs = await pdp.queryContractState(pkg.contractAddress);
const csV8 = ledger.ContractState.deserialize(cs.serialize());
const refState = ledger.LedgerState.blank('undeployed').updateIndex(pkg.contractAddress, csV8.data, new Map());
const indexed = refState.index(pkg.contractAddress);
console.log('before: vk?', indexed.operation('verifyMinGPA')?.verifierKey?.length ?? 'MISSING');
for (const name of ['verifyMinGPA', 'revokeCredential', 'addCohortRoot']) {
  indexed.setOperation(name, csV8.operation(name));
}
const after = refState.index(pkg.contractAddress);
console.log('after setOperation: vk?', after.operation('verifyMinGPA')?.verifierKey?.length ?? 'MISSING');
process.exit(0);
