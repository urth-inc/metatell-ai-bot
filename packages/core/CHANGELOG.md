# @metatell/bot-core

## 0.0.9

### Patch Changes

- - Merge pull request #94 from urth-inc/feature/rename-cli-alias
  - fix: make CLI version test less brittle
  - feat: rename CLI alias from metatell-cli to metatell-bot

## 0.0.8

### Patch Changes

- - Merge pull request #92 from urth-inc/fix/circular-dependency-errors
  - chore: update pnpm-lock.yaml for pinned dependencies
  - fix: remove caret from uuid and ws versions to maintain pinned dependencies
  - refactor: move error classes from sdk to core to prevent circular dependencies
  - Merge pull request #90 from urth-inc/renovate/tsx-4.x
  - Merge pull request #91 from urth-inc/renovate/livekit-agents-1.x
  - fix(deps): update dependency @livekit/agents to v1.0.2
  - chore(deps): update dependency tsx to v4.20.5

## 0.0.7

### Patch Changes

- - Merge pull request #88 from urth-inc/fix/esmodule-commonjs-compatibility
  - docs: add development section to CLI README
  - feat: dynamic version reading from package.json for CLI
  - Merge pull request #86 from urth-inc/feature/pin-package-versions
  - fix: align @types/node version in packages/cli with root package
  - fix: resolve ESModule/CommonJS compatibility issue in CLI package
  - chore: pin all package versions in workspace packages
  - chore: pin all package versions to exact versions

## 0.0.6

### Patch Changes

- - Merge pull request #36 from urth-inc/renovate/biomejs-biome-2.x
  - Merge pull request #85 from urth-inc/fix/github-actions-node-setup
  - Merge pull request #84 from urth-inc/fix/avatar-src-error
  - fix: GitHub Actions docs ワークフローの Node.js セットアップを Volta に統一
  - refactor: improve organization avatar detection to avoid UUID-based inference
  - test: add unit tests to detect organization avatar URL bug
  - Merge pull request #83 from urth-inc/feature/typedoc-githubpages
  - style: typedoc テーマ CSS のフォーマット修正（末尾改行）
  - fix: resolve organization avatar URL requirement in CLI
  - Merge branch 'develop' into feature/typedoc-githubpages
  - Merge pull request #82 from urth-inc/feature/add-package-readmes
  - chore(deps): pnpm-lock.yaml を更新（typedoc 関連依存を反映）
  - chore(tsconfig): プロジェクト参照の微調整（no functional change）
  - docs(typedoc): tsconfig.typedoc.json とテーマ CSS を追加／.gitignore を整理
  - fix: correct quaternion to euler conversion in SDK example
  - docs: unify NAF debugging configuration to AppSettings only
  - fix: remove legacy :443 port specifications from test URLs
  - docs: 表現をエンジニア向けに調整（誇張語の削除・中立表現化）
  - feat: add rotation test helpers for consistent angle conversion
  - docs(typedoc): packages 戦略に切替・excludeInternal・リンク/並び順を調整
  - fix: improve TypeScript type safety in NAF extraction functions
  - ci(docs): CI を pnpm typedoc に統一／ローカルは docs:build・docs:watch へ整理
  - fix: unify NAF/NAFR usage according to protocol design
  - chore(typedoc): 型スタブを追加・lint 準拠（commander/livekit/uuid）
  - fix: remove unnecessary sharp from ignoredBuiltDependencies
  - docs: sync with implementation
  - fix: update lockfile to resolve uuid dependency issue
  - Merge remote-tracking branch 'origin/develop' into feature/add-package-readmes
  - docs: translate READMEs to Japanese and update Node.js requirement to 22
  - ci(cache): remove redundant pnpm cache restore key
  - docs: add comprehensive README documentation for all packages
  - Merge pull request #37 from urth-inc/renovate/uuid-12.x
  - Merge pull request #80 from urth-inc/feature/20250904/add-docs
  - fix(deps): update dependency uuid to v12
  - chore(deps): update dependency @biomejs/biome to v2.2.3
  - README.md のドキュメントを更新し、SDK の導入から応用までを網羅した内容に整備しました。また、NAF.md ファイルを削除し、クイックスタートの例を修正しました。SDK のインポートパスを更新し、CreateClientOptions のコメントを明確化しました。

