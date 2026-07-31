# Releasing

Ridge uses [Semantic Versioning](https://semver.org). Every release is an
annotated tag with a matching package version, a changelog entry, green checks,
a GitHub Release, and a production deployment that was actually opened and used.

## What a release must have

- [ ] `package.json` version equals the tag without the `v` prefix
- [ ] A `CHANGELOG.md` section for that version
- [ ] An **annotated** tag `vX.Y.Z` (not lightweight)
- [ ] A GitHub Release attached to that tag, with notes
- [ ] All required checks green on the released commit
- [ ] Production verified end to end from the live domain

A tag that fails verification is never published as a successful release — the
workflow creates the GitHub Release only after the suite passes.

## Choosing the number

| Change | Bump |
|---|---|
| Breaking change to the HTTP API or saved-analysis payload shape | major |
| New capability, new endpoint, new evidence metric | minor |
| Bug fix, wording, dependency bump with no behaviour change | patch |

The analysis payload carries its own `schemaVersion`, and the evidence engine
its own `engineVersion`. Bump those when their *meaning* changes, independently
of the package version.

## Steps

```bash
# 1. Be on main with a clean tree, up to date.
git checkout main && git pull && git status --short

# 2. Verify everything locally. Do not skip the browser suite.
npm ci
npm test
npm run test:browser

# 3. Set the version (no tag yet — the commit and tag are separate steps).
npm version 2.1.0 --no-git-tag-version

# 4. Write the CHANGELOG entry for this version.
$EDITOR CHANGELOG.md

# 5. Commit the release prep.
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): prepare Ridge v2.1.0"

# 6. Annotated tag, then push both.
git tag -a v2.1.0 -m "Ridge v2.1.0"
git push origin main
git push origin v2.1.0
```

Pushing the tag triggers `.github/workflows/release.yml`, which re-verifies the
tagged commit before creating the Release.

## After the tag

1. Watch the release workflow to green: `gh run watch`.
2. Confirm the GitHub Release exists and its notes are right:
   `gh release view v2.1.0`.
3. Deploy production: `vercel --prod`.
4. **Open the production URL and use it.** A successful deployment command is
   not evidence that the product works. At minimum:
   - `/` loads the landing page and reaches the workspace in one click
   - `/app` loads the workspace with a working dropzone
   - **Try sample data** returns evidence, statistics and a quality grade
     with no API key
   - `/?a=x` forwards to `/app?a=x`; `/about` redirects to `/`
   - `/privacy` and `/docs` load
   - the browser console is clean
5. Confirm the deployed commit matches the tag.

## If a release goes wrong

Do not delete or move a published tag — history stays append-only. Fix forward
with a new patch release. If the tag was pushed but the workflow failed, correct
the problem, then cut `vX.Y.Z+1`; leave the failed tag with no Release attached
rather than rewriting it.
