import type { ConvertMeta } from './convert-html'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { convertHtml, detectSite } from './convert-html'

// 手寫的灰機 wiki 頁面骨架，只保留轉譯會用到的部分
function huijiPage(content: string): string {
  return `<!DOCTYPE html>
<!-- saved from url=(0040)https://gbf.huijiwiki.com/wiki/Boss/test -->
<html lang="zh-Hans"><head><meta charset="UTF-8">
<title>测试Boss - 碧蓝幻想中文维基 - 灰机wiki</title>
<script>RLCONF={"wgPageName":"Boss/测试Boss","wgSiteName":"碧蓝幻想中文维基"};</script>
<link rel="canonical" href="https://gbf.huijiwiki.com/wiki/Boss/test">
</head><body class="skin-huiji-dragonhide">
<main id="content"><article>
<header id="firstHeading"><h1>测试Boss</h1><a>刷新</a></header>
<section id="bodyContent">
<div class="huiji-ad-slot-pilot">广告</div>
<div id="mw-content-text"><div class="mw-parser-output"><div class="element-any">${content}</div>
<!-- NewPP limit report Cached time: 20261010061432 --></div></div>
</section></article></main>
<div class="bottom footer"><div class="mw-parser-output">本维基是由爱好者制作的网页游戏</div></div>
</body></html>`
}

// 一般網站的頁面
function plainPage(body: string, head = ''): string {
  return `<!DOCTYPE html><html><head><title>攻略 - 某站</title>${head}</head><body>${body}</body></html>`
}

const meta: ConvertMeta = { category: 'boss', fetchedAt: new Date('2026-10-11T04:56:34.617Z'), name: 'Lv350 测试' }

// 去掉 frontmatter 與 H1，只留正文
function bodyOf(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n\n# .*\n\n?/, '').trimEnd()
}

