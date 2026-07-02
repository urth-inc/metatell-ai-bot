# Release Process

This repository uses pnpm, Changesets, and npm OIDC trusted publishing.

## Workflows

1. `release.yml`: creates changesets, opens the version PR, merges it, and
   invokes publishing.
2. `publish.yml`: reusable workflow that publishes packages to npm and creates
   GitHub releases.

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

1. Open the `release.yml` workflow in GitHub Actions.
2. Click "Run workflow".
3. Select the `develop` branch.
4. Select the semver bump type: `patch`, `minor`, or `major`.
5. Run the workflow.

The release workflow creates a version PR, merges it after checks pass, waits for
the merge to complete, and then invokes `publish.yml`.

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
