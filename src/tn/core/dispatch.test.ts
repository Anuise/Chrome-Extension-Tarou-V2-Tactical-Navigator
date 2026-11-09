import type { TnParcel } from './dispatch'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { dispatchParcel, runSetups, setupTnBackground } from './dispatch'

const sample: TnParcel = { url: '/rest/raid/start.json', requestData: '{"a":1}', responseData: { status: { turn: 3 } } }

describe('dispatchParcel', () => {
  // 讓錯誤 log 不污染測試輸出，並能檢查有沒有印出
  let consoleError: ReturnType<typeof mock.method>
  beforeEach(() => {
    consoleError = mock.method(console, 'error', () => {})
  })
  afterEach(() => {
    consoleError.mock.restore()
  })

  it('parcel 不是字串時忽略，不呼叫 handler', () => {
    const handler = mock.fn()
    for (const parcel of [undefined, null, 1, sample, ['x']])
      dispatchParcel(parcel, [handler])
    assert.equal(handler.mock.callCount(), 0)
  })

  it('JSON 壞掉時不丟錯、不呼叫 handler，並以 [tn] 前綴印出錯誤', () => {
    const handler = mock.fn()
    assert.doesNotThrow(() => dispatchParcel('{not json', [handler]))
    assert.equal(handler.mock.callCount(), 0)
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })

  it('每個 handler 依序收到同一個解析後的物件', () => {
    const calls: { name: string, parcel: TnParcel }[] = []
    dispatchParcel(JSON.stringify(sample), [
      (parcel) => {
        calls.push({ name: 'a', parcel })
      },
      (parcel) => {
        calls.push({ name: 'b', parcel })
      },
      (parcel) => {
        calls.push({ name: 'c', parcel })
      },
    ])
    assert.deepEqual(calls.map(c => c.name), ['a', 'b', 'c'])
    assert.deepEqual(calls[0].parcel, sample)
    assert.equal(calls[1].parcel, calls[0].parcel)
    assert.equal(calls[2].parcel, calls[0].parcel)
  })

  it('一個 handler 丟錯時，後面的 handler 仍被呼叫，且本身不丟錯', () => {
    const after = mock.fn()
    assert.doesNotThrow(() => dispatchParcel(JSON.stringify(sample), [
      () => { throw new Error('boom') },
      after,
    ]))
    assert.equal(after.mock.callCount(), 1)
    assert.deepEqual(after.mock.calls[0].arguments[0], sample)
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })

  it('handler 回傳的 Promise reject 時接住並以 [tn] 前綴印出，後面的 handler 仍被呼叫', async () => {
    const after = mock.fn()
    assert.doesNotThrow(() => dispatchParcel(JSON.stringify(sample), [
      async () => { throw new Error('async boom') },
      after,
    ]))
    assert.equal(after.mock.callCount(), 1)
    // rejection 在 microtask 才發生，等到下一個 macrotask 再檢查
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })
})

describe('runSetups 與 setupTnBackground', () => {
  let consoleError: ReturnType<typeof mock.method>
  beforeEach(() => {
    consoleError = mock.method(console, 'error', () => {})
  })
  afterEach(() => {
    consoleError.mock.restore()
  })

  it('依序執行每個 setup；第一個丟錯時第二個仍被呼叫，並以 [tn] 前綴印出錯誤，本身不丟錯', () => {
    const calls: string[] = []
    assert.doesNotThrow(() => runSetups([
      () => {
        calls.push('a')
        throw new Error('boom')
      },
      () => {
        calls.push('b')
      },
    ]))
    assert.deepEqual(calls, ['a', 'b'])
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })

  it('setupTnBackground 經 runSetups 隔離錯誤：沒有 chrome 時錄製器的 setup 丟錯，只印 [tn] log，不往外丟錯', () => {
    // 這個測試檔沒有設定 globalThis.chrome，setupRecorderWebSocket 存取 chrome.debugger 時會丟 ReferenceError
    assert.equal((globalThis as { chrome?: unknown }).chrome, undefined)
    assert.doesNotThrow(() => setupTnBackground())
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })
})
