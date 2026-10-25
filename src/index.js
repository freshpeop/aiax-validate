import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const manifestSchema = JSON.parse(readFileSync(new URL('../schemas/manifest.schema.json', import.meta.url), 'utf8'));
const sectionSchema = JSON.parse(readFileSync(new URL('../schemas/section.schema.json', import.meta.url), 'utf8'));
const validateManifest = ajv.compile(manifestSchema);
const validateSection = ajv.compile(sectionSchema);
const escapePointer = value => String(value).replaceAll('~','~0').replaceAll('/','~1');
function schemaErrors(validator, document, url) {
  if (validator(document)) return [];
  return (validator.errors ?? []).map(error => {
    const property = error.params.missingProperty ?? error.params.additionalProperty;
    const path = error.instancePath + (property !== undefined ? `/${escapePointer(property)}` : '');
    return { url, path, message: `${path || '/'} ${error.message}` };
  });
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);

/** Validate AIAX 0.1. fetch can be injected; no request occurs at import time. */
export async function validateSite(url, { fetch: fetcher = globalThis.fetch } = {}) {
  let site;
  try { site = new URL(url); } catch { throw new TypeError('url must be an absolute HTTP(S) URL'); }
  if (!['https:','http:'].includes(site.protocol) || site.username || site.password)
    throw new TypeError('url must use HTTP(S) without credentials');
  const report = { url: site.href, manifest_url: '', ok: false, score: 0, errors: [], warnings: [], sections: [] };
  const load = async target => {
    try {
      const response = await fetcher(target, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { error: { url: target, path: '', message: `document could not be fetched: HTTP ${response.status}` }, status: response.status };
      try { return { document: await response.json() }; }
      catch { return { error: { url: target, path: '', message: 'document is not valid JSON' }, status: response.status }; }
    } catch { return { error: { url: target, path: '', message: 'document could not be fetched: network failure or timeout' }, status: 0 }; }
  };
  let manifestUrl = new URL('/.well-known/aiax.json', site).href;
  let loaded = await load(manifestUrl);
  // A present but invalid document must not be hidden by the fallback.
  if (loaded.error && [0,404,410].includes(loaded.status)) {
    manifestUrl = new URL('/aiax/manifest.json', site).href;
    loaded = await load(manifestUrl);
  }
  report.manifest_url = manifestUrl;
  if (loaded.error) { report.errors.push(loaded.error); return finish(report); }
  const manifest = loaded.document;
  report.errors.push(...schemaErrors(validateManifest, manifest, manifestUrl));
  const entries = object(manifest) && Array.isArray(manifest.entry_points) ? manifest.entry_points : [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!object(entry) || typeof entry.url !== 'string' || typeof entry.id !== 'string') continue;
    let target;
    try {
      const parsed = new URL(entry.url, manifestUrl);
      if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
      target = parsed.href;
    } catch {
      report.errors.push({url:manifestUrl,path:`/entry_points/${i}/url`,message:'entry point url must resolve to HTTP(S) without credentials'});
      continue;
    }
    const result = await load(target);
    const errors = result.error ? [result.error] : schemaErrors(validateSection, result.document, target);
    if (!result.error && object(result.document) && result.document.section_id !== entry.id)
      errors.push({url:target,path:'/section_id',message:`section_id must match entry point id ${JSON.stringify(entry.id)}`});
    report.sections.push({id:entry.id,url:target,ok:errors.length===0,errors});
    report.errors.push(...errors);
  }
  return finish(report);
}
function finish(report) {
  report.ok = report.errors.length === 0;
  report.score = Math.max(0, 100 - 5 * report.errors.length - report.warnings.length);
  return report;
}
