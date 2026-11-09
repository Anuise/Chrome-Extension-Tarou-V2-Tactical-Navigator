import type { RecIndexEntry, RecLimits, RecRecord } from './core'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { buildExport, entryKeys, isRecordable, maskRecord, maskUrl, maskValue, planAppend, questIdOf, raidIdOf, resolveRaidId } from './core'

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

  it('requestData 已經是物件時也讀得到', () => {
    assert.deepEqual(resolveRaidId({ t: 0, url: '/rest/raid/x', requestData: { raid_id: '11111111' } }), { raidId: '11111111', source: 'request' })
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
  it('紀錄本身判斷得出來時用它，即使索引裡沒有這場', () => {
    assert.equal(raidIdOf({ t: 0, url: '/rest/raid/x', requestData: '{"raid_id":99999999}' }, [entry('1', { lastAt: 5 })]), '99999999')
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

  it('既有的一場維持原本的位置，序號接續、bytes 累加、lastAt 更新，questId 只在還沒有時補上', () => {
    const index = [entry('1', { count: 2, bytes: 30, startedAt: 1, lastAt: 1 }), entry('2', { questId: 'A', startedAt: 2, lastAt: 2 })]
    const first = planAppend(index, { raidId: '1', questId: 'Q', bytes: 5, now: 9 }, limits)
    assert.deepEqual(first.index.map(e => e.raidId), ['1', '2'])
    assert.equal(first.key, 'tn:rec:1:2')
    assert.deepEqual(first.index[0], { raidId: '1', questId: 'Q', startedAt: 1, lastAt: 9, count: 3, bytes: 35, truncated: false })
    const second = planAppend(index, { raidId: '2', questId: 'B', bytes: 5, now: 9 }, limits)
    assert.equal(second.index[1].questId, 'A')
  })

  it('超過場數上限時刪最舊的一場', () => {
    const index = [entry('1'), entry('2'), entry('3')]
    const plan = planAppend(index, { raidId: '4', bytes: 1, now: 9 }, limits)
    assert.deepEqual(plan.index.map(e => e.raidId), ['2', '3', '4'])
    assert.deepEqual(plan.removed.map(e => e.raidId), ['1'])
  })

  it('超過總量上限時由最舊的開始刪，刪到不超過為止，不刪正在錄的這一場', () => {
    const index = [entry('1', { bytes: 30 }), entry('2', { bytes: 30 }), entry('3', { bytes: 30 })]
    // 3 號是最新的一場；加 35 後總量 125，刪 1 號剩 95
    const plan = planAppend(index, { raidId: '3', bytes: 35, now: 9 }, limits)
    assert.deepEqual(plan.removed.map(e => e.raidId), ['1'])
    assert.deepEqual(plan.index.map(e => e.raidId), ['2', '3'])
    // 正在錄的是最舊的 1 號：它不刪，改刪 2 號、3 號
    const older = planAppend(index, { raidId: '1', bytes: 65, now: 9 }, limits)
    assert.deepEqual(older.removed.map(e => e.raidId), ['2', '3'])
    assert.deepEqual(older.index.map(e => e.raidId), ['1'])
    assert.equal(older.index[0].bytes, 95)
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

  it('新的一場第一筆就超過上限時，仍建立索引並標記截斷，場數超過上限照樣刪最舊的', () => {
    const plan = planAppend([entry('1'), entry('2'), entry('3')], { raidId: '4', bytes: 101, now: 9 }, limits)
    assert.equal(plan.key, undefined)
    assert.deepEqual(plan.index.map(e => [e.raidId, e.count, e.truncated]), [['2', 1, false], ['3', 1, false], ['4', 0, true]])
    assert.deepEqual(plan.removed.map(e => e.raidId), ['1'])
  })
})

describe('entryKeys', () => {
  it('列出一場已寫入的全部 key', () => {
    assert.deepEqual(entryKeys(entry('7', { count: 3 })), ['tn:rec:7:0', 'tn:rec:7:1', 'tn:rec:7:2'])
    assert.deepEqual(entryKeys(entry('7', { count: 0 })), [])
  })
})

describe('遮罩', () => {
  it('maskValue 深層走訪物件與陣列，只遮 user_id、viewer_id、nickname，不修改傳入的值', () => {
    const value = {
      user_id: 123,
      viewer_id: '456',
      nickname: '玩家',
      personal_buff_user_id: '789',
      raid: { multi_raid_member_info: [{ nickname: 'A', user_id: '1', level: 200 }, { nickname: 'B', user_id: '2', level: 150 }] },
      deep: [[{ viewer_id: { nested: true } }]],
      keep: null,
    }
    const frozen = structuredClone(value)
    assert.deepEqual(maskValue(value), {
      user_id: '***',
      viewer_id: '***',
      nickname: '***',
      personal_buff_user_id: '789',
      raid: { multi_raid_member_info: [{ nickname: '***', user_id: '***', level: 200 }, { nickname: '***', user_id: '***', level: 150 }] },
      deep: [[{ viewer_id: '***' }]],
      keep: null,
    })
    assert.deepEqual(value, frozen)
  })

  it('maskUrl 遮掉查詢參數 uid，不動其他參數與路徑', () => {
    assert.equal(maskUrl('/rest/raid/start.json?_=1700000000000&t=1700000000001&uid=12345678'), '/rest/raid/start.json?_=1700000000000&t=1700000000001&uid=***')
    assert.equal(maskUrl('https://game.granbluefantasy.jp/rest/raid/x.json?uid=12345678&_=1#a'), 'https://game.granbluefantasy.jp/rest/raid/x.json?uid=***&_=1#a')
    assert.equal(maskUrl('/rest/raid/x.json?auid=1&uid_x=2'), '/rest/raid/x.json?auid=1&uid_x=2')
  })

  it('maskRecord 解析 JSON 字串的 requestData 後遮罩再轉回字串，並遮 URL 與 responseData', () => {
    const record: RecRecord = {
      t: 5,
      url: '/rest/multiraid/start.json?uid=12345678',
      requestData: '{"raid_id":11111111,"user_id":"12345678","info":{"nickname":"我"}}',
      responseData: { user_id: '12345678', boss: { hp: 1 } },
    }
    const frozen = structuredClone(record)
    assert.deepEqual(maskRecord(record), {
      t: 5,
      url: '/rest/multiraid/start.json?uid=***',
      requestData: '{"raid_id":11111111,"user_id":"***","info":{"nickname":"***"}}',
      responseData: { user_id: '***', boss: { hp: 1 } },
    })
    assert.deepEqual(record, frozen)
  })

  it('maskRecord 對不是 JSON 的 requestData 原樣保留，物件形式的 requestData 直接遮罩', () => {
    assert.equal(maskRecord({ t: 0, url: '/x', requestData: 'a=1&b=2' }).requestData, 'a=1&b=2')
    assert.deepEqual(maskRecord({ t: 0, url: '/x', requestData: { user_id: 1 } }).requestData, { user_id: '***' })
    assert.equal(maskRecord({ t: 0, url: '/x' }).requestData, undefined)
  })

  it('WebSocket 訊框（解析後的陣列）也會遮', () => {
    const record: RecRecord = { t: 0, url: 'websocket', responseData: ['raid', { memberJoin: { user_id: '1', nickname: 'A' } }] }
    assert.deepEqual(maskRecord(record).responseData, ['raid', { memberJoin: { user_id: '***', nickname: '***' } }])
  })
})

describe('buildExport', () => {
  it('檔名帶 raidId 與本機時間，內容是索引資料加上遮罩後的 records，結尾換行', () => {
    const e = entry('11111111', { questId: '305161', count: 1 })
    const file = buildExport(e, [{ t: 1, url: '/rest/raid/x?uid=9', responseData: { nickname: 'A' } }], new Date(2026, 10, 9, 8, 7, 6))
    assert.equal(file.name, 'tn-rec-11111111-20261109-080706.json')
    assert.ok(file.text.endsWith('}\n'))
    assert.deepEqual(JSON.parse(file.text), { ...e, records: [{ t: 1, url: '/rest/raid/x?uid=***', responseData: { nickname: '***' } }] })
  })
})
