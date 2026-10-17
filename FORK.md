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
pnpm build
pnpm pack
```

The root `index.js` re-exports the built `dist/index.js` for local OpenCode
plugin-directory resolution. Local installs must run `pnpm build` first.

## Install directly from GitHub

OpenCode v2 accepts a Git repository as an npm-compatible plugin source. Use a
**tagged release** instead of the moving `main` branch:

```jsonc
{
  "plugins": [
    {
      "package": "github:thisfilipe/opencode-auto-approval-plugin#v0.9.0-fork.1",
      "options": {
        "mode": "all-tools",
        "conversation": { "enabled": true, "includeAssistant": true }
      }
    }
  ]
}
```

The tag must exist before you use this example. Preserve your current review
options when switching to the GitHub source.

Git installations execute the `prepare` script to compile `dist`; therefore,
the initial installation downloads build-time dependencies. There is **no npm
registry publishing** in this fork. For offline usage, continue loading a
previously built local directory.

## Release policy

1. Create a feature branch, open a PR into `main` and wait for the required
   `Code Quality & Tests` GitHub check to pass.
2. Update `package.json` to a new version through a PR (and update installation
   examples as appropriate). Never reuse an existing release version.
3. Merge to `main` after CI passes. Only merged commits are eligible.
4. Open **Actions > GitHub Release > Run workflow**, with branch `main`.
5. The workflow checks that `v<package.json version>` does not exist,
   installs dependencies, runs `pnpm cicheck`, builds, packs, verifies the
   archive and creates the GitHub Release/tag on that exact main commit.
   It uploads the `.tgz` and its SHA-256 checksum. Versions containing a
   pre-release suffix (such as `-fork.1`) become pre-releases.
6. Confirm the release and test a clean OpenCode Git installation pinned to
   the tag before recommending users switch from local builds.

The release workflow requires the repository's GitHub Actions permission to
create a release and tag (`contents: write`). It does **not** need an npm
token, third-party publishing credential or secrets.

## Protect the main branch

Repository administration rules must be set in the GitHub Settings UI. See
[`docs/MAIN-PROTECTION.md`](docs/MAIN-PROTECTION.md) for precise settings.
This is a *manual administrative prerequisite*, not a rule automatically
installed by committing workflow files. Do not mark the branch as protected
until Settings shows the active rule and a test PR cannot bypass it.

For a solo-maintained repository, require a PR and passing CI, but do not
require another person's review unless an independent reviewer is available:
GitHub does not let an author approve their own PR.
