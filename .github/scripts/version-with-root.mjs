#!/usr/bin/env node

import { execSync } from 'node:child_process'

// changesetsのversionコマンドを実行
console.log('Running changesets version...')
execSync('pnpm changeset version', { stdio: 'inherit' })

// ルートパッケージのバージョンを同期
console.log('Syncing root package version...')
execSync('node ./.github/scripts/sync-root-version.mjs', { stdio: 'inherit' })