describe('convertHtml：frontmatter 與標題', () => {
  it('記錄來源、站名、擷取時間（UTC，到秒）與類別，沒有作者時省略 author', () => {
    const md = convertHtml(huijiPage('<p>内容</p>'), 'huiji', meta)
    assert.equal(md, [
      '---',
      'source: "https://gbf.huijiwiki.com/wiki/Boss/test"',
      'site: "灰机wiki（碧蓝幻想中文维基）"',
      'fetchedAt: "2026-10-11T04:56:34Z"',
      'category: "boss"',
      '---',
      '',
      '# 测试Boss',
      '',
      '内容',
      '',
    ].join('\n'))
  })

  it('一般網站：作者取自 meta author，站名取自 og:site_name，標題取自內容區塊的 h1', () => {
    const head = '<link rel="canonical" href="https://example.com/a"><meta name="author" content="某作者"><meta property="og:site_name" content="某站">'
    const md = convertHtml(plainPage('<main><h1>某篇攻略</h1><p>正文</p></main>', head), 'generic', meta)
    assert.equal(md, [
      '---',
      'source: "https://example.com/a"',
      'site: "某站"',
      'author: "某作者"',
      'fetchedAt: "2026-10-11T04:56:34Z"',
      'category: "boss"',
      '---',
      '',
      '# 某篇攻略',
      '',
      '正文',
      '',
    ].join('\n'))
  })

  it('一般網站沒有 h1 時，標題取自 <title> 的第一段', () => {
    assert.match(convertHtml(plainPage('<p>正文</p>'), 'generic', meta), /\n# 攻略\n/)
  })
})

describe('convertHtml：內容區塊', () => {
  it('灰機 wiki 只取 #mw-content-text 內的內容，頁尾、廣告與頁首不混入（當成一般網站則會混入）', () => {
    assert.equal(bodyOf(convertHtml(huijiPage('<p>内容</p>'), 'huiji', meta)), '内容')
    assert.match(bodyOf(convertHtml(huijiPage('<p>内容</p>'), 'generic', meta)), /刷新[\s\S]*广告[\s\S]*内容/)
  })

  it('未支援的網站依序 fallback 到 main、article、body', () => {
    const outside = '<nav>导航</nav><footer>页尾</footer>'
    assert.equal(bodyOf(convertHtml(plainPage(`${outside}<article><p>文章</p></article><main><p>主要</p></main>`), 'generic', meta)), '主要')
    assert.equal(bodyOf(convertHtml(plainPage(`${outside}<article><p>文章</p></article>`), 'generic', meta)), '文章')
    assert.equal(bodyOf(convertHtml(plainPage('<div><p>全部</p></div>'), 'generic', meta)), '全部')
  })

  it('丟棄 script、style、HTML 註解、空段落與灰機的站方提示框', () => {
    const content = `<p><br></p><!-- Using template from Html:RichTab/a1 -->
      <script>var a = 1</script><style>.x{}</style><noscript>请启用 JS</noscript>
      <div style="overflow: auto;border: 5px solid #490806;"><div style="display:table-row">
        <div style="display:table-cell"><div><img alt="Stamp45.png" src="./X_files/96px-Stamp45.png"></div></div>
        <div style="display:table-cell">如果表格内容向网页右侧延伸，请注册并登录您的灰机Wiki账户，然后刷新页面。</div>
      </div></div>
      <p><b>※特动效果探寻中</b></p>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), '**※特动效果探寻中**')
  })
})

describe('convertHtml：行內文字', () => {
  it('<br> 是段內換行，連續兩個 <br> 開新段落，段尾的 <br> 不留空行', () => {
    const md = convertHtml(huijiPage('<p>第一行<br>第二行<br><br>新段落<br>\n</p>'), 'huiji', meta)
    assert.equal(bodyOf(md), '第一行\n第二行\n\n新段落')
  })

  it('粗體保留；前後空白與會破壞粗體的標點移到 ** 外', () => {
    const md = convertHtml(huijiPage('<p><b>解除条件：</b>赋予10个弱体效果</p><p><b>15% </b>或<b> 破坏之力</b>到达100%时</p>'), 'huiji', meta)
    assert.equal(bodyOf(md), '**解除条件**：赋予10个弱体效果\n\n**15%** 或 **破坏之力**到达100%时')
  })

  it('跳脫會被誤認為 Markdown 語法的字元', () => {
    const md = convertHtml(huijiPage('<p>100~81% *注* [a]</p><p>1. 不是清单<br># 不是标题</p>'), 'huiji', meta)
    assert.equal(bodyOf(md), '100\\~81% \\*注\\* \\[a\\]\n\n1\\. 不是清单\n\\# 不是标题')
  })
})

describe('convertHtml：清單', () => {
  it('ul／ol 轉成 Markdown 清單，巢狀清單縮排，small 包住的清單也展開', () => {
    const content = `<ul><li>甲<ul><li>甲一</li></ul></li><li>乙<br>乙续<br><br></li></ul>
      <p>说明</p><small class="text-blue"><ul><li>丙</li></ul></small>
      <p>步骤</p><ol><li>一</li><li>二</li></ol>`
    const md = convertHtml(huijiPage(content), 'huiji', meta)
    assert.equal(bodyOf(md), '- 甲\n  - 甲一\n- 乙\n  乙续\n\n说明\n\n- 丙\n\n步骤\n\n1. 一\n2. 二')
  })
})

// status-link：圖示 + 名稱
function status(ids: string[], name: string): string {
  const imgs = ids.map(id => `<img alt="Status ${id}.png" src="./X_files/22px-Status_${id.replaceAll(' ', '_')}.png" class="img-fit">`).join('')
  const icon = ids.length > 1 ? `<div class="swap-images" data-speed="3">${imgs}</div>` : imgs
  return `<span class="status-link self-link" title="角色独特状态"><span class="status-icon">${icon}</span>${name}</span>`
}

describe('convertHtml：圖示與 wiki 元件', () => {
  it('status 圖示轉成 [status:<ID> <名稱>]，ID 取自 alt，名稱取自 .status-name', () => {
    const content = `<p>开场试炼${status(['4051'], '<span class="status-name">破壊の法灯</span>')}存在时</p>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), '开场试炼[status:4051 破壊の法灯]存在时')
  })

  it('輪播組列出整組 ID；只有圖示或名稱是空白時只輸出 ID', () => {
    // 輪播組含 div，放在 <p> 內會被 HTML 解析器拆開，所以用 div 包
    const content = `<div>${status(['4055 1', '4055 2'], '<span class="status-name">光背</span>')}</div>
      <div>赋予12/${status(['3348'], '')}<span style="color:#ba7054">15</span>个弱体效果</div>
      <div>若已解除完${status(['4052 1', '4052 2'], '<span class="status-name">&nbsp;</span>')}六属法灯</div>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      '[status:4055_1,4055_2 光背]',
      '',
      '赋予12/[status:3348]15个弱体效果',
      '',
      '若已解除完[status:4052_1,4052_2]六属法灯',
    ].join('\n'))
  })

  it('預兆類型圖示 Status 1／2 轉成 [架势技]／[咏唱技]，不當成 status', () => {
    const content = `<p><b>100~81%</b><span class="label-item label-item-color-yellow"><img alt="Status 1.png" src="./X_files/19px-Status_1.png">身光</span>
      <span class="label-item label-color-purple" data-tag="咏唱技" title="詠唱技"><a href="https://gbf.huijiwiki.com/wiki/%E7%89%B9%E6%AE%8A%E6%8A%80" title="特殊技#咏唱技"><img alt="Status 2.png"></a>黄泉</span></p>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), '**100\\~81%**[架势技]身光 [咏唱技]黄泉')
  })

  it('標籤（例如預兆名）後面直接接文字時以空白隔開，接標點時不加', () => {
    const content = `<p>HP50%预兆<span class="label-item label-item-color-yellow"><img alt="Status 1.png">浄土</span>解除/触发前</p>
      <p><span class="label-item label-item-color-purple"><img alt="Status 2.png">神撃</span><small class="text-blue">第三阶段连续预兆</small></p>
      <p>AT时间加成：<span style="display:inline-block"><span class="label-item label-color-red">不享受</span></span>，<span class="label-item label-color-normal">通常</span> 对我方</p>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      'HP50%预兆[架势技]浄土 解除/触发前',
      '',
      '[咏唱技]神撃 第三阶段连续预兆',
      '',
      'AT时间加成：不享受，通常 对我方',
    ].join('\n'))
  })

  it('道具與 boss 頭像只輸出一次名稱；裝飾圖片不輸出，有文字說明的圖片輸出 [img:說明]', () => {
    const content = `<p><span class="item-link type-s" title="创世·维萨西娅"><span class="item-icon"><img alt="创世·维萨西娅" title="创世·维萨西娅" src="./X_files/25px-Enemy_7300883.png"></span><span class="item-name">创世·维萨西娅</span></span>获得
      <img alt="Versusia icon 0.png" src="./X_files/Versusia_icon_0.png"> <b>破坏之神意</b>玩家
      <img alt="Status Passive effect 1.png"> 被动技能 <img alt="阶段示意图" src="./X_files/a.png"></p>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), '创世·维萨西娅获得 **破坏之神意**玩家 被动技能 [img:阶段示意图]')
  })

  it('tooltip 的隱藏內容接在後面的（）內，其中的換行改成；', () => {
    const content = `<p><span class="tooltips"><span class="dotted">使用5次技能</span><span class="tooltips-content" style="">冷却为0的技能不计算在内</span></span></p>
      <div><span class="status-link" data-tag="强压"><span class="status-icon"><a href="https://gbf.huijiwiki.com/wiki/%E8%AF%85%E5%92%92" title="诅咒"><img alt="Status 1012 1.png"></a></span><span class="tooltips dotted"><span class="status-name"><a href="https://gbf.huijiwiki.com/wiki/%E8%AF%85%E5%92%92" title="诅咒">强压</a></span><span class="tooltips-content">无法回复HP</span></span></span></div>
      <p><span class="tooltips"><span class="dotted">开启新的一轮</span><span class="tooltips-content">抽取第2轮时×2<br>抽取第3轮时×3</span></span></p>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      '使用5次技能（冷却为0的技能不计算在内）',
      '',
      '[status:1012_1 强压]（无法回复HP）',
      '',
      '开启新的一轮（抽取第2轮时×2；抽取第3轮时×3）',
    ].join('\n'))
  })

  it('站內連結只留文字；外部連結保留網址，只有圖示時輸出網址本身', () => {
    const content = `<p>自发链接：<a href="http://game.granbluefantasy.jp/#quest/supporter/305701/1/0/572" target="_blank" rel="nofollow noreferrer noopener"><img alt="GBFfavicon.png" src="./X_files/22px-GBFfavicon.png"></a>
      门票：<a href="https://gbf.huijiwiki.com/wiki/Item/572" title="Item/572">究极存储器</a> <a href="https://example.com/x">外部</a></p>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), '自发链接：<http://game.granbluefantasy.jp/#quest/supporter/305701/1/0/572> 门票：究极存储器 [外部](https://example.com/x)')
  })
})

