# @metatell/bot-core

## 0.0.12

### Patch Changes

- - Merge pull request #152 from urth-inc/fix/avatar-public-api
  - fix: fetch organization avatars from v-air-admin public API

## 0.0.11

### Patch Changes

- - Merge pull request #149 from urth-inc/akiraueno/urth-1841
  - chore: add customManagers:biomeVersions to Renovate config
  - Merge pull request #147 from urth-inc/chore/renovate-internal-checks-filter
  - chore: add internalChecksFilter strict to prevent premature Renovate PRs
  - Merge pull request #146 from urth-inc/chore/urth-1812-npm-minimum-release-age
  - chore: override preset npm minimumReleaseAge to 7 days
  - Merge pull request #145 from urth-inc/akiraueno/urth-1806
  - docs: update AGENTS.md to reference .node-version (URTH-1806)
  - chore: unify pnpm config and add supply chain security settings (URTH-1806)
  - Merge pull request #143 from urth-inc/fix/realm-from-domain-api
  - Merge pull request #144 from urth-inc/chore/renovate-minimum-release-age
  - chore: require 3-day minimum release age for Renovate
  - fix: address review feedback - lint, tests, payload consistency
  - fix: push entering/entered events after avatar spawn to enter room
  - fix: use room-config API for organization info
  - fix: use realm-from-domain API instead of deprecated /realm endpoint
  - Merge pull request #134 from urth-inc/renovate/tsx-4.x
  - Merge pull request #137 from urth-inc/renovate/biomejs-biome-2.x
  - chore(deps): update dependency @biomejs/biome to v2.4.6
  - chore(deps): update dependency tsx to v4.21.0
  - Merge pull request #131 from urth-inc/renovate/livekit-rtc-node-0.x
  - Merge pull request #125 from urth-inc/renovate/typedoc-0.x
  - Merge pull request #130 from urth-inc/renovate/ink-6.x
  - Merge pull request #16 from urth-inc/renovate/node-22.x
  - Merge pull request #120 from urth-inc/renovate/pnpm-10.x
  - chore(deps): update dependency typedoc to v0.28.14
  - Merge pull request #129 from urth-inc/renovate/sonarsource-sonarqube-scan-action-6.x
  - Merge pull request #127 from urth-inc/renovate/lefthook-1.x
  - fix(deps): update dependency @livekit/rtc-node to v0.13.21
  - chore(deps): update pnpm to v10.22.0
  - fix(deps): update dependency ink to v6.5.0
  - chore(deps): update node.js to v22.21.1
  - chore(deps): update sonarsource/sonarqube-scan-action action to v6
  - chore(deps): update dependency lefthook to v1.13.6
  - Merge pull request #132 from urth-inc/feature/enhance-voice-bot
  - fix: 音声認識の先頭が切れる問題を修正
  - feat: 音声ボットの UX 改善と Dify API 統合の強化
  - Merge pull request #43 from urth-inc/renovate/lefthook-1.x
  - Merge pull request #124 from urth-inc/feature/20250914/fix-relase-doc
  - docs(release): update workflow file name from publish.yml to release.yml
  - Merge pull request #122 from urth-inc/renovate/uuid-13.x
  - Merge pull request #121 from urth-inc/renovate/actions-upload-pages-artifact-4.x
  - Merge pull request #100 from urth-inc/renovate/commander-12.x
  - fix(deps): update dependency uuid to v13
  - chore(deps): update actions/upload-pages-artifact action to v4
  - Merge pull request #35 from urth-inc/renovate/major-react-monorepo
  - fix(deps): update react monorepo to v19
  - Merge pull request #119 from urth-inc/renovate/livekit-agents-1.x
  - Merge pull request #118 from urth-inc/renovate/biomejs-biome-2.x
  - Merge pull request #17 from urth-inc/renovate/react-monorepo
  - fix(deps): update dependency commander to v12.1.0
  - fix(deps): update dependency @livekit/agents to v1.0.3
  - chore(deps): update react monorepo
  - chore(deps): update dependency @biomejs/biome to v2.2.4
  - Merge pull request #99 from urth-inc/renovate/vitest-monorepo
  - Merge branch 'develop' into renovate/vitest-monorepo
  - Merge pull request #97 from urth-inc/renovate/typescript-5.x
  - Merge pull request #31 from urth-inc/renovate/ink-6.x
  - Merge pull request #98 from urth-inc/renovate/changesets-cli-2.x
  - Merge pull request #113 from urth-inc/codex/2025-09-13/implement-mutevoice-method-logic
  - docs: document voice events and bus-driven mute; simplify wording
  - style(sdk): reorder imports in AgentClient and remove trailing newline in mute spec
  - sdk: enforce colon-style voice events only\n\n- Remove camelCase voice event aliases (breaking change)\n- API now only supports 'voice:\*' event names
  - core: centralize voice mute via event bus
  - fix(core): avoid duplicate mute events
  - Merge pull request #116 from urth-inc/feature/add-Agents.md
  - Merge pull request #115 from urth-inc/codex/2025-09-13/refactor-room.getusers-to-use-builduserlist
  - fix: derive connection status from session ID
  - test(core): fix event bus mute tests
  - docs: add AGENTS.md for agent guidance
  - refactor(core): centralize voice mute state
  - Merge pull request #111 from urth-inc/codex/2025-09-13/find-todo-comments-in-look-method
  - refactor: extract user list builder
  - fix(cli): guard user look for missing API
  - Merge pull request #112 from urth-inc/codex/2025-09-13/update-stopanimation-method-logging
  - feat(core): add voice mute control
  - fix(cli): handle stop command errors
  - feat(cli): support looking at user
  - Merge pull request #110 from urth-inc/chore/20250913/upgrade-sdk-versions
  - chore: update @metatell/bot-\* packages to ^0.0.10 in examples
  - chore(deps): update dependency lefthook to v1.13.0
  - chore(deps): update dependency vitest to v3.2.4
  - chore(deps): update dependency typescript to v5.9.2
  - chore(deps): update dependency @changesets/cli to v2.29.7
  - fix(deps): update dependency ink to v6

