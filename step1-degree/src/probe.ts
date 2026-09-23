// Step 2.2 — extract persistentCommit layout by matching against JS candidates
import { createHash } from 'node:crypto';
import { pureCircuits } from '../contracts/managed/probe/contract/index.js';

const sha256 = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return h.digest(); };
const hex = (b) => Buffer.from(b).toString('hex');

// Known test inputs
const x = 385n;                                    // GPA 3.85
const rand = Buffer.alloc(32, 7);                  // salt = 0x0707...07
const b32 = Buffer.alloc(32, 3);                   // bytes = 0x0303...03

const pcU = hex(pureCircuits.pcUint(x, rand));
const pcB = hex(pureCircuits.pcBytes(b32, rand));
const phP = hex(pureCircuits.phPair(b32, rand));
console.log('compact pcUint(385, 07..07):', pcU);
console.log('compact pcBytes(03.., 07..):', pcB);
console.log('compact phPair(03.., 07..): ', phP);

const le64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const be64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(n); return b; };
const pad32le = (n) => { const b = Buffer.alloc(32); b.writeBigUInt64LE(n); return b; };
const pad32be = (n) => { const b = Buffer.alloc(32); b.writeBigUInt64BE(n, 24); return b; };

const candidates = {
  'sha256(le64||rand)':      hex(sha256(le64(x), rand)),
  'sha256(be64||rand)':      hex(sha256(be64(x), rand)),
  'sha256(pad32le||rand)':   hex(sha256(pad32le(x), rand)),
  'sha256(pad32be||rand)':   hex(sha256(pad32be(x), rand)),
  'sha256(rand||le64)':      hex(sha256(rand, le64(x))),
  'sha256(rand||pad32le)':   hex(sha256(rand, pad32le(x))),
  'sha256(le64)':            hex(sha256(le64(x))),
  'sha256(pad32le)':         hex(sha256(pad32le(x))),
};
console.log('\n=== candidates for pcUint ===');
for (const [k, v] of Object.entries(candidates)) {
  console.log((v === pcU ? '✅ MATCH  ' : '           ') + k + ': ' + v);
}
const candidatesB = {
  'sha256(b||rand)':         hex(sha256(b32, rand)),
  'sha256(rand||b)':         hex(sha256(rand, b32)),
};
console.log('\n=== candidates for pcBytes ===');
for (const [k, v] of Object.entries(candidatesB)) {
  console.log((v === pcB ? '✅ MATCH  ' : '           ') + k + ': ' + v);
}
console.log('\n=== phPair check ===');
console.log('sha256(l||r) === phPair?', hex(sha256(b32, rand)) === phP ? '✅ MATCH' : 'no');