describe('convertHtml：表格', () => {
  it('轉成 GFM 表格：丟棄空列，rowspan 延伸的格填（同上），colspan 延伸的格與缺格留空，格內清單與換行壓成一行', () => {
    const content = `<table class="wikitable ec"><tbody><tr class="mw-empty-elt"></tr>
      <tr><th colspan="2">被动技能</th><th>破坏之神意</th></tr>
      <tr><td>破坏玩家</td><td>再生玩家</td><td rowspan="2"><ul><li>追击</li><li>延长<small>（2回合）</small></li></ul></td></tr>
      <tr><td>a|b<br>第二行</td></tr>
      </tbody></table>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      '| 被动技能 |  | 破坏之神意 |',
      '| --- | --- | --- |',
      '| 破坏玩家 | 再生玩家 | • 追击<br>• 延长（2回合） |',
      '| a\\|b<br>第二行 |  | （同上） |',
    ].join('\n'))
  })

  it('整列 th 轉成小標題（有換行時改為粗體段落），整列 td 拆到表格外，中段的全 th 列開新表格', () => {
    const content = `<table class="wikitable ec"><tbody>
      <tr><th colspan="2">独有系统 </th></tr>
      <tr><td colspan="2">说明文字</td></tr>
      <tr><th>甲</th><th>乙</th></tr>
      <tr><td>1</td><td>2</td></tr>
      <tr><th colspan="2">阶段1：<b>破坏之力</b>50%<br>第二行</th></tr>
      <tr><th>丙</th><th>丁</th></tr>
      <tr><td>3</td><td>4</td></tr>
      </tbody></table>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      '## 独有系统',
      '',
      '说明文字',
      '',
      '| 甲 | 乙 |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '**阶段1：破坏之力50%',
      '第二行**',
      '',
      '| 丙 | 丁 |',
      '| --- | --- |',
      '| 3 | 4 |',
    ].join('\n'))
  })

  it('格子含巢狀表格時改用段落模式（欄名轉成小標題），單欄表格（預兆框）轉成引言區塊', () => {
    const content = `<table class="wikitable ec"><tbody><tr class="mw-empty-elt"></tr>
      <tr><th style="width:25%">满豆技</th><th>特殊行动</th></tr>
      <tr><td><p><b>100~81%</b><span class="label-item"><img alt="Status 1.png">身光</span><br></p>
        <table border="2" width="100%" style="border-color:yellow"><tbody>
          <tr><td bgcolor="FFE4E1"><b>解除条件：</b>赋予10个弱体效果</td></tr>
          <tr><td>全体30倍随机属性伤害<br><p>并施加</p><ul><li>技能伤害减免（70%）</li></ul></td></tr>
        </tbody></table><hr>
        <p><b>90%</b>第二个</p></td>
      <td>加入战斗时</td></tr>
      </tbody></table>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      '## 满豆技',
      '',
      '**100\\~81%**[架势技]身光',
      '',
      '> **解除条件**：赋予10个弱体效果',
      '>',
      '> 全体30倍随机属性伤害',
      '>',
      '> 并施加',
      '>',
      '> - 技能伤害减免（70%）',
      '',
      '---',
      '',
      '**90**%第二个',
      '',
      '## 特殊行动',
      '',
      '加入战斗时',
    ].join('\n'))
  })

  it('沒有表頭、又有跨欄格子的列改用段落模式', () => {
    const content = `<table class="wikitable"><tr><th>甲</th><th>乙</th><th>丙</th></tr><tr><td>1</td><td>2</td><td>3</td></tr>
      <tr><th colspan="3">被动技能</th></tr>
      <tr><td colspan="2"><ul><li>说明一</li><li>说明二</li></ul></td><td>Break 效果</td></tr></table>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      '| 甲 | 乙 | 丙 |',
      '| --- | --- | --- |',
      '| 1 | 2 | 3 |',
      '',
      '## 被动技能',
      '',
      '- 说明一',
      '- 说明二',
      '',
      'Break 效果',
    ].join('\n'))
  })

  it('排版用的表格（border:0）壓平成一段文字', () => {
    const item = (name: string): string => `<div class="flex-item"><div class="item-link type-m" title="${name}"><div class="item-icon"><a href="https://gbf.huijiwiki.com/wiki/Item/619" title="${name}"><img alt="${name}" src="./X_files/IT_m_619.jpg"></a></div><div class="item-name"><a href="https://gbf.huijiwiki.com/wiki/Item/619" title="Item/619">${name}</a></div></div></div>`
    const content = `<table style="border:0"><tbody><tr style="border:0"><td style="border:0; width:90px;">主要掉落：</td>
      <td style="border:0"><div class="flex-list">${item('维萨西娅之角')}${item('轮回的雷炎')}</div></td></tr></tbody></table>
      <table style="border:0"><tbody><tr><td rowspan="2" style="border:0;"><b>次元连锁</b></td><td style="border:0;"><img alt="Btn singlarity chain 1 1.png"></td></tr>
      <tr><td style="border:0;"><img alt="Btn singlarity chain 1 0.png"></td></tr></tbody></table>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), '主要掉落： 维萨西娅之角 轮回的雷炎\n\n**次元连锁**')
  })
})

// 灰機 wiki 的 RichTab（Bootstrap 3 tabs）
function tabs(id: string, titles: string[], panes: string[], active = 0): string {
  const lis = titles.map((t, i) => `<li role="presentation" class="${i === active ? 'active' : ''}"><!-- Using template from Html:RichTab/a1 --><a href="https://gbf.huijiwiki.com/wiki/Boss/test#tab-${id}${i}" aria-controls="tab-${id}${i}" role="tab" data-toggle="tab">${t}</a></li>`)
  const divs = panes.map((p, i) => `<div role="tabpanel" class="tab-pane${i === active ? ' active' : ''}" id="tab-${id}${i}">${p}</div>`)
  return `<div><ul class="nav nav-tabs" role="tablist">${lis.join('')}</ul>\n<div class="tab-content">${divs.join('')}</div></div>`
}

function stageTabs(active: number, innerActive: number, id = '1129534'): string {
  const inner = tabs(`${id}2`, [
    '<img alt="Versusia icon 0.png"> <span style="color:#DC143C"><b>破坏之神意</b></span>',
    '<img alt="Versusia icon 1.png"> <span style="color:#008080"><b>再生之神意</b></span>',
  ], ['<p>破坏版</p>', '<p>再生版</p>'], innerActive)
  return tabs(`${id}1`, [
    '<center><img alt="Enemy 7300883.png"><br><span style="color:#b26141">第一阶段Ⅰ</span><br><small class="text-blue-block">（100%~81%）</small></center>',
    '<center><img alt="Enemy 7300883.png"><br><span style="color:#b26141">第一阶段Ⅱ</span><br><small class="text-blue-block">（80%~51%）</small></center>',
  ], ['<p>阶段一</p>', inner], active)
}

describe('convertHtml：分頁', () => {
  it('所有分頁都展開，以分頁標題當小標題，巢狀分頁再深一層，不輸出分頁 id', () => {
    assert.equal(bodyOf(convertHtml(huijiPage(stageTabs(0, 0)), 'huiji', meta)), [
      '## 第一阶段Ⅰ（100%\\~81%）',
      '',
      '阶段一',
      '',
      '## 第一阶段Ⅱ（80%\\~51%）',
      '',
      '### 破坏之神意',
      '',
      '破坏版',
      '',
      '### 再生之神意',
      '',
      '再生版',
    ].join('\n'))
  })
})

describe('convertHtml：標題層級', () => {
  it('內容裡的 h2–h6 排在頁面標題之下，依巢狀關係重新編號、不跳級，表格產生的小標題接在其後', () => {
    const content = `<h2><span class="mw-headline">技能</span><span class="mw-editsection">[编辑]</span></h2><p>a</p>
      <h4>细节</h4><p>b</p>
      <h2>其他</h2><table class="wikitable"><tr><th colspan="2">小节</th></tr><tr><td>1</td><td>2</td></tr></table>`
    assert.equal(bodyOf(convertHtml(huijiPage(content), 'huiji', meta)), [
      '## 技能',
      '',
      'a',
      '',
      '### 细节',
      '',
      'b',
      '',
      '## 其他',
      '',
      '### 小节',
      '',
      '|  |  |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n'))
  })
})

describe('convertHtml：確定性', () => {
  // 輪播組：active 是存檔當下輪到的那張
  const swap = (active: number): string => `<div><span class="status-link self-link"><span class="status-icon"><div class="swap-images" data-speed="3">${
    ['4055 1', '4055 2', '4055 3'].map((id, i) => `<img alt="Status ${id}.png" class="img-fit${i === active ? ' active' : ''}">`).join('')
  }</div></span><span class="status-name">光背</span></span></div>`

  it('同一份 HTML 每次輸出相同', () => {
    const html = huijiPage(stageTabs(0, 0) + swap(0))
    assert.equal(convertHtml(html, 'huiji', meta), convertHtml(html, 'huiji', meta))
  })

  it('只差在分頁 active、輪播 active、分頁 id 與 NewPP 註解時輸出相同', () => {
    const a = huijiPage(stageTabs(0, 0, '1129534') + swap(0))
    const b = huijiPage(stageTabs(1, 1, '2229876') + swap(2)).replace('Cached time: 20261010061432', 'Cached time: 20261111093000')
    assert.notEqual(a, b)
    assert.equal(convertHtml(b, 'huiji', meta), convertHtml(a, 'huiji', meta))
  })
})

describe('detectSite', () => {
  it('依來源 URL 的主機判斷網站：灰機 wiki、NGA，其他都是 generic', () => {
    assert.equal(detectSite(huijiPage('')), 'huiji')
    assert.equal(detectSite('<!-- saved from url=(0038)https://bbs.nga.cn/read.php?tid=12345 -->\n<html></html>'), 'nga')
    assert.equal(detectSite('<!-- saved from url=(0035)https://ngabbs.com/read.php?tid=1 -->\n<html></html>'), 'nga')
    assert.equal(detectSite(plainPage('<p>x</p>', '<link rel="canonical" href="https://example.com/a">')), 'generic')
    assert.equal(detectSite(plainPage('<p>x</p>')), 'generic')
  })
})
