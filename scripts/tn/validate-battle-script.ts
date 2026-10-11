// 戰鬥腳本驗證：npx tsx scripts/tn/validate-battle-script.ts <檔案...>
import { readFileSync } from 'node:fs'
// 以相對路徑 import：tsx 只從 cwd 的 tsconfig 讀 ~/ alias，在其他目錄執行會解析失敗；upstream 的 scripts/*.ts 也用相對路徑（例如 ../manifest.json）
import { readScript } from '../../src/tn/battle-script/manage'

/** 檢查一個檔案，回傳錯誤說明；通過時為空陣列 */
function check(file: string): string[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  }
  catch (error) {
    return [`無法讀取檔案：${String(error)}`]
  }
  // 與側欄頁匯入共用解析與驗證，錯誤字樣相同
  const result = readScript(text)
  return result.ok ? [] : result.errors
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('用法：npx tsx scripts/tn/validate-battle-script.ts <戰鬥腳本 JSON 檔...>')
  process.exitCode = 1
}
for (const file of files) {
  const errors = check(file)
  if (errors.length === 0) {
    console.log(`${file}：通過`)
    continue
  }
  process.exitCode = 1
  for (const error of errors)
    console.error(`${file}：${error}`)
}
