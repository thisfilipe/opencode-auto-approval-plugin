# Maintained fork (OpenCode v2)

This branch is based on dyoshikawa/opencode-auto-approval-plugin **v0.9.0**
(commit `bd90b1c670b765676baa6c575373ea11b93f0784`).

The upstream project remains the original author of this MIT-licensed software.
Fork-specific changes:

1. Dispose of temporary agent-reviewer sessions and attach them to their parent
   session (original contributions: upstream PR #51).
2. Propagate an AI-approved `all-tools` call to matching native tool
   permission checks; keep explicit native denies and avoid granting other
   calls or agents (original contributions: upstream PR #53).
3. Treat successful, structured `question` tool answers as user decisions for
   subsequent review. This includes user-selected and typed answers, while
   ignoring assistant narration and cancelled or unsuccessful questions.

## Local setup and validation

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec oxfmt src/conversation.ts src/conversation.test.ts
pnpm cicheck
pnpm build
```

To load the local build, configure `~/.config/opencode/opencode.json` with
the local repository directory as `plugins[].package`, preserving the existing
plugin options, then restart the OpenCode service.

The root `index.js` re-exports the built `dist/index.js` for OpenCode's local
plugin-directory resolution. **The repository checkout must remain present.**

This branch is **not yet a verified binary release**. Run all checks before
packaging or deployment, then verify `opencode plugin list` and a real
`question` authorization flow. The root entrypoint must not be used before
`pnpm build` has generated `dist/index.js`.

For a local package archive, after successful checks and build:

```sh
pnpm pack
```

Publishing under the fork's npm scope is optional; the directory-based loader
does not require an npm release.
