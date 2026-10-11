// 參考資料轉譯：把存下的整頁 HTML 轉成知識庫 Markdown（純函式，不讀寫檔案）
import type { Cheerio, CheerioAPI, SelectorType } from 'cheerio'
import { load } from 'cheerio'

export const CATEGORIES = ['boss', 'guide', 'character', 'summon'] as const
export type Category = typeof CATEGORIES[number]
export type Site = 'huiji' | 'nga' | 'generic'

export interface ConvertMeta {
  /** 參考資料類別（`reference/<category>/`） */
  category: Category
  /** 擷取時間：CLI 傳入來源 HTML 的 mtime，輸出到秒（UTC） */
  fetchedAt: Date
  /** 參考資料目錄名，頁面沒有標題時當作標題 */
  name: string
}

// cheerio 沒有轉出 domhandler 的節點型別，從 API 推導
type Root = ReturnType<CheerioAPI['root']>
type AnyNode = ReturnType<Root['contents']> extends Cheerio<infer T> ? T : never
type Element = ReturnType<Root['children']> extends Cheerio<infer T> ? T : never

type Block
  = | { kind: 'p', text: string }
    | { kind: 'heading', level: number, text: string }
    | { kind: 'list', ordered: boolean, items: Block[][] }
    | { kind: 'table', head: string[], rows: string[][] }
    | { kind: 'quote', blocks: Block[] }
    | { kind: 'hr' }
type Heading = Extract<Block, { kind: 'heading' }>

interface Ctx {
  $: CheerioAPI
  /** 來源網站的主機名，連到同站的連結只留文字 */
  host: string | undefined
  /** 目前所在的標題層級，產生的小標題比它深一層 */
  level: number
  /** 內容裡 h1–h6 的基準層級：hN 暫定為 base + N，最後再重新編號 */
  base: number
  /** 已在粗體內，不再加標記 */
  bold: boolean
}

// 行內字串裡的標記（私用區字元），等段落組好、知道前後文字後再處理：
// 粗體換成 **；標籤（例如預兆名）結尾若直接接文字，補一個空白
const BOLD_OPEN = '\uE000'
const BOLD_CLOSE = '\uE001'
const LABEL_END = '\uE002'
const BOLD_MARK = /[\uE000\uE001]/g
const MARKS = /[\uE000\uE001\uE002]/g

interface SiteConfig {
  /** 來源 URL 的主機（子網域也算），detectSite 依此判斷網站 */
  hosts: string[]
  /** 內容區塊 selector；未設定或找不到時依序找 main、article、body（SelectorType 讓 $(content) 的型別是 Element） */
  content?: SelectorType
  /** 共用的 NOISE 之外要清掉的雜訊 */
  noise?: string
  /** 站方提示框：含 icon 的 box 文字含 text 時整個清掉；只認得這段文字，避免誤刪其他提示框 */
  notice?: { icon: string, box: string, text: string }
  /** 頁面標題 selector；未設定時取內容區塊的第一個 h1（並從內容移除） */
  title?: string
  /** frontmatter 的 site */
  siteName: (page: { $: CheerioAPI, html: string, source: string | undefined }) => string | undefined
}

// 網站設定：每個網站一組內容區塊 selector 與清理規則，網站改版時只改這裡（ADR-0007）
const SITES: Record<Site, SiteConfig> = {
  huiji: {
    hosts: ['huijiwiki.com'],
    content: '#mw-content-text > .mw-parser-output',
    // MediaWiki 的編輯連結、目錄、導覽框、分類、註腳等
    noise: '.mw-editsection, #toc, .toc, .navbox, .catlinks, .noprint, sup.reference, .references, .mw-references-wrap',
    // 請登入帳號以修正表格寬度的提示框
    notice: { icon: 'img[alt^="Stamp"]', box: 'div[style*="border"]', text: '灰机Wiki账户' },
    title: '#firstHeading h1',
    siteName: ({ html }) => {
      const name = html.match(/"wgSiteName":"([^"]*)"/)?.[1]
      return name ? `灰机wiki（${name}）` : '灰机wiki'
    },
  },
  // NGA 的知識庫不 commit（ADR-0007），CLI 依 detectSite 決定輸出目錄；內容區塊 selector 等有範例 HTML 再加
  nga: {
    hosts: ['nga.cn', 'ngabbs.com', 'nga.178.com', 'ngacn.cc'],
    siteName: () => 'NGA',
  },
  // 其他網站：沒有相符的主機時使用
  generic: {
    hosts: [],
    siteName: ({ $, source }) => $('meta[property="og:site_name"]').attr('content')?.trim() || hostOf(source),
  },
}

