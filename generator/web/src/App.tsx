import React, { useEffect, useState } from 'react';
import type { VerificationSchema, Field, Operator } from './lib/schema-types';

interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  issuerType: string;
  path: string;
  tags: string[];
}


const DEFAULT_SCHEMA: VerificationSchema = {
  schemaVersion: '0.3',
  name: 'my-credential',
  displayName: 'My Credential Verification',
  issuerType: 'organization',
  domainPrefix: 'credvault:',
  packageFormat: 'credvault-my-credential/0.3',
  privateStateId: 'credvaultMyCredentialState',
  fields: [],
  revocation: { enabled: true, cadence: 'batch' },
  issuerRuntime: { mode: 'batch', preMint: ['L1', 'L2'], novelProofs: 'on-request' },
  fees: { enabled: false },
};

const FIELD_TEMPLATES: Record<Field['kind'], () => Field> = {
  directMatch: () => ({
    kind: 'directMatch',
    name: 'fieldName',
    type: 'string',
    disclosure: ['reveal'],
  }),
  conditional: () => ({
    kind: 'conditional',
    name: 'metricName',
    type: 'uint',
    scale: 1,
    uintBits: 64,
    disclosure: ['reveal'],
    conditional: { operators: ['gte'], criteria: [{ op: 'gte', value: '0' }], novelThresholds: 'on-request' },
  }),
  matchSet: () => ({
    kind: 'matchSet',
    name: 'items',
    maxItems: 100,
    itemFields: [{ name: 'id', type: 'string' }],
    verification: { individual: true, group: true, selected: 'individual' },
    disclosure: ['reveal', 'subset'],
  }),
};

function uniqueName(schema: VerificationSchema, base: string): string {
  let i = 1;
  let name = base;
  while (schema.fields.some((f) => f.name === name)) name = base + i++;
  return name;
}

