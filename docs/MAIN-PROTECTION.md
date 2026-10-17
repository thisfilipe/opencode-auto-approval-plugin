# Protect `main` on GitHub

The workflows in this repository **cannot themselves enforce branch protection**.
An administrator must apply the rules in repository Settings. Public repositories
can use GitHub rulesets on the Free plan.

1. Visit [Settings > Rules > Rulesets](https://github.com/thisfilipe/opencode-auto-approval-plugin/settings/rules)
   and choose **New branch ruleset**.
2. Name it `Protect main`, set **Enforcement status** to **Active** and target
   the default branch (`main`).
3. Enable **Require a pull request before merging**. If maintaining the project
   alone, leave required approval count at **0**; GitHub does not permit
   self-approval of your own PR.
4. Enable **Require status checks to pass**, and select the existing CI job
   **`Code Quality & Tests`**. It must first have run on a PR in this fork
   before it can be selected as a required check.
5. Enable **Require conversation resolution**, **Block force pushes**,
   **Restrict deletions** and optionally **Require linear history** (squash or
   rebase merges). Do not enable any bypass actor.
6. Save the ruleset, verify it shows **Active** and check that a new PR
   without a passing CI check cannot be merged.

If a status check does not appear in the selector, open or update a PR to
trigger [CI](../.github/workflows/ci.yml), wait for its completion, then
return to Settings. The CI workflow deliberately runs even for documentation-
only PRs, so required checks cannot be silently skipped by path filters.

For immutable version tags, an optional tag ruleset targeting **`v*`**
may restrict updates and deletions. **Allow new tag creation** so GitHub
Release can publish a version from the validated `main` commit.

**Do not apply tag-update or force-push restrictions to `latest`.** The release
workflow deliberately creates or force-updates `refs/tags/latest` after a
stable release; a ruleset covering `latest` would make the workflow fail
after publishing the versioned release. Versioned tags and the moving
`latest` tag require different protection policies.

## Validate the result

- The Settings ruleset is **Active**, and specifically targets `main`.
- A new PR cannot merge until `Code Quality & Tests` succeeds.
- Direct pushes and force pushes to `main` are rejected.
- Releases are created through **Actions > GitHub Release**, not by pushing
  to `main` or reusing an existing tag.

If you prefer the older branch-protection interface, use **Settings > Branches**
with the same intent, including **Do not allow bypassing the above settings**.
