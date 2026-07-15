# Changesets

Add a changeset to every pull request that changes a published package's public behavior:

```bash
pnpm changeset
```

Select only the packages changed by the pull request and choose each package's own semver bump.
Package versions are independent; do not align unrelated packages.

After a changeset reaches `develop`, the release workflow opens or updates the
`chore(release): Version Packages` pull request. Review the generated versions and changelogs,
then merge that pull request to publish the packages through npm OIDC.