// 依來源 URL 的主機判斷網站
export function detectSite(html: string): Site {
  const host = hostOf(findSourceUrl(html)) ?? ''
  const match = (h: string): boolean => host === h || host.endsWith(`.${h}`)
  return (Object.keys(SITES) as Site[]).find(site => SITES[site].hosts.some(match)) ?? 'generic'
}

export function convertHtml(html: string, site: Site, meta: ConvertMeta): string {
  const config = SITES[site]
  const $ = load(html)
  const source = findSourceUrl(html)
  const root = contentRoot($, config)
  clean($, root, config)
  const title = escapeText(pageTitle($, config, root) || meta.name)
  const blocks = renderBlocks(root.contents().toArray(), { $, host: hostOf(source), level: 1, base: 1, bold: false })
  const body = normalizeHeadings(blocks, [{ from: 1, to: 1 }]).map(serialize).join('\n\n')
  return `${frontmatter($, html, config, source, meta)}\n\n# ${title}\n\n${body}\n`
}

// 標題依文件順序重新編號：子標題只比父標題深一層、不跳級；超過 6 層改成粗體段落
function normalizeHeadings(blocks: Block[], stack: { from: number, to: number }[]): Block[] {
  return blocks.flatMap((block): Block[] => {
    switch (block.kind) {
      case 'heading': {
        while (stack.length > 1 && stack.at(-1)!.from >= block.level)
          stack.pop()
        const to = stack.at(-1)!.to + 1
        stack.push({ from: block.level, to })
        return to <= 6 ? [{ ...block, level: to }] : paragraphs(`${BOLD_OPEN}${block.text}${BOLD_CLOSE}`)
      }
      case 'list':
        return [{ ...block, items: block.items.map(item => normalizeHeadings(item, stack)) }]
      case 'quote':
        return [{ ...block, blocks: normalizeHeadings(block.blocks, stack) }]
      default:
        return [block]
    }
  })
}

// 所有網站共用的雜訊；各網站另外的雜訊與站方提示框見 SITES
const NOISE = 'script, style, noscript, template, link, meta, iframe, svg, canvas, nav, button, input, select, textarea'

function clean($: CheerioAPI, root: Cheerio<Element>, { noise, notice }: SiteConfig): void {
  root.find(NOISE).remove()
  if (noise)
    root.find(noise).remove()
  if (!notice)
    return
  root.find(notice.icon).each((_, icon) => {
    const box = $(icon).closest(notice.box)
    if (box.text().includes(notice.text))
      box.remove()
  })
}

// 內容區塊：網站設定的 selector 優先，找不到時依序找 main、article、body
function contentRoot($: CheerioAPI, { content }: SiteConfig): Cheerio<Element> {
  if (content) {
    const root = $(content).first()
    if (root.length)
      return root
  }
  const main = $('main').first()
  if (main.length)
    return main
  const article = $('article').first()
  return article.length ? article : $('body').first()
}

// 頁面標題：網站設定的 selector；沒有設定時取內容區塊的第一個 h1（並從內容移除）；都沒有時退回 <title>
function pageTitle($: CheerioAPI, config: SiteConfig, root: Cheerio<Element>): string {
  let title = ''
  if (config.title) {
    title = $(config.title).first().text()
  }
  else {
    const h1 = root.find('h1').first()
    title = h1.text()
    h1.remove()
  }
  if (!title.trim())
    title = $('title').first().text().split(' - ')[0]
  return title.replace(/\s+/g, ' ').trim()
}

