# Maintained OpenCode auto-approval fork

Based on [dyoshikawa/opencode-auto-approval-plugin](https://github.com/dyoshikawa/opencode-auto-approval-plugin)
v0.9.0 (`bd90b1c670b765676baa6c575373ea11b93f0784`).
Original software and contributions retain the original MIT license and attribution.

This fork includes:

1. Reviewer-session cleanup and parent linkage (original upstream PR #51).
2. AI-approved `all-tools` calls satisfy matching native permission assertions
   without widening access to other agents or calls (original upstream PR #53).
3. Successful, structured OpenCode `question` answers participate in authorization
   decisions; cancelled questions and assistant claims do not count as consent.

## Development

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup:dev # optional: install developer Git hooks and generate rulesync files
pnpm cicheck
pnpm compile
pnpm pack
```

The root `index.js` re-exports the built `dist/index.js` for local OpenCode
plugin-directory resolution. Local development installs must run
`pnpm compile` first.

## Install directly from GitHub

OpenCode v2 accepts a Git repository as an npm-compatible plugin source.
To follow **published stable releases** without editing the version each time,
use the mutable `latest` Git tag, never the moving `main` branch:

```jsonc
{
  "plugins": [
    {
      "package": "github:thisfilipe/opencode-auto-approval-plugin#latest",
      "options": {
        "mode": "all-tools",
        "conversation": { "enabled": true, "includeAssistant": true },
      },
    },
  ],
}
```

The `latest` tag first appears with the initial stable `v0.9.1` GitHub
Release. For reproducibility, specify `#v0.9.1` (or a newer immutable
versioned tag) instead. Preserve your review options when switching sources.
Git package caching can retain old revisions; a tag move does **not**
guarantee unattended plugin updates.

**v0.9.1 and earlier should not be installed directly from GitHub.**
In OpenCode 2.0.32, the npm Git dependency preparation step triggered by
`prepare` failed with `NpmInstallFailedError: git dep preparation failed`.
The npm documentation also treats a `build` lifecycle script as a trigger
for Git dependency preparation. Starting with v0.9.2, the release workflow
creates a separate **release-only Git commit** containing compiled `dist/`
artifacts and tags that commit. It removes preparation/build lifecycle
scripts from the package manifest, so no compilation is required when
installing from GitHub. The `main` branch remains source-only.

The versioned release tag points to a build commit whose direct parent is
the verified `main` commit. The moving `latest` tag follows the same build
commit; **releases must never point `latest` at a source-only `main` commit**.
No npm registry publishing is required. For offline usage, continue loading
a previously compiled local directory.

## Versioning and release policy

This fork uses Semantic Versioning from the first stable release **v0.9.1**.
Earlier `v0.9.0-fork.1` was a historical pre-release and remains available.

- `MAJOR`: breaking configuration/API changes.
- `MINOR`: backward-compatible features.
- `PATCH`: compatible fixes and maintenance.
- A hyphen suffix (`-rc.1`, `-beta.1`) marks a **pre-release**, which never
  moves `latest`.

The GitHub Releases **Latest** badge and the Git tag **`latest`** are different:
the workflow sets the badge for the stable release, and moves the Git tag to
the exact same commit only after successful publication. Published version
tags (`v0.9.1`, etc.) remain immutable and are never re-used or overwritten.
`latest` is intentionally mutable; do not use it for reproducible builds.

1. Create a feature branch and PR targeting protected `main`. CI must pass.
2. Bump `package.json` through the PR. Never reuse an existing release
   version or reduce the most recent stable version.
3. Merge after CI passes and run
   **Actions > GitHub Release > Run workflow** on branch `main`.
4. The workflow verifies version uniqueness and stable version order, runs
   `pnpm cicheck`, compiles ESM/CJS bundles and packs an archive with SHA-256.
5. After all checks pass, it creates a release-only child commit containing
   the precompiled `dist/` files and pushes the immutable `vX.Y.Z` tag to
   that commit, **without changing the `main` branch**.
6. It publishes the GitHub Release and artifacts for that tag. A stable
   release is marked GitHub Releases **Latest**, then the movable
   `refs/tags/latest` is updated to the same release-only commit. A
   pre-release neither gets the badge nor moves the tag.
7. Confirm that the tag contains `dist/index.js`, the GitHub Release exists,
   and `latest` matches the version tag. Run a clean OpenCode Git plugin
   installation before removing local backups.

The workflow needs `contents: write` to publish releases and move the tag.
No npm registry or publishing token is involved. A Git tag ruleset must
**exclude `latest`** if it prevents tag updates or force pushes.

## Protect the main branch

Repository administration rules must be set in the GitHub Settings UI. See
[`docs/MAIN-PROTECTION.md`](docs/MAIN-PROTECTION.md) for precise settings.
This is a _manual administrative prerequisite_, not a rule automatically
installed by committing workflow files. Do not mark the branch as protected
until Settings shows the active rule and a test PR cannot bypass it.

For a solo-maintained repository, require a PR and passing CI, but do not
require another person's review unless an independent reviewer is available:
GitHub does not let an author approve their own PR.
