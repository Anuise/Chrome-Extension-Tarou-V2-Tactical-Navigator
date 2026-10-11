// 驗證 CLI 的整合測試：實際執行 CLI，檢查輸出與 exit code
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
// eslint-disable-next-line test/no-import-node-test
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dir = mkdtempSync(join(tmpdir(), 'tn-validate-battle-script-'))
after(() => rmSync(dir, { recursive: true, force: true }))

/** 寫入暫存檔並回傳路徑：字串原樣寫入，其他值寫成 JSON */
function write(name: string, content: unknown): string {
  const file = join(dir, name)
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  return file
}

/** 以 tsx 執行 CLI，回傳 exit code 與 stdout、stderr 的各行 */
function run(...files: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    ['--no-deprecation', '--import', 'tsx', 'scripts/tn/validate-battle-script.ts', ...files],
    { cwd: root, encoding: 'utf8' },
  )
  const lines = (text: string) => text.split(/\r?\n/).filter(Boolean)
  return { status, stdout: lines(stdout), stderr: lines(stderr) }
}

const validScript = {
  version: 1,
  name: '顕現 破壞神意版',
  questId: '305701',
  rules: [{ note: '第二階段', when: { gauge: [50, 100] }, advice: [{ character: '主角', skill: 'ディスペル' }] }],
}

describe('validate-battle-script', () => {
  it('合法的戰鬥腳本：列出通過的檔案，exit code 為 0', () => {
    const file = write('valid.json', validScript)
    assert.deepEqual(run(file), { status: 0, stdout: [`${file}：通過`], stderr: [] })
  })

  it('不符合 schema：每個錯誤輸出檔案、欄位路徑與說明，exit code 為 1', () => {
    const { name: _, ...noName } = validScript
    const file = write('invalid.json', { ...noName, rules: [{ note: '第二階段', when: { hp: [50] }, advice: [] }] })
    assert.deepEqual(run(file), {
      status: 1,
      stdout: [],
      stderr: [
        `${file}：name：缺少必要欄位`,
        `${file}：rules[0].when.hp：必須是兩個數字的區間，例如 [15, 50]`,
      ],
    })
  })

  it('整份內容不是物件：錯誤沒有欄位路徑時只輸出檔案與說明', () => {
    const file = write('array.json', [validScript])
    assert.deepEqual(run(file), { status: 1, stdout: [], stderr: [`${file}：戰鬥腳本必須是 JSON 物件`] })
  })

  it('不是有效的 JSON：輸出檔案與解析錯誤，exit code 為 1', () => {
    const file = write('broken.json', '{ "version": 1, }')
    const { status, stdout, stderr } = run(file)
    assert.deepEqual({ status, stdout, stderrCount: stderr.length }, { status: 1, stdout: [], stderrCount: 1 })
    assert.ok(stderr[0].startsWith(`${file}：不是有效的 JSON：`), stderr[0])
  })

  it('檔案不存在：輸出檔案與讀取錯誤，exit code 為 1', () => {
    const file = join(dir, 'missing.json')
    const { status, stdout, stderr } = run(file)
    assert.deepEqual({ status, stdout, stderrCount: stderr.length }, { status: 1, stdout: [], stderrCount: 1 })
    assert.ok(stderr[0].startsWith(`${file}：無法讀取檔案：`), stderr[0])
  })

  it('多個檔案各自驗證：一份失敗時其他份照常檢查並列出通過，exit code 為 1', () => {
    const broken = write('first-broken.json', '')
    const valid = write('second-valid.json', validScript)
    const { status, stdout, stderr } = run(broken, valid)
    assert.deepEqual({ status, stdout, stderrCount: stderr.length }, { status: 1, stdout: [`${valid}：通過`], stderrCount: 1 })
    assert.ok(stderr[0].startsWith(`${broken}：`), stderr[0])
  })

  it('沒有指定檔案：顯示用法，exit code 為 1，不會被當成通過', () => {
    const { status, stdout, stderr } = run()
    assert.deepEqual({ status, stdout, stderrCount: stderr.length }, { status: 1, stdout: [], stderrCount: 1 })
    assert.ok(stderr[0].startsWith('用法：'), stderr[0])
  })
})