## 0.0.5

### Patch Changes

- - Merge pull request #78 from urth-inc/fix/use-wrapper-script-for-version
  - fix: add .mjs files to lefthook check patterns
  - refactor: consolidate version sync logic into single script
  - fix: use wrapper script to avoid changesets/action error
  - Merge pull request #77 from urth-inc/fix/sync-root-version-after-changeset
  - feat: sync root package version after changesets version update
  - Merge pull request #75 from urth-inc/feat/sync-root-version-on-release
  - Merge pull request #76 from urth-inc/revert-59-fix/use-pnpm-publish-directly
  - Revert "fix: update publish step in workflow to use pnpm directly"
  - Merge pull request #74 from urth-inc/fix/update-root-package-version
  - feat: include root package in version updates during release
  - chore: update root package version to 0.0.4
  - Merge pull request #73 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #72 from urth-inc/fix/improve-pr-search-stability
  - fix: improve PR search stability in release workflow
  - Merge pull request #70 from urth-inc/feat/add-repository-field-to-packages
  - feat: add repository field to all package.json files
  - Merge pull request #69 from urth-inc/revert-62-feat/add-provenance-check-workflow
  - Revert "feat: 新しいワークフローを追加して NPM パッケージのプロヴェナンスをチェック"
  - Merge pull request #68 from urth-inc/revert-67-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #67 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #65 from urth-inc/revert-64-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #64 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #62 from urth-inc/feat/add-provenance-check-workflow
  - Merge pull request #63 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - fix: update repository reference in check-provenance workflow
  - feat: 新しいワークフローを追加して NPM パッケージのプロヴェナンスをチェック
  - Merge pull request #61 from urth-inc/revert-60-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #60 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #58 from urth-inc/revert-57-changeset-release/develop
  - Merge pull request #59 from urth-inc/fix/use-pnpm-publish-directly
  - Revert "chore(release): Version Packages"
  - fix: update publish step in workflow to use pnpm directly
  - Merge pull request #57 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #56 from urth-inc/fix/update-npm-in-publish-workflow
  - fix: add missing newline before publish step in workflow
  - fix: update npm to latest version before publishing
  - Merge pull request #55 from urth-inc/revert-54-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #54 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #53 from urth-inc/revert-52-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #52 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #51 from urth-inc/fix/npm-publish-settings
  - docs: update RELEASE.md with current workflow structure
  - fix: add publishConfig for scoped npm packages
  - Merge pull request #50 from urth-inc/revert-49-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #49 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #48 from urth-inc/feature/enable-publish
  - fix: add required permissions to publish job
  - Merge pull request #46 from urth-inc/feature/enable-publish
  - chore: remove unnecessary comments from workflows and scripts
  - fix: ensure publish workflow uses latest merged code
  - fix: use caller's ref in publish workflow instead of hardcoded develop
  - fix: improve cache key strategy and concurrency scope
  - chore: fix lint error
  - feat: implement automated release workflow with changesets
  - Merge pull request #22 from urth-inc/renovate/livekit-agents-1.x
  - docs: simplify README and fix changeset handling
  - docs: update README to reflect CI-based release process
  - feat: migrate to npm OIDC trusted publishing for enhanced security
  - refactor: simplify release workflow to single manual trigger
  - fix: update release workflow to follow best practices
  - feat: add automated release workflow
  - fix(deps): update dependency @livekit/agents to v1

## 0.0.4

### Patch Changes

