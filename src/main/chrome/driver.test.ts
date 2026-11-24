import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { ChromeBridge } from './bridge.ts'
import { chromeDriver } from './driver.ts'

/** Sayfadaki `DataTransfer` yerine: eklenen dosyaları `files` olarak veriyor. */
class FakeDataTransfer {
  list: File[] = []
  items = { add: (f: File) => this.list.push(f) }
  get files() {
    return this.list
  }
}

test('Chrome driver: files reach the input as bytes, in chunks, with name, type and events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 's97-up-'))
  try {
    const big = randomBytes(9 * 1024 * 1024 + 123) // 3 parça
    await writeFile(join(dir, 'clip.mp4'), big)
    await writeFile(join(dir, 'empty.png'), '')
    ;(globalThis as Record<string, unknown>).DataTransfer = FakeDataTransfer
    const events: string[] = []
    const input: Record<PropertyKey, unknown> = { dispatchEvent: (e: Event) => events.push(e.type) }
    let calls = 0
    const bridge = {
      call: async (_id: string, method: string, p: { method: string; params: { objectId: string; functionDeclaration: string; arguments: { value: unknown }[] } }) => {
        assert.equal(method, 'cdp')
        assert.equal(p.method, 'Runtime.callFunctionOn')
        calls++
        const fn = new Function(`return (${p.params.functionDeclaration})`)() as (...a: unknown[]) => unknown
        return { result: { value: fn.apply(input, p.params.arguments.map((a) => a.value)) } }
      },
    } as unknown as ChromeBridge
    await chromeDriver(bridge, 'c1', 1).setFiles('obj', [join(dir, 'clip.mp4'), join(dir, 'empty.png')])
    const files = input.files as File[]
    assert.equal(files.length, 2)
    assert.equal(files[0].name, 'clip.mp4')
    assert.equal(files[0].type, 'video/mp4')
    assert.deepEqual(Buffer.from(await files[0].arrayBuffer()), big)
    assert.equal(files[1].name, 'empty.png')
    assert.equal(files[1].size, 0)
    assert.deepEqual(events, ['input', 'change'])
    assert.equal(calls, 1 + 3 + 1 + 1) // başla, 3 parça, boş dosya, bitir
    assert.equal(input[Symbol.for('share97.upload')], undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