function frontmatter($: CheerioAPI, html: string, config: SiteConfig, source: string | undefined, meta: ConvertMeta): string {
  const fields: [string, string | undefined][] = [
    ['source', source],
    ['site', config.siteName({ $, html, source })],
    ['author', $('meta[name="author"]').attr('content')?.trim()],
    ['fetchedAt', meta.fetchedAt.toISOString().replace(/\.\d+Z$/, 'Z')],
    ['category', meta.category],
  ]
  const lines = fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
  return ['---', ...lines, '---'].join('\n')
}

// 來源 URL：canonical 優先，其次是 Chrome 另存網頁時加的 saved from 註解
function findSourceUrl(html: string): string | undefined {
  const canonical = html.match(/<link\b[^>]+\brel=["']?canonical[^>]*>/i)?.[0]
  const href = canonical?.match(/\bhref=["']([^"']+)["']/i)?.[1]
  return href ?? html.match(/<!-- saved from url=\(\d+\)(\S+) -->/)?.[1]
}

function hostOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).hostname : undefined
  }
  catch {
    return undefined
  }
}

// ---------- DOM 走訪 ----------

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'center',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

function isElement(node: AnyNode): node is Element {
  return 'tagName' in node
}

function textOf(node: AnyNode): string | undefined {
  return 'data' in node && (node.type as string) === 'text' ? node.data : undefined
}

function childrenOf(ctx: Ctx, el: Element): AnyNode[] {
  return ctx.$(el).contents().toArray()
}

function hasClass(el: Element, name: string): boolean {
  return (el.attribs.class ?? '').split(/\s+/).includes(name)
}

// 灰機 wiki 的行內元件，內部即使有 div 也整個當成行內
const INLINE_WIDGETS = ['status-link', 'tooltips', 'label-item', 'swap-images']

// 行內元素若包著區塊元素（例如 small 包 ul），當成透明的區塊容器
function isBlock(el: Element): boolean {
  if (INLINE_WIDGETS.some(c => hasClass(el, c)))
    return false
  return BLOCK_TAGS.has(el.tagName) || el.children.some(c => isElement(c) && isBlock(c))
}

// ---------- 區塊 ----------

function renderBlocks(nodes: AnyNode[], ctx: Ctx): Block[] {
  const blocks: Block[] = []
  let inline = ''
  let level = ctx.level
  const flush = (): void => {
    blocks.push(...paragraphs(inline))
    inline = ''
  }
  for (const node of nodes) {
    const text = textOf(node)
    if (text !== undefined) {
      inline += renderText(text)
    }
    else if (isElement(node)) {
      const h = node.tagName.match(/^h([1-6])$/)?.[1]
      if (h) {
        // 原有的標題：之後兄弟元素產生的小標題排在它底下
        flush()
        const text = joinLines(inlineLines(node, ctx))
        if (text) {
          level = ctx.base + Number(h)
          blocks.push({ kind: 'heading', level, text })
        }
      }
      else if (isBlock(node)) {
        flush()
        blocks.push(...renderBlock(node, { ...ctx, level }))
      }
      else {
        inline += renderInline(node, { ...ctx, level })
      }
    }
  }
  flush()
  return blocks
}

function renderBlock(el: Element, ctx: Ctx): Block[] {
  if (hasClass(el, 'item-link'))
    return paragraphs(renderItemLink(el, ctx))
  if (hasClass(el, 'nav-tabs') && ctx.$(el).next('.tab-content').length)
    return renderTabs(el, ctx)
  if (hasClass(el, 'tab-content') && ctx.$(el).prev('.nav-tabs').length)
    return []
  switch (el.tagName) {
    case 'ul':
    case 'ol':
      return renderList(el, ctx)
    case 'table':
      return renderTable(el, ctx)
    case 'hr':
      return [{ kind: 'hr' }]
  }
  return renderBlocks(childrenOf(ctx, el), ctx)
}