export default function App() {
  const [schema, setSchema] = useState<VerificationSchema>(DEFAULT_SCHEMA);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(true);

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setTemplates(data.templates);
      })
      .catch(() => setTemplates([]));
  }, []);

  const loadTemplate = async (id: string) => {
    const res = await fetch(`/api/templates/${id}`);
    const data = await res.json();
    if (data.ok) {
      setSchema(data.schema);
      setShowTemplatePicker(false);
    }
  };

  const startBlank = () => setShowTemplatePicker(false);

  const [activeTab, setActiveTab] = useState<'builder' | 'json'>('builder');

  useEffect(() => {
    setJsonText(JSON.stringify(schema, null, 2));
    setJsonError(null);
  }, [schema]);

  const updateJson = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setSchema(parsed);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  const updateField = (index: number, patch: Partial<Field>) => {
    const next = { ...schema, fields: schema.fields.map((f: Field, i: number) => (i === index ? { ...f, ...patch } as Field : f)) };
    setSchema(next);
  };

  const removeField = (index: number) => {
    setSchema({ ...schema, fields: schema.fields.filter((_f: Field, i: number) => i !== index) });
  };

  const addField = (kind: Field['kind']) => {
    const base = FIELD_TEMPLATES[kind]();
    base.name = uniqueName(schema, base.name);
    setSchema({ ...schema, fields: [...schema.fields, base] });
  };

  const moveField = (from: number, to: number) => {
    const fields = [...schema.fields];
    const [moved] = fields.splice(from, 1);
    fields.splice(to, 0, moved);
    setSchema({ ...schema, fields });
  };

  const generate = async () => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema }),
    });
    const data = await res.json();
    alert(data.ok ? 'Artifacts generated in output/' : 'Error: ' + data.error);
  };

  return (
    <div className="min-h-screen p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CredVault Schema Builder</h1>
          <p className="text-sm text-slate-500">No-code questionnaire for per-issuer verification contracts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadJson(schema)} className="rounded bg-slate-200 px-3 py-2 text-sm hover:bg-slate-300">Export JSON</button>
          <label className="cursor-pointer rounded bg-slate-200 px-3 py-2 text-sm hover:bg-slate-300">
            Import JSON
            <input type="file" accept=".json" className="hidden" onChange={(e) => uploadJson(e, setSchema)} />
          </label>
          <button onClick={generate} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Generate Artifacts</button>
        </div>
      </header>

      <div className="mb-4 flex gap-4 border-b border-slate-200">
        <button onClick={() => setActiveTab('builder')} className={`pb-2 text-sm font-medium ${activeTab === 'builder' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>Visual Builder</button>
        <button onClick={() => setActiveTab('json')} className={`pb-2 text-sm font-medium ${activeTab === 'json' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>JSON Editor</button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={activeTab === 'builder' ? '' : 'hidden lg:block'}>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 font-semibold">Schema Settings</h2>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="text-sm">
                Name
                <input value={schema.name} onChange={(e) => setSchema({ ...schema, name: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-sm">
                Display Name
                <input value={schema.displayName} onChange={(e) => setSchema({ ...schema, displayName: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-sm">
                Issuer Type
                <input value={schema.issuerType} onChange={(e) => setSchema({ ...schema, issuerType: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-sm">
                Package Format
                <input value={schema.packageFormat} onChange={(e) => setSchema({ ...schema, packageFormat: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
            </div>

            <h2 className="mb-3 font-semibold">Fields</h2>
            <div className="space-y-3">
              {schema.fields.map((field: Field, i: number) => (
                <FieldCard
                  key={i}
                  index={i}
                  field={field}
                  onChange={(p) => updateField(i, p)}
                  onRemove={() => removeField(i)}
                  dragIndex={dragIndex}
                  setDragIndex={setDragIndex}
                  onMove={moveField}
                />
              ))}
              {schema.fields.length === 0 && <p className="text-sm text-slate-400 italic">No fields yet. Add one below.</p>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => addField('directMatch')} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">+ Direct Field</button>
              <button onClick={() => addField('conditional')} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">+ Metric / Threshold</button>
              <button onClick={() => addField('matchSet')} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">+ Item Set</button>
            </div>
          </div>
        </section>

        <section className={activeTab === 'json' ? '' : 'hidden lg:block'}>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold">Schema JSON</h2>
            <p className="mb-2 text-xs text-slate-500">Edit directly or use the visual builder. Valid JSON syncs both panels.</p>
            <textarea
              value={jsonText}
              onChange={(e) => updateJson(e.target.value)}
              className="h-[600px] w-full rounded border border-slate-300 bg-slate-50 p-3 font-mono text-xs"
              spellCheck={false}
            />
            {jsonError && <p className="mt-2 text-xs text-red-600">{jsonError}</p>}
          </div>
        </section>

      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-xl font-bold">Start from a template</h2>
            <p className="mb-4 text-sm text-slate-500">Choose a pre-built verification template, or start blank.</p>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadTemplate(t.id)}
                  className="rounded border border-slate-200 bg-slate-50 p-4 text-left hover:border-blue-400 hover:bg-blue-50"
                >
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.description}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.tags.map((tag) => (
                      <span key={tag} className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={startBlank} className="rounded bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200">Start blank</button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

function FieldCard({
  index,
  field,
  onChange,
  onRemove,
  dragIndex,
  setDragIndex,
  onMove,
}: {
  index: number;
  field: Field;
  onChange: (p: Partial<Field>) => void;
  onRemove: () => void;
  dragIndex: number | null;
  setDragIndex: (i: number | null) => void;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => setDragIndex(index)}
      onDragOver={(e) => {
        e.preventDefault();
        if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
      }}
      onDragEnd={() => setDragIndex(null)}
      className="cursor-move rounded border border-slate-200 bg-slate-50 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{field.kind}</span>
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline">Remove</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Name
          <input value={field.name} onChange={(e) => onChange({ name: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
        </label>
        {field.kind === 'directMatch' && (
          <>
            <label className="text-sm">
              Type
              <select value={field.type} onChange={(e) => onChange({ type: e.target.value as any })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
                <option value="string">string</option>
                <option value="uint">uint</option>
                <option value="boolean">boolean</option>
                <option value="timestamp">timestamp</option>
              </select>
            </label>
            <label className="text-sm">
              Disclosure
              <select
                value={field.disclosure.join(',')}
                onChange={(e) => onChange({ disclosure: e.target.value.split(',') as any })}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="reveal">reveal</option>
                <option value="reveal,equality">reveal + equality</option>
                <option value="equality">equality</option>
              </select>
            </label>
          </>
        )}
        {field.kind === 'conditional' && (
          <>
            <label className="text-sm">
              Scale
              <input type="number" value={field.scale} onChange={(e) => onChange({ scale: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
            </label>
            <label className="text-sm">
              Operators
              <input
                value={field.conditional.operators.join(',')}
                onChange={(e) => onChange({ conditional: { ...field.conditional, operators: e.target.value.split(',') as Operator[] } })}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="col-span-2 text-sm">
              Criteria (comma-separated values)
              <input
                value={field.conditional.criteria.map((c: any) => c.value).join(', ')}
                onChange={(e) =>
                  onChange({
                    conditional: {
                      ...field.conditional,
                      criteria: e.target.value.split(',').map((v) => ({ op: field.conditional.operators[0], value: v.trim() })),
                    },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          </>
        )}
        {field.kind === 'matchSet' && (
          <>
            <label className="text-sm">
              Max Items
              <input type="number" value={field.maxItems} onChange={(e) => onChange({ maxItems: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
            </label>
            <label className="text-sm">
              Mode
              <select
                value={field.verification.selected}
                onChange={(e) => onChange({ verification: { ...field.verification, selected: e.target.value as any } })}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="individual">individual</option>
                <option value="group">group</option>
              </select>
            </label>
            <label className="col-span-2 text-sm">
              Item Fields (name:type, comma-separated)
              <input
                value={field.itemFields.map((f: any) => f.name + ':' + f.type).join(', ')}
                onChange={(e) =>
                  onChange({
                    itemFields: e.target.value.split(',').map((part) => {
                      const [name, type] = part.trim().split(':');
                      return { name, type: (type || 'string') as any };
                    }),
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          </>
        )}
      </div>
    
    </div>
  );
}

function downloadJson(schema: VerificationSchema) {
  const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = schema.name + '.schema.json';
  a.click();
  URL.revokeObjectURL(url);
}

function uploadJson(e: React.ChangeEvent<HTMLInputElement>, setSchema: (s: VerificationSchema) => void) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      setSchema(JSON.parse(String(reader.result)));
    } catch (err: any) {
      alert('Invalid JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}