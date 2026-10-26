# Verification

Observed 2026-10-25. Implemented with Codex assistance.

16 offline tests passed; the opt-in live test was separately exercised by the read-only verification runner. Both https://lax.kognai.ai and https://www.kognai.ai validated with score 100.

Local Node: v26.3.0. Buyer review and payment are not completed.

The unscoped npm name aiax-validate is already held by another publisher (registry checked 2026-10-25). The current package name is a proposal; acceptance of a scoped package and an authenticated npm publisher must be confirmed before release.

2026-10-26 release update: npm accepted `@donkim3/aiax-validate@0.1.0`. Namespace and package metadata changed; implementation source is unchanged from the tested candidate. Registry installation verification is recorded separately.
Initial registry checks returned 404 while npm processed publication. On 2026-10-26 the public registry became available, its integrity matched the reviewed tarball, and clean installation passed: exported validateSite, valid fixture score 100 with CLI exit 0, invalid fixture CLI exit 1. See evidence/npm-aiax-validate-published.json and evidence/npm-release-check.json.