// Bootstrap 分頁（灰機的 RichTab）：每個 pane 都輸出，以分頁標題當小標題
// active 與 pane id 是存檔當下的狀態，不使用
function renderTabs(ul: Element, ctx: Ctx): Block[] {
  const $ = ctx.$
  const titles = $(ul).children('li').toArray()
  return $(ul).next('.tab-content').children('.tab-pane').toArray().flatMap((pane, i) => {
    const text = titles[i] ? joinLines(inlineLines(titles[i], ctx)) : ''
    const level = text ? ctx.level + 1 : ctx.level
    const heading: Block[] = text ? [{ kind: 'heading', level, text }] : []
    return [...heading, ...renderBlocks(childrenOf(ctx, pane), { ...ctx, level, base: level })]
  })
}

function renderList(el: Element, ctx: Ctx): Block[] {
  const items: Block[][] = []
  for (const child of ctx.$(el).children().toArray()) {
    const blocks = child.tagName === 'li' ? renderBlocks(childrenOf(ctx, child), ctx) : renderBlock(child, ctx)
    if (blocks.length)
      items.push(blocks)
  }
  return items.length ? [{ kind: 'list', ordered: el.tagName === 'ol', items }] : []
}

// ---------- 表格 ----------

interface Cell {
  el: Element
  th: boolean
  row: number
  col: number
  colspan: number
  /** 格子內容壓成一行後是否為空（只有裝飾圖片也算空） */
  empty: boolean
}

interface Grid {
  /** grid[列][欄] 指向覆蓋該位置的原始格子，缺格為 undefined */
  rows: (Cell | undefined)[][]
  width: number
}

// 從該列開始的格子（依欄位順序）
function ownCells(grid: Grid, r: number): Cell[] {
  return [...new Set(grid.rows[r])].filter((c): c is Cell => c?.row === r)
}

// 展開 rowspan／colspan
function buildGrid(table: Element, ctx: Ctx): Grid {
  const $ = ctx.$
  const groups = $(table).children('thead, tbody, tfoot, tr').toArray()
  // 沒有格子的列（例如灰機的 tr.mw-empty-elt）不算
  const trs = groups.flatMap(el => (el.tagName === 'tr' ? [el] : $(el).children('tr').toArray()))
    .filter(tr => $(tr).children('td, th').length > 0)
  const grid: (Cell | undefined)[][] = trs.map(() => [])
  trs.forEach((tr, r) => {
    let c = 0
    for (const el of $(tr).children('td, th').toArray()) {
      while (grid[r][c])
        c++
      const rowspan = Math.min(Math.max(Number(el.attribs.rowspan) || 1, 1), trs.length - r)
      const colspan = Math.min(Math.max(Number(el.attribs.colspan) || 1, 1), 1000)
      const empty = !renderInlineChildren(el, ctx).replace(MARKS, '').trim()
      const cell: Cell = { el, th: el.tagName === 'th', row: r, col: c, colspan, empty }
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++)
          grid[r + dr][c + dc] = cell
      }
      c += colspan
    }
  })
  return { rows: grid, width: Math.max(0, ...grid.map(row => row.length)) }
}

// th 格子的內容整段加粗
function boldCell(cell: Cell, ctx: Ctx): Block[] {
  return paragraphs(`${BOLD_OPEN}${renderInlineChildren(cell.el, { ...ctx, bold: true })}${BOLD_CLOSE}`)
}

