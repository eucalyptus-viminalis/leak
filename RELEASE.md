# Release Playbook

This project uses a weekly stable cadence with a beta pre-release channel.

## Versioning

- Format: `YYYY.M.P`
- `P` increments for each release in the same month.
- Keep versions synchronized between:
  - `package.json`
  - `skills/leak/SKILL.md`

## Weekly Lifecycle

- Monday-Tuesday: land reviewed PRs.
- Wednesday: stabilize and finalize changelog entries.
- Thursday morning: publish beta.
- Thursday afternoon: validate beta install/runtime.
- Friday: promote stable, create GitHub release, publish skill.

## Preflight (Local)

```bash
# from repository root
npm ci
npm run check:version-sync
npm run check:syntax
npm run check:smoke
npm run check:no-local-paths
npm pack --dry-run --cache ./.npm-cache
```

## Beta Publish

```bash
npm publish --tag beta
npm view leak-cli dist-tags
npm i -g leak-cli@beta
leak --help
```

## Stable Publish

```bash
npm dist-tag add leak-cli@<version> latest
npm view leak-cli version
npm view leak-cli dist-tags
```

For tag-based stable workflow:

```bash
git tag v<version>
git push origin main --tags
```

The release GitHub Action (`.github/workflows/release.yml`) will run checks and can publish.

## GitHub Release

For each stable release:
- Create/edit release notes with:
  - What changed
  - Breaking changes
  - Skill updates
  - Upgrade steps
  - Rollback
- Ensure tag matches package version (`v<version>`).

## ClawHub Skill Publish

```bash
openclaw clawhub validate --cwd skills/leak
openclaw clawhub publish --cwd skills/leak --target public
```

Post-publish checks:
- listing version matches npm + `SKILL.md`
- fresh-host install and one buy-flow smoke test

## Required Gates (No Skip)

- Version sync: npm package version == skill version.
- Changelog updated for all user-facing changes.
- Fresh install check from beta when available.
- Runtime smoke checks:
  - `leak --help`
  - `leak config --help`
  - minimal publish/buy path touched by changes
- Backward compatibility for documented README flow(s).

## Hotfix Rule

For critical regressions, you may skip beta. Still:
- increment version
- publish notes
- include rollback guidance
