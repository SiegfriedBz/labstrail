---
name: review-branch
description: Run CI's checks, tests and builds, refresh the architecture views in .omm/ the branch changed, review the current branch against develop with the reviewer subagent, block on any failure, stale docs or ADR conflict, then draft the PR title and description. Use when a branch is ready for a PR.
disable-model-invocation: true
---

1. Find the base: `git fetch origin`, then diff against `origin/develop` (or `origin/main` for a release or hotfix branch). Find the branch's plan in `docs/plans/` from the number in the branch name, if there is one.
2. Run what CI runs, from a clean working tree: `pnpm check` (Biome, `forge fmt --check`, `forge lint`, NatSpec), `pnpm typecheck`, `pnpm test` (Vitest and `forge test`), `pnpm test:coverage`, `forge build --sizes` in `packages/contracts`, `pnpm --filter @verisci/contracts generate:abi` then `git diff --exit-code -- packages/contracts/src/generated` (the committed ABI matches the contract), then `pnpm build` twice: once as-is (your env files, as you would run it) and once as CI does (`APP_ENV=local pnpm build`). If any fails, stop: show the failing command and its error, and do not run the reviewer or draft the PR. Never skip one, or use `SKIP_ENV_VALIDATION`, to get past it.
3. **Refresh the architecture views** in `.omm/` (`CONTRIBUTING.md` → Docs), with the `omm` CLI (oh-my-mermaid; `npm install -g oh-my-mermaid` if `omm` is missing).
   - List what the diff adds, moves, deletes or changes: `git diff --name-status origin/develop...HEAD`, and the steps, settings and behaviours it changes.
   - Find every element that names one of them or its folder: `grep -rln` over `.omm/**/*.md` and `.omm/**/diagram.mmd`. Read that code again and rewrite only those fields, one `omm write <element path> <field> -` per command with the text on stdin. Add an element (at least its `description`) for a new folder, flow or service, and `omm delete` one whose code is gone.
   - Diagrams: `graph LR` (or `graph TD` for a hierarchy); element ids in kebab-case, matching the child directories; labels `Name\npath`; a label on every edge. Run `omm validate` and fix any error.
   - Commit the refresh (scope `docs`; `git commit` asks first), then go on. Nothing to refresh when no element names a changed path and nothing new needs one.
4. Run the **reviewer** subagent on that diff and plan. It reports and edits nothing.
5. Show its findings, most severe first, in three sections: **Code**, **Docs** and **ADRs**, then its **Docs checked** and **ADRs checked** lists. If **Docs checked** misses a README or `CLAUDE.md` of a workspace in the diff or depending on one, run the reviewer again on those files before going on.
6. If there is any **Docs** finding, stop: list the files to update and do not draft the PR. Fixing them comes first (`CONTRIBUTING.md` → Docs). If there is any **ADRs** finding, stop too: show each conflict with its options (amend, supersede, change the code) and ask the user to decide; never pick one yourself and never reword an ADR (ADR 0025).
7. Otherwise draft the PR from the plan, the diff and `.github/pull_request_template.md`:
   - **Title** = the squash commit: `type(scope): summary`, at most 72 characters.
   - **Body**: Summary, Changes, How to verify, Checklist. Write it **full width**: each paragraph and bullet on one line, no hard wraps.
   - End with the line `Built with Claude Code`.
   - Base branch `develop` (or `main` for a release); merge method **Squash and merge** (merge commit for a release).
8. Remind the user that pushing and opening the PR are theirs.
