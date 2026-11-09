import type { RecIndexEntry, RecLimits, RecRecord } from './core'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { buildExport, byteLength, createIdCoder, entryKeys, findSelfId, isRecordable, maskRecord, maskUrl, maskValue, planAppend, questIdOf, raidIdOf, REC_LIMITS, resolveRaidId } from './core'

function entry(raidId: string, fields: Partial<RecIndexEntry> = {}): RecIndexEntry {
  return { raidId, startedAt: 0, lastAt: 0, count: 1, bytes: 10, truncated: false, ...fields }
}

describe('isRecordable', () => {
  it('raid 與 multiraid 底下的 API 都錄，不限 upstream 有處理的那幾支', () => {
    for (const url of ['/rest/raid/start.json?_=1', '/rest/multiraid/normal_attack_result.json', 'https://game.granbluefantasy.jp/rest/raid/condition/123/1/0.json', '/rest/multiraid/something_new'])
      assert.equal(isRecordable(url), true, url)
  })

  it('其他 API 不錄', () => {
    for (const url of ['/rest/quest/assist_list/0', '/raid/start.json', '/rest/raidx/start.json', '/rest/arcarum3/start_dungeon'])
      assert.equal(isRecordable(url), false, url)
  })
})

describe('resolveRaidId', () => {
  it('優先取解析後 requestData 的 raid_id', () => {
    const record: RecRecord = { t: 0, url: '/rest/raid/ability_result.json/22222222', requestData: '{"raid_id":11111111}', responseData: { raid_id: 33333333 } }
    assert.deepEqual(resolveRaidId(record), { raidId: '11111111', source: 'request' })
  })

  it('requestData 沒有 raid_id、不是 JSON 或不是物件時，改取 responseData 的 raid_id', () => {
    for (const requestData of [undefined, '{"a":1}', 'a=1&b=2', '123', '[1]'])
      assert.deepEqual(resolveRaidId({ t: 0, url: '/rest/raid/start.json', requestData, responseData: { raid_id: 33333333 } }), { raidId: '33333333', source: 'response' }, String(requestData))
  })

  it('兩邊都沒有時，取 URL 路徑裡第一段 8 位以上的數字，不看查詢字串', () => {
    assert.deepEqual(resolveRaidId({ t: 0, url: '/rest/multiraid/condition/44444444/1/0.json?_=1700000000000&uid=12345678' }), { raidId: '44444444', source: 'url' })
    assert.deepEqual(resolveRaidId({ t: 0, url: '/rest/raid/start/55555555' }), { raidId: '55555555', source: 'url' })
  })

  it('都取不到時回傳 undefined：短數字、只在查詢字串裡的數字、無效的 raid_id 都不算', () => {
    const records: RecRecord[] = [
      { t: 0, url: '/rest/raid/condition/1234567/1/0.json' },
      { t: 0, url: '/rest/raid/x.json?raid_id=12345678&_=1700000000000' },
      { t: 0, url: '/rest/raid/x', requestData: '{"raid_id":0}', responseData: { raid_id: 'abc' } },
      { t: 0, url: '/rest/raid/x', requestData: '{"raid_id":-5}', responseData: { raid_id: 1.5 } },
      { t: 0, url: '/rest/raid/x', responseData: [{ raid_id: 12345678 }] },
      { t: 0, url: '/rest/raid/x', responseData: '{"raid_id":12345678}' },
    ]
    for (const record of records)
      assert.equal(resolveRaidId(record), undefined, JSON.stringify(record))
  })
})

