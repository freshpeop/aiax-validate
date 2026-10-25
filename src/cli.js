#!/usr/bin/env node
import { validateSite } from './index.js';
import { fixtureFetch } from './fixtures.js';

const usage = 'Usage: aiax-validate <url> [--json] [--fixtures <dir>]';
async function main() {
  let url, json = false, fixtures;
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help','-h'].includes(args[0])) {console.log(usage);return;}
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--json') json=true;
    else if(args[i]==='--fixtures' && args[i+1] && !args[i+1].startsWith('--')) fixtures=args[++i];
    else if(!args[i].startsWith('-') && url===undefined) url=args[i];
    else throw new TypeError(usage);
  }
  if(!url) throw new TypeError(usage);
  const report = await validateSite(url, fixtures ? {fetch:fixtureFetch(fixtures)} : {});
  if(json) console.log(JSON.stringify(report,null,2));
  else if(report.ok) console.log(`Valid AIAX site: ${report.url} (score ${report.score})`);
  else for(const error of report.errors) console.log(`${error.url} ${error.path || '/'}: ${error.message}`);
  process.exitCode=report.ok?0:1;
}
main().catch(error=>{console.error(error instanceof TypeError ? error.message : 'Validation could not run');process.exitCode=2;});
