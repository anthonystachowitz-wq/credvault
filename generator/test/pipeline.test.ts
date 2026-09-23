import { describe, it, expect } from 'vitest';
import { parseSchema } from '../src/schemas/parser.js';
import { assertValid } from '../src/schemas/validator.js';
import { emitDescriptor, canonicalJson } from '../src/schemas/descriptor.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePackages } from '../src/runtime/package.js';
import { createHash } from 'node:crypto';
import { pad32 } from '../src/runtime/canonical.js';
import * as Step1 from '../../step1-degree/src/canonical.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const issuerSecret = createHash('sha256').update(pad32('credvault:dev-issuer-sk:')).digest();

function loadAst() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'college-degree.ast.json'), 'utf8'));
}

function commitStudentStep1(student: any, issuerSecret: Buffer) {
  const salts = {
    fullName: Step1.kdfSalt(issuerSecret, student.id, 'fullName'),
    degree: Step1.kdfSalt(issuerSecret, student.id, 'degree'),
    gpa: Step1.kdfSalt(issuerSecret, student.id, 'gpa'),
    master: Step1.kdfSalt(issuerSecret, student.id, 'master'),
  };
  const gpaCommit = Step1.compactCommitUint64(student.gpa, salts.gpa);
  const commits = [
    Step1.fieldCommit('fullName', student.fullName, salts.fullName),
    Step1.fieldCommit('degree', student.degree, salts.degree),
    gpaCommit,
  ];
  const courseSalts = student.courses.map((c: any) => Step1.kdfSalt(issuerSecret, student.id, 'course:' + c.code));
  const courseLeaves = student.courses.map((c: any, i: number) => Step1.courseLeaf(c, courseSalts[i]));
  const courseRoot = Step1.courseSubRoot(courseLeaves).root;
  const leaf = Step1.masterLeafV3(commits, courseRoot, salts.master);
  return { leaf, credId: Step1.credIdFromLeaf(leaf) };
}

describe('college-degree schema pipeline', () => {
  it('parses and validates the AST', () => {
    const ast = parseSchema(loadAst());
    assertValid(ast);
    expect(ast.name).toBe('college-degree');
    expect(ast.fields.length).toBe(4);
  });

  it('emits a descriptor with the expected layout', () => {
    const ast = parseSchema(loadAst());
    const d = emitDescriptor(ast);
    expect(d.schemaId).toBe('college-degree');
    expect(d.fields.map((f) => f.name)).toEqual(['fullName', 'degree', 'gpa']);
    expect(d.sets.map((s) => s.name)).toEqual(['courseGrades']);
    expect(d.leafLayout).toEqual(['field:fullName', 'field:degree', 'field:gpa', 'set:courseGrades']);
  });

  it('generates byte-equal packages to the step1-degree reference', () => {
    const ast = parseSchema(loadAst());
    const d = emitDescriptor(ast);
    const hash = createHash('sha256').update(canonicalJson(d)).digest('hex');
    const rawCohort = JSON.parse(fs.readFileSync(path.join(__dirname, '../../step1-degree/data/cohort.json'), 'utf8'));

    // step1-degree runtime expects scaled gpa values; generator expects raw values
    const scaledCohort = {
      issuer: { id: 'penn-state', displayName: rawCohort.issuer },
      cohort: rawCohort.cohort,
      students: rawCohort.students.map((s: any) => ({ ...s, courseGrades: s.courses })),
    };
    const rawCohortForGen = {
      ...scaledCohort,
      students: scaledCohort.students.map((s: any) => ({ ...s, gpa: s.gpa / 100 })),
    };

    const pkgs = generatePackages(d, hash, rawCohortForGen, issuerSecret, '0xDEADBEEF', 'undeployed');
    expect(pkgs.length).toBe(scaledCohort.students.length);
    expect(pkgs[0].holderRef).toBe('STU-001');

    const s1 = commitStudentStep1(scaledCohort.students[0], issuerSecret);
    expect(pkgs[0].masterLeaf).toBe(Step1.toHex(s1.leaf));
    expect(pkgs[0].credId).toBe(Step1.toHex(s1.credId));
  });
});