function renderTable(table: Element, ctx: Ctx): Block[] {
  const grid = buildGrid(table, ctx)
  // 排版用的表格（border:0）壓平：格子都是單純段落時接成一段
  if (/border:\s*(?:0(?:px)?|none)\s*(?:;|$)/i.test(table.attribs.style ?? '') || table.attribs.role === 'presentation') {
    const blocks = grid.rows.flatMap((_, r) => ownCells(grid, r)).flatMap(c => renderBlocks(childrenOf(ctx, c.el), ctx))
    const texts = blocks.flatMap(b => (b.kind === 'p' ? [b.text] : []))
    return texts.length === blocks.length ? paragraphs(texts.join(' ')) : blocks
  }
  // 單欄表格（例如灰機的預兆框）轉成引言區塊
  if (grid.width === 1) {
    const blocks = grid.rows.flatMap((_, r) => ownCells(grid, r))
      .filter(c => !c.empty)
      .flatMap(c => (c.th ? boldCell(c, ctx) : renderBlocks(childrenOf(ctx, c.el), ctx)))
    return blocks.length ? [{ kind: 'quote', blocks }] : []
  }
  // 整列表頭：本列自己的非空格子全是 th
  const isHeader = (r: number): boolean => {
    const cells = ownCells(grid, r).filter(c => !c.empty)
    return cells.length > 0 && cells.every(c => c.th)
  }
  const blocks: Block[] = []
  let level = ctx.level
  let segment: number[] = []
  const flush = (): void => {
    if (segment.length)
      blocks.push(...renderSegment(segment, grid, isHeader(segment[0]), { ...ctx, level }))
    segment = []
  }
  grid.rows.forEach((row, r) => {
    const cells = [...new Set(row)]
    const full = cells.length === 1 && cells[0]?.row === r && cells[0].colspan >= grid.width ? cells[0] : undefined
    if (!full) {
      if (isHeader(r))
        flush()
      segment.push(r)
      return
    }
    // 整列一格：th 是小標題，td 的內容拆到表格外
    flush()
    if (full.empty)
      return
    if (!full.th) {
      blocks.push(...renderBlocks(childrenOf(ctx, full.el), { ...ctx, level }))
      return
    }
    const heading = toHeading(full.el, ctx, ctx.level + 1)
    if (heading) {
      blocks.push(heading)
      level = heading.level
    }
    else {
      blocks.push(...boldCell(full, ctx))
    }
  })
  flush()
  return blocks
}

// 只有一行文字的元素才轉成標題
function toHeading(el: Element, ctx: Ctx, level: number): Heading | undefined {
  if (isComplex(el, ctx))
    return undefined
  const lines = inlineLines(el, ctx)
  return lines.length === 1 ? { kind: 'heading', level, text: lines[0] } : undefined
}

// 元素的行內文字（去掉粗體）逐行切開
function inlineLines(el: Element, ctx: Ctx): string[] {
  return resolveLabels(renderInlineChildren(el, ctx)).replace(BOLD_MARK, '').split('\n').map(l => l.replace(/ {2,}/g, ' ').trim()).filter(Boolean)
}

// 標題內的換行：兩側都是 ASCII 時補空白，碰到中日文或全形標點直接相接
function joinLines(lines: string[]): string {
  const ascii = (c: string): boolean => c.charCodeAt(0) < 0x80
  return lines.reduce((text, line) => (text && ascii(text.at(-1)!) && ascii(line[0]) ? `${text} ${line}` : text + line), '')
}

// 含巢狀表格、標題、分頁等無法放進 GFM 儲存格的內容
function isComplex(el: Element, ctx: Ctx): boolean {
  return ctx.$(el).find('table, h1, h2, h3, h4, h5, h6, blockquote, pre, hr, .tab-content').length > 0
}

// 一段連續的列：第一列是表頭時當作表頭
function renderSegment(rows: number[], grid: Grid, header: boolean, ctx: Ctx): Block[] {
  const body = header ? rows.slice(1) : rows
  // 格子放不進 GFM，或沒有表頭又有跨欄格子（欄位沒有意義）時，改用段落模式
  const cells = rows.flatMap(r => ownCells(grid, r))
  if (cells.some(c => isComplex(c.el, ctx)) || (!header && cells.some(c => c.colspan > 1)))
    return renderParagraphMode(body, grid, header ? rows[0] : undefined, ctx)
  const cellText = (r: number, c: number): string => {
    const cell = grid.rows[r][c]
    if (!cell || cell.col !== c)
      return ''
    if (cell.row !== r)
      return cell.empty ? '' : '（同上）'
    return flattenBlocks(renderBlocks(childrenOf(ctx, cell.el), ctx)).join('<br>').replaceAll('|', '\\|')
  }
  const line = (r: number): string[] => Array.from({ length: grid.width }, (_, c) => cellText(r, c))
  const head = header ? line(rows[0]) : Array.from<string>({ length: grid.width }).fill('')
  return [{ kind: 'table', head, rows: body.map(line) }]
}

