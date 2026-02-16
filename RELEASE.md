# Release Playbook

Use a beta-first flow with stable promotion when ready.
Cadence is event-driven: release as often as needed.

## Versioning

- Stable: `YYYY.M.P`
- Prerelease: `YYYY.M.(P+1)-beta.N`
- Example: after stable `2026.2.14`, use `2026.2.15-beta.0` (not `2026.2.14-beta.1`).
- Keep versions identical in:
  - `package.json`
  - `skills/leak/SKILL.md`

## Required Gates (Run Every Cut)

```bash
# from repo root
npm ci --cache ./.npm-cache
npm run check:release
RELEASE_VERSION=<version> npm run check:changelog-version
```

Minimum behavior checks after install from published package:
- `leak --help`
- `leak config --help`
- `leak buy --help`

## Prerelease Runbook (Same-Day Iteration)

### 1) Choose version

First prerelease after a stable:

```bash
npm version prepatch --preid=beta --no-git-tag-version
```

Next prerelease on same train:

```bash
npm version prerelease --preid=beta --no-git-tag-version
```

### 2) Sync + changelog

- Set `version:` in `skills/leak/SKILL.md` to match `package.json` and any other mention of leak-cli version.
- Add/update release notes in `CHANGELOG.md` for this prerelease version.

### 3) Run gates

```bash
RELEASE_VERSION=<version> npm run check:changelog-version
npm run check:release
```

### 4) Commit + tag + push

```bash
git add .
git commit -m "release: <version>"
git tag -a v<version> -m "Release <version>"
git push origin main
git push origin v<version>
```

### 5) Publish npm beta

```bash
npm publish --tag beta --cache ./.npm-cache
npm view leak-cli dist-tags
```

### 6) GitHub prerelease

- Create release for `v<version>`.
- Mark as pre-release.

## Stable Runbook

### 1) Set stable version

```bash
npm version <stable-version> --no-git-tag-version
```

### 2) Sync + changelog + gates

- Sync `skills/leak/SKILL.md`: 3 places.
- Move release notes into `CHANGELOG.md` section for `<stable-version>`.
- Run required gates with `RELEASE_VERSION=<stable-version>`.

```bash
RELEASE_VERSION=<stable-version> npm run check:changelog-version
npm run check:release
```

### 3) Commit + tag + push

```bash
git add .
git commit -m "release: <stable-version>"
git tag -a v<stable-version> -m "Release <stable-version>"
git push origin main
git push origin v<stable-version>
```

### 4) Publish npm stable

Preferred:

```bash
npm publish --tag latest --cache ./.npm-cache
npm view leak-cli version
npm view leak-cli dist-tags
```

Alternative (if exact artifact already published):

```bash
npm dist-tag add leak-cli@<stable-version> latest
```

### 5) GitHub stable release

- Create release for `v<stable-version>`.
- Use sections:
  - What changed
  - Breaking changes
  - Skill updates
  - Upgrade steps
  - Rollback

## ClawHub Skill Publish

Default recommendation:
- Publish prereleases to npm `beta`.
- Publish to ClawHub on stable, unless explicitly testing a beta there.

Commands:

Stable:

```bash
openclaw clawhub validate --cwd skills/leak
openclaw clawhub publish --cwd skills/leak --target public
```

```bash
clawhub publish skills/leak \                                   
  --slug leak \
  --version <stable-version> \
  --tags latest \
  --changelog "<changes>"
```

Prerelease / Beta:

```bash
clawhub publish skills/leak \                                   
  --slug leak \
  --version <beta-version> \
  --tags beta \
  --changelog "<changes>"
```

Post-publish checks:
- listing version matches npm + `SKILL.md`
- one fresh-host install and buy-flow smoke test

## Hotfix Rule

For critical regressions, you may skip beta. Still:
- increment version
- publish release notes
- include rollback guidance