describe('raidIdOf', () => {
  it('request、response 的 raid_id 可以建立新的一場：索引裡沒有這場也採用', () => {
    const index = [entry('1', { lastAt: 5 })]
    assert.equal(raidIdOf({ t: 0, url: '/rest/raid/x', requestData: '{"raid_id":99999999}' }, index), '99999999')
    assert.equal(raidIdOf({ t: 0, url: '/rest/raid/start.json', responseData: { raid_id: 88888888 } }, index), '88888888')
  })

  it('URL 路徑的數字對得到索引裡的場次時歸到那一場，即使它不是最近一場', () => {
    const index = [entry('44444444', { lastAt: 1 }), entry('2', { lastAt: 9 })]
    assert.equal(raidIdOf({ t: 0, url: '/rest/multiraid/condition/44444444/1/0.json' }, index), '44444444')
  })

  it('URL 路徑的數字對不到索引裡的場次時歸到最近一場，不建新場，也不擠掉別場', () => {
    const limits: RecLimits = { maxRaids: 3, maxBytes: 100 }
    const index = [entry('1', { lastAt: 1 }), entry('2', { lastAt: 2 }), entry('3', { lastAt: 9 })]
    const record: RecRecord = { t: 10, url: '/rest/raid/something/3040001000.json' }
    const raidId = raidIdOf(record, index)
    assert.equal(raidId, '3')
    const plan = planAppend(index, { raidId: '3', bytes: 1, now: 10 }, limits)
    assert.deepEqual(plan.index.map(e => e.raidId), ['1', '2', '3'])
    assert.deepEqual(plan.removed, [])
    // 索引是空的時不錄
    assert.equal(raidIdOf(record, []), undefined)
  })

  it('判斷不出來時歸到最後收到資料的那一場，不是最後開始的那一場', () => {
    const index = [entry('1', { startedAt: 1, lastAt: 9 }), entry('2', { startedAt: 2, lastAt: 3 })]
    assert.equal(raidIdOf({ t: 0, url: 'websocket', responseData: ['bossUpdate', {}] }, index), '1')
  })

  it('判斷不出來而且索引是空的時回傳 undefined', () => {
    assert.equal(raidIdOf({ t: 0, url: '/rest/raid/x' }, []), undefined)
  })
})

describe('questIdOf', () => {
  it('只從 start.json 取 quest_id，轉成字串', () => {
    assert.equal(questIdOf({ t: 0, url: '/rest/multiraid/start.json?_=1', responseData: { quest_id: 305161 } }), '305161')
    assert.equal(questIdOf({ t: 0, url: '/rest/raid/start.json', responseData: { quest_id: '305161' } }), '305161')
    assert.equal(questIdOf({ t: 0, url: '/rest/raid/normal_attack_result.json', responseData: { quest_id: '305161' } }), undefined)
    assert.equal(questIdOf({ t: 0, url: '/rest/raid/start.json', responseData: {} }), undefined)
    assert.equal(questIdOf({ t: 0, url: '/rest/raid/start.json' }), undefined)
  })
})

