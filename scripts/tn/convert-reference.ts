// 參考資料轉譯：npx tsx scripts/tn/convert-reference.ts
// reference/<類別>/<名稱>/ 內的整頁 HTML → knowledge/<類別>/<名稱>.md（NGA 來源改放 knowledge/guide/nga/）
// 來源 mtime 未晚於知識庫 frontmatter 的 fetchedAt 時跳過；每次執行都確保 .git/info/exclude 排除參考資料與 NGA 知識庫（ADR-0007）
import type { Category } from './convert-html'
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { CATEGORIES, convertHtml, detectSite } from './convert-html'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EXCLUDES = ['reference/', 'knowledge/guide/nga/']

const rel = (path: string): string => relative(root, path).replaceAll('\\', '/')

// .git/info/exclude 不受版本控制，新 clone 會遺失，所以每次都檢查；worktree 共用主 repo 的這個檔
function ensureExcluded(): string[] {
  const file = resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: root, encoding: 'utf8' }).trim())
  const content = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const lines = new Set(content.split(/\r?\n/).map(line => line.trim()))
  const missing = EXCLUDES.filter(pattern => !lines.has(pattern))
  if (missing.length) {
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${content && !content.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`)
  }
  return missing
}

// 來源 mtime（到秒）未晚於知識庫的 fetchedAt 時不必重轉
function isUpToDate(target: string, mtime: Date): boolean {
  if (!existsSync(target))
    return false
  const fetchedAt = readFileSync(target, 'utf8').match(/^fetchedAt: "([^"]+)"\r?$/m)?.[1]
  return fetchedAt !== undefined && Math.floor(mtime.getTime() / 1000) * 1000 <= Date.parse(fetchedAt)
}

function isCategory(name: string): name is Category {
  return (CATEGORIES as readonly string[]).includes(name)
}

const added = ensureExcluded()
if (added.length)
  console.log(`已在 .git/info/exclude 加入：${added.join('、')}`)

const referenceDir = join(root, 'reference')
let eslint: ESLint | undefined
let converted = 0
let skipped = 0

for (const category of existsSync(referenceDir) ? readdirSync(referenceDir, { withFileTypes: true }) : []) {
  if (!category.isDirectory())
    continue
  if (!isCategory(category.name)) {
    console.warn(`略過 reference/${category.name}/：類別目錄須為 ${CATEGORIES.join('、')}`)
    continue
  }
  for (const entry of readdirSync(join(referenceDir, category.name), { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (/\.html?$/i.test(entry.name))
        console.warn(`略過 reference/${category.name}/${entry.name}：請放進 reference/${category.name}/<名稱>/ 目錄`)
      continue
    }
    const dir = join(referenceDir, category.name, entry.name)
    const htmls = readdirSync(dir).filter(file => /\.html?$/i.test(file))
    if (htmls.length !== 1) {
      console.warn(`略過 ${rel(dir)}/：應有且只有一個 HTML 檔，找到 ${htmls.length} 個`)
      continue
    }
    const source = join(dir, htmls[0])
    const html = readFileSync(source, 'utf8')
    const site = detectSite(html)
    const target = site === 'nga'
      ? join(root, 'knowledge', 'guide', 'nga', `${entry.name}.md`)
      : join(root, 'knowledge', category.name, `${entry.name}.md`)
    const mtime = statSync(source).mtime
    if (isUpToDate(target, mtime)) {
      skipped++
      continue
    }
    const markdown = convertHtml(html, site, { category: category.name, fetchedAt: mtime, name: entry.name })
    // 以 repo 的 ESLint 設定格式化（Prettier 對齊表格），讓知識庫通過 pnpm lint
    eslint ??= new ESLint({ cwd: root, fix: true })
    const [result] = await eslint.lintText(markdown, { filePath: target })
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, result.output ?? markdown)
    for (const message of result.messages) {
      console.warn(`${rel(target)}:${message.line}:${message.column} ${message.message}`)
      process.exitCode = 1
    }
    console.log(`已轉譯 ${rel(source)} → ${rel(target)}`)
    converted++
  }
}

console.log(`完成：轉譯 ${converted} 個，跳過 ${skipped} 個（來源未變）`)