## 0.0.10

### Patch Changes

- - Merge pull request #108 from urth-inc/revert-107-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #107 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #106 from urth-inc/fix/20250913/release-ci
  - fix: apply same pnpm setup order fix to publish workflow
  - Merge pull request #105 from urth-inc/revert-104-changeset-release/develop
  - Revert "chore(release): Version Packages"
  - Merge pull request #104 from urth-inc/changeset-release/develop
  - chore(release): Version Packages
  - Merge pull request #103 from urth-inc/fix/20250913/release-ci
  - fix: resolve pnpm not found error in setup-node action
  - Merge pull request #102 from urth-inc/feature/voice-io-bridge
  - fix: add realtime package reference to sdk tsconfig
  - fix: resolve lint errors and remove unused code
  - Merge pull request #101 from urth-inc/feature/add-sonarcloud
  - feat(speech-to-speech-bot): implement WebRTC VAD for better voice detection
  - ci: integrate SonarCloud workflow into CI pipeline
  - build(sonar): add SonarQube project configuration
  - Create sonarcloud.yml
  - fix(speech-to-speech-bot): improve audio input quality and prevent clipping
  - fix(speech-to-speech-bot): improve VAD (Voice Activity Detection) accuracy
  - feat(speech-to-speech-bot): optimize LLM prompts for conversational responses
  - fix(speech-to-speech-bot): update to use @google/genai package and fix TTY handling
  - fix(speech-to-speech-bot): follow Speech-to-Text best practices without resampling
  - fix(speech-to-speech-bot): update to use Gemini chat API with history
  - fix(speech-to-speech-bot): update Gemini API usage to match @google/genai SDK
  - feat(speech-to-speech-bot): implement Gemini-based LLM processor
  - feat(voice-ai-bot): add comprehensive features for Gemini voice bot
  - feat(voice-ai-bot): implement VAD and real-time streaming mode
  - feat(voice-ai-bot): add Gemini voice AI bot with real-time conversation
  - feat(voice-bot): add avatar control with user following behavior
  - refactor(voice-bot): restructure example to match standard pattern
  - chore: add voice-bot recordings directory to gitignore
  - refactor(realtime): remove ICE transport policy configuration
  - fix(sdk): improve voice module error handling and cleanup
  - docs(voice-bot): update documentation and configuration
  - feat(voice-bot): add WAV playback and recording functionality
  - refactor(voice-bot): remove unused files and mock implementations
  - feat(voice): add periodic audio saving and fix recording functionality
  - feat(voice): implement audio recording and LiveKit environment configuration
  - feat(voice): add detailed debug logging for LiveKit token acquisition
  - fix(voice): resolve LiveKit connection issues and enable demo
  - feat(examples): update voice-bot CLI to match other examples
  - fix(core): auto-register DefaultLoggerProvider in getLogger
  - refactor(realtime): remove unused variable workaround in tests
  - feat(realtime): add create-transport unit tests
  - fix(core): simplify MetatellClient tests for reliable execution
  - refactor(sdk): remove obsolete client test file
  - feat(core): add MetatellClient unit tests
  - feat(examples): update voice-bot example to use MetatellClient
  - fix(cli): update tsconfig for improved type resolution
  - feat(cli): update CLI commands for unified client architecture
  - feat(sdk): update AgentClient and facade for unified architecture
  - feat(realtime): implement Voice I/O Bridge with polymorphic client support
  - feat(core): add MetatellClient implementation and voice-capable types
  - chore: add development directories to gitignore and project documentation
  - Merge pull request #96 from urth-inc/renovate/npm-vitest-vulnerability
  - Merge pull request #47 from urth-inc/renovate/actions-checkout-5.x
  - Merge pull request #81 from urth-inc/renovate/actions-setup-node-5.x
  - chore(deps): update actions/setup-node action to v5
  - chore(deps): update actions/checkout action to v5
  - chore(deps): update dependency vitest to v3.0.5 [security]
  - feat(realtime): implement Voice I/O Bridge for pluggable STT/TTS handlers

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