describe('planAppend', () => {
  const limits: RecLimits = { maxRaids: 3, maxBytes: 100 }

  it('新的一場接在索引最後，序號從 0 開始，不修改傳入的索引', () => {
    const index = [entry('1')]
    const frozen = structuredClone(index)
    const plan = planAppend(index, { raidId: '2', questId: '305161', bytes: 20, now: 7 }, limits)
    assert.deepEqual(plan.index.map(e => e.raidId), ['1', '2'])
    assert.deepEqual(plan.index[1], { raidId: '2', questId: '305161', startedAt: 7, lastAt: 7, count: 1, bytes: 20, truncated: false })
    assert.equal(plan.key, 'tn:rec:2:0')
    assert.deepEqual(plan.removed, [])
    assert.deepEqual(index, frozen)
  })

  it('既有的一場維持原本的位置，序號接續、bytes 累加、lastAt 更新，questId 只在還沒有時補上，不修改傳入的索引', () => {
    const index = [entry('1', { count: 2, bytes: 30, startedAt: 1, lastAt: 1 }), entry('2', { questId: 'A', startedAt: 2, lastAt: 2 })]
    const frozen = structuredClone(index)
    const first = planAppend(index, { raidId: '1', questId: 'Q', bytes: 5, now: 9 }, limits)
    assert.deepEqual(first.index.map(e => e.raidId), ['1', '2'])
    assert.equal(first.key, 'tn:rec:1:2')
    assert.deepEqual(first.index[0], { raidId: '1', questId: 'Q', startedAt: 1, lastAt: 9, count: 3, bytes: 35, truncated: false })
    const second = planAppend(index, { raidId: '2', questId: 'B', bytes: 5, now: 9 }, limits)
    assert.equal(second.index[1].questId, 'A')
    assert.deepEqual(index, frozen)
  })

  it('超過場數上限時刪 lastAt 最小（最久沒收到資料）的一場', () => {
    const index = [entry('1', { lastAt: 1 }), entry('2', { lastAt: 2 }), entry('3', { lastAt: 3 })]
    const plan = planAppend(index, { raidId: '4', bytes: 1, now: 9 }, limits)
    assert.deepEqual(plan.index.map(e => e.raidId), ['2', '3', '4'])
    assert.deepEqual(plan.removed.map(e => e.raidId), ['1'])
  })

  it('回頭打的那一場不會先被刪：刪的是最久沒收到資料的，不是最早開始的', () => {
    // 1 號最早開始，但剛回頭打過，lastAt 最大
    const index = [entry('1', { startedAt: 1, lastAt: 8 }), entry('2', { startedAt: 2, lastAt: 3 }), entry('3', { startedAt: 3, lastAt: 5 })]
    const plan = planAppend(index, { raidId: '4', bytes: 1, now: 9 }, limits)
    assert.deepEqual(plan.removed.map(e => e.raidId), ['2'])
    assert.deepEqual(plan.index.map(e => e.raidId), ['1', '3', '4'])
  })

  it('lastAt 相同時先刪索引裡排前面（較早開始）的', () => {
    const plan = planAppend([entry('1'), entry('2'), entry('3')], { raidId: '4', bytes: 1, now: 9 }, limits)
    assert.deepEqual(plan.removed.map(e => e.raidId), ['1'])
  })

  it('超過總量上限時由 lastAt 最小的開始刪，刪到不超過為止，不刪正在錄的這一場', () => {
    const index = [entry('1', { bytes: 30, lastAt: 1 }), entry('2', { bytes: 30, lastAt: 2 }), entry('3', { bytes: 30, lastAt: 3 })]
    // 3 號加 35 後總量 125，刪 1 號剩 95
    const plan = planAppend(index, { raidId: '3', bytes: 35, now: 9 }, limits)
    assert.deepEqual(plan.removed.map(e => e.raidId), ['1'])
    assert.deepEqual(plan.index.map(e => e.raidId), ['2', '3'])
    // 正在錄的是 lastAt 最小的 1 號：它不刪，改刪 2 號、3 號
    const stalest = planAppend(index, { raidId: '1', bytes: 65, now: 9 }, limits)
    assert.deepEqual(stalest.removed.map(e => e.raidId), ['2', '3'])
    assert.deepEqual(stalest.index.map(e => e.raidId), ['1'])
    assert.equal(stalest.index[0].bytes, 95)
  })

  it('這一場加上這筆剛好等於總量上限時照常寫入、不截斷；超過才截斷', () => {
    const equal = planAppend([entry('1', { bytes: 90 })], { raidId: '1', bytes: 10, now: 9 }, limits)
    assert.equal(equal.key, 'tn:rec:1:1')
    assert.equal(equal.index[0].truncated, false)
    assert.equal(equal.index[0].bytes, 100)
    const over = planAppend([entry('1', { bytes: 90 })], { raidId: '1', bytes: 11, now: 9 }, limits)
    assert.equal(over.key, undefined)
    assert.equal(over.index[0].truncated, true)
  })

  it('剛好等於總量上限時不刪', () => {
    const plan = planAppend([entry('1', { bytes: 50 })], { raidId: '2', bytes: 50, now: 9 }, limits)
    assert.deepEqual(plan.removed, [])
    assert.equal(plan.key, 'tn:rec:2:0')
  })

  it('這一場單獨就會超過總量上限時標記截斷、不寫入，也不為它刪別場', () => {
    // 總量剛好在上限，2 號單獨加上這筆會超過
    const index = [entry('1', { bytes: 10 }), entry('2', { bytes: 90, count: 4 })]
    const plan = planAppend(index, { raidId: '2', bytes: 11, now: 9 }, limits)
    assert.equal(plan.key, undefined)
    assert.deepEqual(plan.index[1], { ...index[1], lastAt: 9, truncated: true })
    assert.deepEqual(plan.removed, [])
  })

  it('已截斷的一場之後即使這筆很小也不再寫入，但 lastAt 仍更新', () => {
    const index = [entry('1', { bytes: 90, truncated: true })]
    const plan = planAppend(index, { raidId: '1', bytes: 1, now: 9 }, limits)
    assert.equal(plan.key, undefined)
    assert.deepEqual(plan.index, [{ ...index[0], lastAt: 9 }])
  })

  it('新的一場第一筆就超過上限時，仍建立索引並標記截斷，場數超過上限照樣刪一場', () => {
    const plan = planAppend([entry('1'), entry('2'), entry('3')], { raidId: '4', bytes: 101, now: 9 }, limits)
    assert.equal(plan.key, undefined)
    assert.deepEqual(plan.index.map(e => [e.raidId, e.count, e.truncated]), [['2', 1, false], ['3', 1, false], ['4', 0, true]])
    assert.deepEqual(plan.removed.map(e => e.raidId), ['1'])
  })
})

