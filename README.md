# AIAX validator

Validates the official AIAX 0.1 manifest and section schemas with JSON Schema draft 2020-12 and format checks. Node 20 or later.

```sh
npm install
node src/cli.js https://lax.kognai.ai --json
node src/cli.js https://offline.invalid --fixtures fixtures/valid
```

The executable name is `aiax-validate`. This candidate is not published to npm yet; publication and the unscoped package name are release gates, not completed acceptance items.

```js
import { validateSite } from './src/index.js';
const report = await validateSite('https://example.org', { fetch: myFetch });
```

The report contains `url`, `manifest_url`, `ok`, `score`, `errors`, `warnings`, and `sections`. Each error has a document URL, JSON pointer and plain-language message. The manifest is located at `/.well-known/aiax.json`, falling back to `/aiax/manifest.json` if unavailable. A present invalid manifest is not hidden by the fallback. Relative section URLs resolve against the manifest URL. Section identifiers must match entry points.

The score is 100 minus 5 per error and 1 per warning, floored at zero. Current checks emit errors; the warnings array is reserved. A site is valid only with zero errors. JSON output is parseable and ordinary output uses one line per error. Exit codes: 0 valid, 1 invalid, 2 usage/runtime setup error.

`--fixtures <directory>` maps every URL's path to a local file, including the manifest and sections. A missing file is HTTP 404. No fixture-mode fetch uses the network. Use fixtures only from a trusted directory. The tool fetches URLs referenced by a site, so only validate sites authorized in your environment.

`npm test` checks A1-A5 with independently malformed documents, format errors, CLI subprocesses and path containment. The two official live sites are checked only with `AIAX_LIVE=1 npm test`. The live result is recorded separately from fixture tests. Publication remains outstanding even when tests pass.
