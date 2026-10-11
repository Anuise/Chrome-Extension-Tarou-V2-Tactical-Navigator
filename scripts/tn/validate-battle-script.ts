// 戰鬥腳本驗證：npx tsx scripts/tn/validate-battle-script.ts <檔案...>
import { readFileSync } from 'node:fs'
import { validateScript } from '../../src/tn/battle-script/core'

/** 檢查一個檔案，回傳錯誤說明；通過時為空陣列 */
function check(file: string): string[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  }
  catch (error) {
    return [`無法讀取檔案：${String(error)}`]
  }
  let input: unknown
  try {
    input = JSON.parse(text)
  }
  catch (error) {
    return [`不是有效的 JSON：${String(error)}`]
  }
  const result = validateScript(input)
  // 與側欄頁匯入失敗時相同的「path：message」；path 為空字串時只有 message
  return result.ok ? [] : result.errors.map(({ path, message }) => (path ? `${path}：${message}` : message))
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
