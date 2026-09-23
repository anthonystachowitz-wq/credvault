import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { networkConfig, projectRoot } from './common';
import * as fs from 'node:fs';
import * as path from 'node:path';
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'packages', 'STU-001.package.json'), 'utf-8'));
const pdp = indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS);
const cs = await pdp.queryContractState(pkg.contractAddress);
console.log('contractState ctor:', (cs as any)?.constructor?.name);
console.log('typeof cs.data:', typeof (cs as any).data);
console.log('cs.data ctor:', (cs as any).data?.constructor?.name);
if (cs) {
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(cs));
  console.log('cs methods:', proto.filter((m) => !m.startsWith('_')).join(', '));
}
process.exit(0);