describe('REC_LIMITS 與 byteLength', () => {
  it('上限是主管定案的 3 場、50 MB', () => {
    assert.deepEqual(REC_LIMITS, { maxRaids: 3, maxBytes: 50 * 1024 * 1024 })
  })

  it('bytes 是 JSON 字串的 UTF-8 長度，不是字串長度：日文字算 3 bytes', () => {
    const record: RecRecord = { t: 0, url: '/x', responseData: { n: 'あ' } }
    assert.equal(JSON.stringify(record).length, 43)
    assert.equal(byteLength(record), 45)
  })
})

describe('entryKeys', () => {
  it('列出一場已寫入的全部 key', () => {
    assert.deepEqual(entryKeys(entry('7', { count: 3 })), ['tn:rec:7:0', 'tn:rec:7:1', 'tn:rec:7:2'])
    assert.deepEqual(entryKeys(entry('7', { count: 0 })), [])
  })
})

describe('遮罩與代號', () => {
  // 沒有自己的 ID 時，所有人依出現順序編號
  const anon = () => createIdCoder(undefined)

  it('maskValue 深層走訪：玩家 ID 換成代號，viewer_id、nickname 換成 ***，不修改傳入的值', () => {
    const value = {
      user_id: 123,
      viewer_id: '456',
      nickname: '玩家',
      raid: { multi_raid_member_info: [{ nickname: 'A', user_id: '1', level: 200 }, { nickname: 'B', user_id: '123', level: 150 }] },
      deep: [[{ x: { viewer_id: '777' } }]],
      keep: null,
    }
    const frozen = structuredClone(value)
    assert.deepEqual(maskValue(value, createIdCoder('123')), {
      user_id: 'self',
      viewer_id: '***',
      nickname: '***',
      raid: { multi_raid_member_info: [{ nickname: '***', user_id: 'p1', level: 200 }, { nickname: '***', user_id: 'self', level: 150 }] },
      deep: [[{ x: { viewer_id: '***' } }]],
      keep: null,
    })
    assert.deepEqual(value, frozen)
  })

  it('key 去掉底線、轉小寫後比對：userId 換成代號，viewerId、userName、user_name、userImage、user_image 換成 ***', () => {
    assert.deepEqual(
      maskValue({ userId: '1', viewerId: 2, userName: 'A', user_name: 'B', userImage: 'x.png', user_image: 'y.png', NickName: 'C' }, anon()),
      { userId: 'p1', viewerId: '***', userName: '***', user_name: '***', userImage: '***', user_image: '***', NickName: '***' },
    )
  })

  it('viewer_id 一律是 ***，不放進代號對照表：和 user_id 同值也不會變成同一個代號', () => {
    assert.deepEqual(maskValue({ viewer_id: '1', user_id: '1', viewerId: ['2'] }, anon()), { viewer_id: '***', user_id: 'p1', viewerId: ['***'] })
  })

  it('personal_*_user_id 是字串或數字時換成代號（123 與 "123" 是同一人），false、null 等其他值保留', () => {
    assert.deepEqual(
      maskValue({ buffs: [
        { status: '1', personal_buff_user_id: '87654321', personal_debuff_user_id: 87654321 },
        { status: '2', personal_buff_user_id: false, personal_debuff_user_id: null },
        { status: '3', user_id: false, nickname: true },
      ] }, anon()),
      { buffs: [
        { status: '1', personal_buff_user_id: 'p1', personal_debuff_user_id: 'p1' },
        { status: '2', personal_buff_user_id: false, personal_debuff_user_id: null },
        { status: '3', user_id: false, nickname: true },
      ] },
    )
  })

  it('要換的 key 底下是物件時繼續往下走訪；是陣列時陣列裡的字串與數字逐一換掉', () => {
    assert.deepEqual(maskValue({ user_id: { nickname: 'A', level: 1 }, nickname: ['B'] }, anon()), { user_id: { nickname: '***', level: 1 }, nickname: ['***'] })
  })

  it('陣列值逐一處理：字串與數字換成代號，false、null 保留，物件與巢狀陣列照同一個 key 的規則往下走', () => {
    assert.deepEqual(
      maskValue({ user_ids: ['1', 2, false, null, { nickname: 'A', level: 3 }, ['4', '1']] }, anon()),
      { user_ids: ['p1', 'p2', false, null, { nickname: '***', level: 3 }, ['p3', 'p1']] },
    )
  })

  it('正規化後包含 userid 的 key，以及等於 uid 的 key 換成代號', () => {
    assert.deepEqual(
      maskValue({ user_ids: ['1'], userid_list: ['2'], member_user_id_list: [3], uid: '1', UID: 4 }, anon()),
      { user_ids: ['p1'], userid_list: ['p2'], member_user_id_list: ['p3'], uid: 'p1', UID: 'p4' },
    )
  })

  it('出現順序：物件依 key 的順序深度優先編號，同一個值沿用第一次的代號', () => {
    assert.deepEqual(
      maskValue({ a: { user_id: '30' }, b: [{ user_id: '10' }, { user_id: '20' }], user_id: '10' }, anon()),
      { a: { user_id: 'p1' }, b: [{ user_id: 'p2' }, { user_id: 'p3' }], user_id: 'p2' },
    )
  })

  it('不相干的 key 不動：uid 只比對完整名稱', () => {
    const value = { raid_id: 11111111, user_rank: 300, turn_list: [1, 2], uid_x: '1', guid: 'g', pc_image: 'p.png', name: '技能名', level: 200 }
    assert.deepEqual(maskValue(value, anon()), value)
  })

  it('名稱類 key 正規化後包含 nickname、username、userimage、viewerid 就換成 ***', () => {
    assert.deepEqual(
      maskValue({ called_user_name: 'A', host_nickname: 'B', nickname_color: 'red', user_image_url: 'x.png', owner_viewer_id: '1', viewer_ids: ['2', 3] }, anon()),
      { called_user_name: '***', host_nickname: '***', nickname_color: '***', user_image_url: '***', owner_viewer_id: '***', viewer_ids: ['***', '***'] },
    )
  })

  it('ID 欄位的 0、""、"0" 表示「沒有」，原樣保留，不編成代號；名稱類照樣換成 ***', () => {
    assert.deepEqual(
      maskValue({ user_id: 0, personal_buff_user_id: '', owner_user_id: '0', user_ids: [0, '5', ''], uid: '0', nickname: '' }, anon()),
      { user_id: 0, personal_buff_user_id: '', owner_user_id: '0', user_ids: [0, 'p1', ''], uid: '0', nickname: '***' },
    )
    assert.equal(maskUrl('/x?uid=0&user_id=&viewer_id=0', anon()), '/x?uid=0&user_id=&viewer_id=***')
  })

  it('WebSocket 聊天 chatAdd、raidPost、raidGet 的值整個換成 ***，不論型別', () => {
    assert.deepEqual(
      maskValue(['raid', { chatAdd: { userId: '1', commentData: { content: '你好' } }, raidPost: { user_comment: { text: 'hi' } }, raidGet: [{ a: 1 }], bossUpdate: { param: { boss1_hp: 5 } } }], anon()),
      ['raid', { chatAdd: '***', raidPost: '***', raidGet: '***', bossUpdate: { param: { boss1_hp: 5 } } }],
    )
  })

  it('聊天文字的容器 commentData、user_comment 掛在其他 key 底下時也整個換成 ***', () => {
    assert.deepEqual(
      maskValue({ log: [{ commentData: { content: '你好', stamp: 1 } }, { user_comment: { text: 'hi' } }] }, anon()),
      { log: [{ commentData: '***' }, { user_comment: '***' }] },
    )
  })

  it('maskUrl：uid=、user_id= 換成代號，viewer_id= 換成 ***，不動其他參數與路徑', () => {
    const code = createIdCoder('12345678')
    assert.equal(maskUrl('/rest/raid/start.json?_=1700000000000&t=1700000000001&uid=12345678', code), '/rest/raid/start.json?_=1700000000000&t=1700000000001&uid=self')
    assert.equal(maskUrl('https://game.granbluefantasy.jp/rest/raid/x.json?user_id=999&_=1#a', code), 'https://game.granbluefantasy.jp/rest/raid/x.json?user_id=p1&_=1#a')
    assert.equal(maskUrl('/rest/raid/x.json?viewer_id=2&uid=999&user_id=12345678', code), '/rest/raid/x.json?viewer_id=***&uid=p1&user_id=self')
    assert.equal(maskUrl('/rest/raid/x.json?auid=1&uid_x=2&my_user_id=3', code), '/rest/raid/x.json?auid=1&uid_x=2&my_user_id=3')
  })

  it('maskRecord 依 URL、requestData、responseData 的順序編號，requestData 轉回字串，不修改傳入的值', () => {
    const record: RecRecord = {
      t: 5,
      url: '/rest/multiraid/x.json?user_id=111',
      requestData: '{"raid_id":11111111,"user_id":"222","info":{"nickname":"我"}}',
      responseData: { user_id: '333', member: { user_id: '111' }, boss: { hp: 1 } },
    }
    const frozen = structuredClone(record)
    assert.deepEqual(maskRecord(record, anon()), {
      t: 5,
      url: '/rest/multiraid/x.json?user_id=p1',
      requestData: '{"raid_id":11111111,"user_id":"p2","info":{"nickname":"***"}}',
      responseData: { user_id: 'p3', member: { user_id: 'p1' }, boss: { hp: 1 } },
    })
    assert.deepEqual(record, frozen)
  })

  it('responseData 是字串時，能解析成 JSON 就處理後轉回字串；不是 JSON 的字串（例如 HTML）原樣保留', () => {
    const code = anon()
    const json = maskRecord({ t: 0, url: '/x', responseData: '{"user_id":"5","nickname":"A","list":[{"user_id":"6"}]}' }, code)
    assert.equal(json.responseData, '{"user_id":"p1","nickname":"***","list":[{"user_id":"p2"}]}')
    const html = '<div class="user">user_id=5</div>'
    assert.equal(maskRecord({ t: 0, url: '/x', responseData: html }, code).responseData, html)
  })

  it('maskRecord 對不是 JSON 的 requestData 原樣保留，沒有 requestData 時維持 undefined', () => {
    assert.equal(maskRecord({ t: 0, url: '/x', requestData: 'a=1&b=2' }, anon()).requestData, 'a=1&b=2')
    assert.equal(maskRecord({ t: 0, url: '/x' }, anon()).requestData, undefined)
  })

  it('requestData 是 null 時（jQuery 的 data 是 null）匯出仍是 null，不會變成字串 "null"；raid_id 改從 responseData 取', () => {
    const record: RecRecord = { t: 0, url: '/rest/raid/x', requestData: null, responseData: { raid_id: 33333333 } }
    assert.equal(maskRecord(record, anon()).requestData, null)
    assert.deepEqual(resolveRaidId(record), { raidId: '33333333', source: 'response' })
  })

  it('WebSocket 訊框（解析後的陣列）也會處理', () => {
    const record: RecRecord = { t: 0, url: 'websocket', responseData: ['raid', { memberJoin: { user_id: '1', nickname: 'A' }, chatAdd: { userId: '1' } }] }
    assert.deepEqual(maskRecord(record, anon()).responseData, ['raid', { memberJoin: { user_id: 'p1', nickname: '***' }, chatAdd: '***' }])
  })
})

