# Release Process

This repository uses pnpm, Changesets, and npm OIDC trusted publishing.

## Workflow

`release.yml` runs on every push to `develop` and can also be started manually
from `develop`. It uses the Changesets GitHub Action:

1. When unreleased changesets exist, it opens or updates the
   `chore(release): Version Packages` PR.
2. When no changesets remain, such as after the version PR is merged, it runs
   `pnpm run release`. This builds the packages, publishes versions that are not
   yet on npm with `changeset publish` and npm provenance, and creates GitHub
   releases.

## First-Time Setup

### Package Publish Settings

Each public package must include:

```json
"publishConfig": {
  "access": "public",
  "registry": "https://registry.npmjs.org/"
}
```

### npm Trusted Publishers

Configure OIDC trusted publishing for each package:

- [@metatell/bot-core](https://www.npmjs.com/package/@metatell/bot-core/access)
- [@metatell/bot-sdk](https://www.npmjs.com/package/@metatell/bot-sdk/access)
- [@metatell/bot-cli](https://www.npmjs.com/package/@metatell/bot-cli/access)
- [@metatell/bot-realtime](https://www.npmjs.com/package/@metatell/bot-realtime/access)

Use these trusted publisher settings:

| Field | Value |
| --- | --- |
| Organization or username | `urth-inc` |
| Repository | `metatell-ai-bot` |
| Workflow file name | `release.yml` |
| Environment name | Leave empty |

An `NPM_TOKEN` secret is not required for publishing through OIDC.

### GitHub Actions Permissions

GitHub Actions must have read and write permissions:

1. Open repository settings.
2. Go to Actions > General > Workflow permissions.
3. Select "Read and write permissions".

## Development Flow

Create a changeset for user-facing package changes:

```bash
pnpm changeset
```

Commit the generated `.changeset/` file with the code or documentation change.

## Running a Release

1. Merge PRs that include changesets into `develop`.
2. Review the `chore(release): Version Packages` PR opened by `release.yml`.
   Changesets determines each package's semver bump from the changeset files.
3. Merge the version PR. The next `release.yml` run publishes the new versions
   to npm and creates GitHub releases.

## Troubleshooting

### First Publish Returns E404

Scoped public packages need `publishConfig.access` set to `public`. Add the
package publish settings, merge the PR, and rerun the release workflow.

### npm Publish Returns E403

Check these settings:

- The npm trusted publisher is configured for the package.
- The workflow file name is `release.yml`.
- The workflow is running from the `develop` branch.
- The package name in `package.json` matches the npm package.

### GitHub Integration Permission Error

If GitHub Actions reports `Resource not accessible by integration`, confirm the
repository workflow permissions are set to read and write.

## Notes

- npm CLI 11.5.1 or later is required. GitHub Actions installs the required
  version.
- Self-hosted runners are not supported for the publishing workflow.
- Each npm package can have one trusted publisher.
- OIDC publishing applies to `npm publish`; dependency installation uses normal
  npm registry access.