- - Merge pull request #72 from urth-inc/fix/improve-pr-search-stability
  - fix: improve PR search stability in release workflow
  - Merge pull request #70 from urth-inc/feat/add-repository-field-to-packages
  - feat: add repository field to all package.json files
  - Merge pull request #69 from urth-inc/revert-62-feat/add-provenance-check-workflow
  - Revert "feat: 新しいワークフローを追加して NPM パッケージのプロヴェナンスをチェック"
  - Merge pull request #68 from urth-inc/revert-67-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #67 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #65 from urth-inc/revert-64-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #64 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #62 from urth-inc/feat/add-provenance-check-workflow
  - Merge pull request #63 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - fix: update repository reference in check-provenance workflow
  - feat: 新しいワークフローを追加して NPM パッケージのプロヴェナンスをチェック
  - Merge pull request #61 from urth-inc/revert-60-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #60 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #58 from urth-inc/revert-57-changeset-release/develop
  - Merge pull request #59 from urth-inc/fix/use-pnpm-publish-directly
  - Revert "chore(release): Version Packages"
  - fix: update publish step in workflow to use pnpm directly
  - Merge pull request #57 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #56 from urth-inc/fix/update-npm-in-publish-workflow
  - fix: add missing newline before publish step in workflow
  - fix: update npm to latest version before publishing
  - Merge pull request #55 from urth-inc/revert-54-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #54 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #53 from urth-inc/revert-52-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #52 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #51 from urth-inc/fix/npm-publish-settings
  - docs: update RELEASE.md with current workflow structure
  - fix: add publishConfig for scoped npm packages
  - Merge pull request #50 from urth-inc/revert-49-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #49 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #48 from urth-inc/feature/enable-publish
  - fix: add required permissions to publish job
  - Merge pull request #46 from urth-inc/feature/enable-publish
  - chore: remove unnecessary comments from workflows and scripts
  - fix: ensure publish workflow uses latest merged code
  - fix: use caller's ref in publish workflow instead of hardcoded develop
  - fix: improve cache key strategy and concurrency scope
  - chore: fix lint error
  - feat: implement automated release workflow with changesets
  - Merge pull request #22 from urth-inc/renovate/livekit-agents-1.x
  - docs: simplify README and fix changeset handling
  - docs: update README to reflect CI-based release process
  - feat: migrate to npm OIDC trusted publishing for enhanced security
  - refactor: simplify release workflow to single manual trigger
  - fix: update release workflow to follow best practices
  - feat: add automated release workflow
  - fix(deps): update dependency @livekit/agents to v1

## 0.0.3

### Patch Changes

- - Merge pull request #61 from urth-inc/revert-60-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #60 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #58 from urth-inc/revert-57-changeset-release/develop
  - Merge pull request #59 from urth-inc/fix/use-pnpm-publish-directly
  - Revert "chore(release): Version Packages"
  - fix: update publish step in workflow to use pnpm directly
  - Merge pull request #57 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #56 from urth-inc/fix/update-npm-in-publish-workflow
  - fix: add missing newline before publish step in workflow
  - fix: update npm to latest version before publishing
  - Merge pull request #55 from urth-inc/revert-54-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #54 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #53 from urth-inc/revert-52-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #52 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #51 from urth-inc/fix/npm-publish-settings
  - docs: update RELEASE.md with current workflow structure
  - fix: add publishConfig for scoped npm packages
  - Merge pull request #50 from urth-inc/revert-49-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #49 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #48 from urth-inc/feature/enable-publish
  - fix: add required permissions to publish job
  - Merge pull request #46 from urth-inc/feature/enable-publish
  - chore: remove unnecessary comments from workflows and scripts
  - fix: ensure publish workflow uses latest merged code
  - fix: use caller's ref in publish workflow instead of hardcoded develop
  - fix: improve cache key strategy and concurrency scope
  - chore: fix lint error
  - feat: implement automated release workflow with changesets
  - Merge pull request #22 from urth-inc/renovate/livekit-agents-1.x
  - docs: simplify README and fix changeset handling
  - docs: update README to reflect CI-based release process
  - feat: migrate to npm OIDC trusted publishing for enhanced security
  - refactor: simplify release workflow to single manual trigger
  - fix: update release workflow to follow best practices
  - feat: add automated release workflow
  - fix(deps): update dependency @livekit/agents to v1

## 0.0.2

### Patch Changes

- add test