describe('findSelfId', () => {
  it('取任一筆紀錄 URL 的 uid=，第一筆沒有也會往後找', () => {
    assert.equal(findSelfId([{ t: 0, url: 'websocket' }, { t: 0, url: '/rest/raid/x.json?_=1&uid=555' }]), '555')
  })

  it('URL 的 uid= 優先於 start.json 的 user_id', () => {
    assert.equal(findSelfId([{ t: 0, url: '/rest/raid/start.json', responseData: { user_id: '777' } }, { t: 0, url: '/rest/raid/x.json?uid=555' }]), '555')
  })

  it('URL 都沒有 uid= 時退回 start.json 回應的 user_id，轉成字串；其他回應的 user_id 不算', () => {
    assert.equal(findSelfId([
      { t: 0, url: '/rest/raid/ability_result.json', responseData: { user_id: 9 } },
      { t: 0, url: '/rest/multiraid/start.json?_=1', responseData: { user_id: 777 } },
    ]), '777')
  })

  it('都沒有時回傳 undefined', () => {
    assert.equal(findSelfId([
      { t: 0, url: '/rest/raid/x.json?uid=' },
      { t: 0, url: '/rest/raid/start.json', responseData: { user_id: false } },
      { t: 0, url: '/rest/raid/start.json', responseData: null },
    ]), undefined)
  })
})