// 段落模式：依列、欄順序輸出每格內容；有表頭時以欄名當小標題
function renderParagraphMode(rows: number[], grid: Grid, header: number | undefined, ctx: Ctx): Block[] {
  const blocks: Block[] = []
  for (const r of rows) {
    for (const cell of ownCells(grid, r)) {
      if (cell.empty)
        continue
      const name = header === undefined ? undefined : grid.rows[header][cell.col]
      const heading = name && !name.empty ? toHeading(name.el, ctx, ctx.level + 1) : undefined
      if (heading)
        blocks.push(heading)
      blocks.push(...renderBlocks(childrenOf(ctx, cell.el), heading ? { ...ctx, level: heading.level } : ctx))
    }
  }
  return blocks
}

// 格子內容壓成多行文字（之後以 <br> 接起），清單改用 • 符號
const BULLETS = ['• ', '◦ ', '▪ ']

function flattenBlocks(blocks: Block[], depth = 0): string[] {
  return blocks.flatMap((block) => {
    switch (block.kind) {
      case 'p':
        return block.text.split('\n')
      case 'list':
        return block.items.flatMap((item, i) => {
          const lines = flattenBlocks(item, depth + 1)
          const bullet = block.ordered ? `${i + 1}. ` : BULLETS[depth % BULLETS.length]
          return lines.map((l, j) => (j === 0 ? bullet + l : l))
        })
      default:
        return serialize(block).split('\n')
    }
  })
}

// ---------- 行內 ----------

function resolveLabels(s: string): string {
  return s.replace(/\uE002(?=[\uE000\uE001]*[^\s\p{P}\p{S}\uE000\uE001\uE002])/gu, ' ').replaceAll(LABEL_END, '')
}

function renderText(text: string): string {
  return escapeText(text.replace(MARKS, '').replace(/[ \t\n\r\f\u00A0]+/g, ' '))
}

