import { promises as fs } from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()

async function main() {
  // ルートのpackage.jsonを読み込む
  const rootPkgPath = path.join(cwd, 'package.json')
  const rootPkgContent = await fs.readFile(rootPkgPath, 'utf8')
  const rootPkg = JSON.parse(rootPkgContent)

  // いずれかのパッケージのバージョンを取得（全て同じバージョンになっているはず）
  const corePkgPath = path.join(cwd, 'packages/core/package.json')
  const corePkgContent = await fs.readFile(corePkgPath, 'utf8')
  const corePkg = JSON.parse(corePkgContent)

  // バージョンが異なる場合のみ更新
  if (rootPkg.version !== corePkg.version) {
    console.log(`Updating root package version from ${rootPkg.version} to ${corePkg.version}`)
    rootPkg.version = corePkg.version

    // ファイルを書き戻す（インデントを保持）
    await fs.writeFile(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`, 'utf8')
    console.log('Root package version updated successfully')
  } else {
    console.log(`Root package version is already ${rootPkg.version}`)
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
