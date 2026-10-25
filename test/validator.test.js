import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateSite} from '../src/index.js';
import {fixtureFetch} from '../src/fixtures.js';

const manifest=()=>({aiax_version:'0.1',product:{name:'Test',one_line_purpose:'Test schema',domain:'testing'},
  entry_points:[{id:'example',url:'../sections/example.json',purpose:'Test',est_tokens:100}],
  pricing_summary:null,trust_signals:{},mcp_endpoint:null,updated_at:'2026-10-25T00:00:00Z'});
const section=()=>({aiax_version:'0.1',section_id:'example',purpose:'Test',inputs:{},outputs:{},pricing:null,
  examples:[{description:'Example',request:{},response:{}}],pact_mandate_template:null});
function source(m=manifest(),s=section(),fallback=false) {
  const urls=[];
  const fetch=async url=>{
    urls.push(url);
    if(url.endsWith('/.well-known/aiax.json'))return fallback?new Response('',{status:404}):Response.json(m);
    if(url.endsWith('/aiax/manifest.json'))return Response.json(m);
    if(url.endsWith('/sections/example.json'))return s instanceof Response?s:Response.json(s);
    return new Response('',{status:404});
  };
  return {fetch,urls};
}
test('A1 valid manifest and resolved sections score 100 with no errors',async()=>{
  const mock=source();const r=await validateSite('https://site.invalid/subpath',mock);
  assert.equal(r.ok,true);assert.equal(r.score,100);assert.deepEqual(r.errors,[]);
  assert.deepEqual(mock.urls,['https://site.invalid/.well-known/aiax.json','https://site.invalid/sections/example.json']);
  assert.equal(r.sections[0].ok,true);
});
test('A1 fallback uses manifest URL for relative section resolution',async()=>{
  const mock=source(manifest(),section(),true);const r=await validateSite('https://site.invalid',mock);
  assert.equal(r.ok,true);assert.equal(r.manifest_url,'https://site.invalid/aiax/manifest.json');
});
test('A1 official sites live check, opt in', {skip:process.env.AIAX_LIVE!=='1'},async()=>{
  for(const url of ['https://lax.kognai.ai','https://www.kognai.ai']){
    const r=await validateSite(url);assert.equal(r.ok,true,JSON.stringify(r.errors));assert.ok(r.score>=90);
  }
});
for(const [label,change,path] of [
  ['missing',m=>{delete m.product.name;},'/product/name'],
  ['wrong type',m=>{m.product.name=123;},'/product/name'],
  ['extra field',m=>{m.product.unexpected=true;},'/product/unexpected'],
  ['bad id',m=>{m.entry_points[0].id='Not Allowed!';},'/entry_points/0/id'],
  ['invalid date',m=>{m.updated_at='yesterday';},'/updated_at'],
])test(`A2 ${label} names its JSON pointer`,async()=>{
  const m=manifest();change(m);const r=await validateSite('https://site.invalid',source(m));
  assert.equal(r.ok,false);assert.ok(r.score<100);assert.ok(r.errors.some(e=>e.path===path&&e.message.includes(path)));
});
test('A2 present broken manifest is not hidden by fallback',async()=>{
  const m=manifest();delete m.updated_at;const mock=source(m);await validateSite('https://site.invalid',mock);
  assert.equal(mock.urls.some(u=>u.endsWith('/aiax/manifest.json')),false);
});
for(const [label,change,path] of [
  ['missing',s=>{delete s.purpose;},'/purpose'],
  ['pricing',s=>{s.pricing={model:'per_call',amount:'free',currency:'USD',rail:'x402'};},'/pricing/amount'],
  ['mismatch',s=>{s.section_id='another';},'/section_id'],
])test(`A3 section ${label} is rejected`,async()=>{
  const s=section();change(s);const r=await validateSite('https://site.invalid',source(manifest(),s));
  assert.equal(r.ok,false);assert.equal(r.sections[0].ok,false);assert.ok(r.errors.some(e=>e.path===path));
});
test('A3 unavailable and non-JSON sections fail explicitly',async()=>{
  for(const response of [new Response('',{status:404}),new Response('not json')]){
    const r=await validateSite('https://site.invalid',source(manifest(),response));assert.equal(r.ok,false);
    assert.match(r.errors[0].message,/HTTP 404|not valid JSON/);
  }
});
test('missing manifest returns an invalid report, never success',async()=>{
  const r=await validateSite('https://site.invalid',{fetch:async()=>new Response('',{status:404})});
  assert.equal(r.ok,false);assert.ok(r.errors.length);assert.equal(r.sections.length,0);
});
test('A4 CLI JSON, plain output, fixtures and all exit codes',()=>{
  const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const fixtures=fileURLToPath(new URL('../fixtures',import.meta.url));
  const run=(args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:10000});
  const valid=run(['https://offline.invalid','--json','--fixtures',join(fixtures,'valid')]);
  assert.equal(valid.status,0,valid.stderr);assert.equal(JSON.parse(valid.stdout).ok,true);
  const broken=run(['https://offline.invalid','--json','--fixtures',join(fixtures,'broken-manifest')]);
  assert.equal(broken.status,1);assert.equal(JSON.parse(broken.stdout).ok,false);
  const plain=run(['https://offline.invalid','--fixtures',join(fixtures,'broken-section')]);
  assert.equal(plain.status,1);assert.match(plain.stdout,/pricing/);
  for(const args of [[],['not-a-url'],['https://offline.invalid','--wat'],['https://offline.invalid','--fixtures']])
    assert.equal(run(args).status,2);
});
test('A5 broken fixtures are included and independently invalid',async()=>{
  for(const name of ['broken-manifest','broken-section','mismatched-section','missing-section','non-json-section']){
    const dir=fileURLToPath(new URL(`../fixtures/${name}`,import.meta.url));
    const r=await validateSite('https://offline.invalid',{fetch:fixtureFetch(dir)});assert.equal(r.ok,false,name);
  }
});
test('fixture traversal cannot read outside its directory',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aiax-fixture-'));
  try{
    await mkdir(join(dir,'root'));await writeFile(join(dir,'secret'),'hidden');
    const result=await fixtureFetch(join(dir,'root'))('https://site.invalid/%2e%2e%2fsecret');assert.equal(result.status,404);
  }finally{await rm(dir,{recursive:true,force:true});}
});