function escapeText(text: string): string {
  return text
    .replace(/[\\`*_[\]~]/g, '\\$&')
    .replace(/<(?=[a-z/!?])/gi, '\\<')
    .replace(/&(?=#?\w+;)/g, '\\&')
}

function renderNode(node: AnyNode, ctx: Ctx): string {
  const text = textOf(node)
  if (text !== undefined)
    return renderText(text)
  return isElement(node) ? renderInline(node, ctx) : ''
}

function renderInlineChildren(el: Element, ctx: Ctx): string {
  return childrenOf(ctx, el).map(node => renderNode(node, ctx)).join('')
}

function renderInline(el: Element, ctx: Ctx): string {
  if (hasClass(el, 'status-link'))
    return renderStatusLink(el, ctx)
  if (hasClass(el, 'item-link'))
    return renderItemLink(el, ctx)
  if (hasClass(el, 'tooltips'))
    return renderTooltip(el, ctx)
  if (hasClass(el, 'label-item'))
    return renderInlineChildren(el, ctx) + LABEL_END
  switch (el.tagName) {
    case 'br':
      return '\n'
    case 'img':
      return renderImage(el)
    case 'a':
      return renderLink(el, ctx)
    case 'b':
    case 'strong':
      return ctx.bold ? renderInlineChildren(el, ctx) : `${BOLD_OPEN}${renderInlineChildren(el, { ...ctx, bold: true })}${BOLD_CLOSE}`
  }
  // 行內情境中遇到區塊元素時以換行隔開
  const inner = renderInlineChildren(el, ctx)
  return BLOCK_TAGS.has(el.tagName) ? `\n${inner}\n` : inner
}

// 站內連結只留文字；外部連結保留網址（例如帶 questId 的自發連結）
function renderLink(el: Element, ctx: Ctx): string {
  const text = renderInlineChildren(el, ctx)
  const href = el.attribs.href ?? ''
  if (!/^https?:\/\//i.test(href) || hostOf(href) === ctx.host)
    return text
  const url = href.replace(/[\s()<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
  return text.replace(MARKS, '').trim() ? `[${text}](${url})` : `<${url}>`
}

// 灰機 wiki 的 tooltip：hover 才顯示的內容接在後面的（）內
function renderTooltip(el: Element, ctx: Ctx): string {
  let visible = ''
  let tip = ''
  for (const node of childrenOf(ctx, el)) {
    if (isElement(node) && hasClass(node, 'tooltips-content'))
      tip += renderInlineChildren(node, ctx)
    else
      visible += renderNode(node, ctx)
  }
  return visible + tipText(tip)
}

function tipText(tip: string): string {
  const text = resolveLabels(tip).split('\n').map(l => l.replace(/ {2,}/g, ' ').trim()).filter(Boolean).join('；')
  return text ? `（${text}）` : ''
}

// ---------- 圖示 ----------

// alt「Status 4052 1.png」→ 4052_1；沒有 alt 時改看檔名「22px-Status_4052_1.png」
function statusId(img: Element): string | undefined {
  const alt = img.attribs.alt?.match(/^Status (\d+(?: \d+)*)\.png$/i)?.[1]
  return alt?.replaceAll(' ', '_') ?? img.attribs.src?.match(/(?:^|\/)(?:\d+px-)?Status_(\d+(?:_\d+)*)\.png$/i)?.[1]
}

// 灰機 wiki 的 status 圖示 + 名稱：[status:<ID,...> <名稱>]，輪播組列出全部 ID
function renderStatusLink(el: Element, ctx: Ctx): string {
  const $el = ctx.$(el)
  const ids = $el.find('.status-icon img').toArray().map(statusId).filter(Boolean)
  if (!ids.length)
    return renderInlineChildren(el, ctx)
  const nameEl = $el.find('.status-name').first().clone()
  nameEl.find('.tooltips-content').remove()
  const name = renderText(nameEl.text()).trim()
  const tip = $el.find('.tooltips-content').toArray().map(t => renderInlineChildren(t, ctx)).join('\n')
  return `[status:${ids.join(',')}${name ? ` ${name}` : ''}]${tipText(tip)}`
}

// 預兆類型圖示（灰機 wiki 的 Status 1／2 不是 buff）
const OMEN_TYPES: Record<string, string> = { 1: '[架势技]', 2: '[咏唱技]' }

// 其他圖片：alt 是檔名的視為裝飾不輸出，有文字說明的輸出 [img:說明]
function renderImage(img: Element): string {
  const id = statusId(img)
  if (id)
    return OMEN_TYPES[id] ?? `[status:${id}]`
  const alt = (img.attribs.alt || img.attribs.title || '').replace(/\s+/g, ' ').trim()
  return alt && !/\.(?:png|jpe?g|gif|webp|svg|bmp)$/i.test(alt) ? `[img:${escapeText(alt)}]` : ''
}

// 道具與 boss 頭像：圖示的 alt 與名稱相同，只輸出名稱
function renderItemLink(el: Element, ctx: Ctx): string {
  const name = ctx.$(el).find('.item-name').first()
  return name.length ? renderInlineChildren(name[0], ctx) : escapeText(el.attribs.title ?? '')
}

// ---------- 段落 ----------

const PUNCT = /[\p{P}\p{S}]/u
const SPACE = /\s/u

// 行內字串切成段落：<br> 是段內換行，連續兩個 <br> 開新段落
function paragraphs(inline: string): Block[] {
  const result: Block[] = []
  let lines: string[] = []
  let open = false
  const end = (): void => {
    if (lines.length) {
      const text = resolveBold(lines.join('\n') + (open ? BOLD_CLOSE : ''))
      result.push({ kind: 'p', text: text.split('\n').map(l => escapeLineStart(l.trim())).filter(Boolean).join('\n') })
    }
    lines = []
  }
  for (const raw of resolveLabels(inline).replaceAll(BOLD_CLOSE + BOLD_OPEN, '').split('\n')) {
    const line = raw.replace(/ {2,}/g, ' ')
    if (!line.replace(BOLD_MARK, '').trim()) {
      end()
      for (const m of line.match(BOLD_MARK) ?? [])
        open = m === BOLD_OPEN
      continue
    }
    if (!lines.length && open)
      lines.push(BOLD_OPEN + line)
    else
      lines.push(line)
    for (const m of line.match(BOLD_MARK) ?? [])
      open = m === BOLD_OPEN
  }
  end()
  return result
}

// 把粗體標記換成 **：空白與會破壞 CommonMark 界定規則的標點移到標記外
function resolveBold(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const start = s.indexOf(BOLD_OPEN, i)
    if (start < 0) {
      out += s.slice(i)
      break
    }
    let stop = s.indexOf(BOLD_CLOSE, start)
    if (stop < 0)
      stop = s.length
    out += s.slice(i, start)
    const inner = s.slice(start + 1, stop).replace(BOLD_MARK, '')
    const next = s.slice(stop + 1).replace(BOLD_MARK, '')[0]
    out += wrapBold(inner, out.at(-1), next)
    i = stop + 1
  }
  return out
}

// 移動時不可拆開的單位：跳脫字元、[識別文字]、連結、自動連結
const UNIT = /\\[\s\S]|\[[^\]]*\](?:\([^)]*\))?|<https?:[^>]*>|[\s\S]/gu

function wrapBold(inner: string, prev: string | undefined, next: string | undefined): string {
  const lead = inner.match(/^\s*/)![0]
  const trail = inner.match(/\s*$/)![0]
  const units = [...inner.slice(lead.length, inner.length - trail.length).matchAll(UNIT)].map(m => m[0])
  const loose = (c: string | undefined): boolean => c === undefined || SPACE.test(c) || PUNCT.test(c)
  let before = ''
  let after = ''
  if (!loose(lead ? ' ' : prev)) {
    while (units.length && PUNCT.test(units[0][0]))
      before += units.shift()
  }
  if (!loose(trail ? ' ' : next)) {
    while (units.length && PUNCT.test(units.at(-1)!.at(-1)!))
      after = units.pop() + after
  }
  const core = units.join('')
  return core ? `${lead}${before}**${core}**${after}${trail}` : `${lead}${before}${after}${trail}`
}

// 行首若像 Markdown 語法（標題、引言、清單、分隔線）就跳脫
function escapeLineStart(line: string): string {
  return line
    .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
    .replace(/^>/, '\\>')
    .replace(/^([-+])(?=\s|$)/, '\\$1')
    .replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2')
    .replace(/^(=+|-+)$/, '\\$1')
}

// ---------- 輸出 ----------

function serialize(block: Block): string {
  switch (block.kind) {
    case 'p':
      return block.text
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`
    case 'list':
      return block.items.map((item, i) => {
        const marker = block.ordered ? `${i + 1}. ` : '- '
        return marker + indent(serializeItem(item), marker.length)
      }).join('\n')
    case 'table': {
      const row = (cells: string[]): string => `| ${cells.join(' | ')} |`
      return [row(block.head), row(block.head.map(() => '---')), ...block.rows.map(row)].join('\n')
    }
    case 'quote':
      return block.blocks.map(serialize).join('\n\n').split('\n').map(l => (l ? `> ${l}` : '>')).join('\n')
    case 'hr':
      return '---'
  }
}

// 清單項目內：段落後接子清單時緊接，其餘區塊之間空一行
function serializeItem(blocks: Block[]): string {
  return blocks.map((b, i) => {
    if (i === 0)
      return serialize(b)
    return (b.kind === 'list' && blocks[i - 1].kind === 'p' ? '\n' : '\n\n') + serialize(b)
  }).join('')
}

function indent(text: string, width: number): string {
  return text.split('\n').map((line, i) => (i === 0 || !line ? line : ' '.repeat(width) + line)).join('\n')
}