describe('buildExport', () => {
  it('檔名帶 raidId 與本機時間，內容是索引資料加上處理後的 records，結尾換行', () => {
    const e = entry('11111111', { questId: '305161', count: 1 })
    const file = buildExport(e, [{ t: 1, url: '/rest/raid/x?uid=9', responseData: { nickname: 'A' } }], new Date(2026, 10, 9, 8, 7, 6))
    assert.equal(file.name, 'tn-rec-11111111-20261109-080706.json')
    assert.ok(file.text.endsWith('}\n'))
    assert.deepEqual(JSON.parse(file.text), { ...e, records: [{ t: 1, url: '/rest/raid/x?uid=self', responseData: { nickname: '***' } }] })
  })

  it('整個檔的代號一致：自己是 self，其他人依出現順序是 p1、p2，同一人在不同紀錄同一代號，檔案裡沒有真實 ID', () => {
    const records: RecRecord[] = [
      {
        t: 1,
        url: '/rest/multiraid/start.json?_=1&uid=12345678',
        requestData: '{"raid_id":11111111}',
        responseData: { user_id: '12345678', multi_raid_member_info: [{ user_id: '87654321', viewer_id: '55555555', nickname: 'A' }, { user_id: '12345678' }] },
      },
      {
        t: 2,
        url: '/rest/multiraid/normal_attack_result.json?_=2&uid=12345678',
        responseData: { boss: { condition: { buff: [{ personal_buff_user_id: '87654321' }, { personal_debuff_user_id: '44444444' }, { personal_buff_user_id: false }] } } },
      },
      { t: 3, url: 'websocket', responseData: ['raid', { memberJoin: { user_id: 44444444 } }] },
    ]
    const file = buildExport(entry('11111111', { count: 3 }), records, new Date())
    const data = JSON.parse(file.text) as { records: RecRecord[] }
    assert.deepEqual(data.records.map(r => r.url), ['/rest/multiraid/start.json?_=1&uid=self', '/rest/multiraid/normal_attack_result.json?_=2&uid=self', 'websocket'])
    assert.deepEqual(data.records[0].responseData, { user_id: 'self', multi_raid_member_info: [{ user_id: 'p1', viewer_id: '***', nickname: '***' }, { user_id: 'self' }] })
    assert.deepEqual(data.records[1].responseData, { boss: { condition: { buff: [{ personal_buff_user_id: 'p1' }, { personal_debuff_user_id: 'p2' }, { personal_buff_user_id: false }] } } })
    assert.deepEqual(data.records[2].responseData, ['raid', { memberJoin: { user_id: 'p2' } }])
    for (const id of ['12345678', '87654321', '44444444', '55555555'])
      assert.equal(file.text.includes(id), false, id)
  })

  it('找不到自己的 ID 時沒有 self，所有人依出現順序編號', () => {
    const file = buildExport(entry('1'), [{ t: 1, url: '/rest/raid/x', responseData: { user_id: '5', list: [{ user_id: '6' }] } }], new Date())
    assert.deepEqual((JSON.parse(file.text) as { records: RecRecord[] }).records[0].responseData, { user_id: 'p1', list: [{ user_id: 'p2' }] })
  })
})
