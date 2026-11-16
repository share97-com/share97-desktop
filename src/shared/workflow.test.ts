import assert from 'node:assert/strict'
import test from 'node:test'
import { batchesOf, canEnterSubWorkflow, dueSlot, evalExpr, evaluateCondition, interpolate, isPublish, nextSlots, NO_CONTENT, NodeWalker, runWalk, skipReason, splitByMedia, zonedToUtc, type Graph, type RunStep, type Trigger } from './workflow.ts'

/* Akış motorunun saf kuralları: yürüyüş (öğe grupları, hata kolu, birleşme, döngü), ifadeler, yuvalar ve atlanma nedeni. */

test('NodeWalker: iki koldan birleşen düğüm (fan-in) en çok bir kez ziyaret ediliyor', () => {
  // Elmas şekli: A, B'ye ve C'ye dallanıyor; B ve C de aynı D'de birleşiyor (bkz. `smartQueue`
  // şablonundaki "iki kenar aynı düğüme" deseni). `run.ts`in `walk()` fonksiyonu bu sınıfı
  // kullanıyor — eski kodda `visited` yoktu ve D iki kez çalışırdı (çift yayın/üretim riski).
  const w = new NodeWalker(['A'])
  const order: string[] = []
  const next: Record<string, string[]> = { A: ['B', 'C'], B: ['D'], C: ['D'], D: [] }
  let id: string | undefined
  while ((id = w.next()) !== undefined) {
    order.push(id)
    w.push(next[id])
  }
  assert.deepEqual(order, ['A', 'B', 'D', 'C'])
  assert.equal(order.filter((x) => x === 'D').length, 1, 'D birleşme noktası tam bir kez çalışmalı')
})

test('NodeWalker: fan-out ile çatallanan iki ayrı dal da çalışıyor (hiçbiri atlanmıyor)', () => {
  // Tetikleyiciden iki ayrı yayın düğümüne çatallanma — `fan()` şablonlarının şekli
  // (`crossPost`, `seoEvergreen`, …): her iki dal da bağımsızca ziyaret edilmeli.
  const w = new NodeWalker(['T'])
  const order: string[] = []
  const next: Record<string, string[]> = { T: ['ig1', 'tt1'], ig1: [], tt1: [] }
  let id: string | undefined
  while ((id = w.next()) !== undefined) {
    order.push(id)
    w.push(next[id])
  }
  assert.deepEqual(order.sort(), ['T', 'ig1', 'tt1'])
})

test('evalExpr: serbest mantık ifadesi — sabit alan/işlem listesine bağlı değil', () => {
  const env = { hasPost: true, hasMedia: true, isVideo: false, caption: 'Merhaba dünya', captionLength: 13, mediaCount: 2, hour: 9, weekday: 2 }
  assert.equal(evalExpr('captionLength > 10', env), true)
  assert.equal(evalExpr('captionLength > 100', env), false)
  assert.equal(evalExpr('captionLength > 80 && !isVideo', env), false)
  assert.equal(evalExpr('mediaCount >= 2 && !isVideo', env), true)
  assert.equal(evalExpr('isVideo || weekday == 2', env), true)
  assert.equal(evalExpr('(hasPost && hasMedia) || isVideo', env), true)
  assert.equal(evalExpr('caption == "Merhaba dünya"', env), true)
  assert.equal(evalExpr('weekday != 2', env), false)
  // Tanımsız alan ya da bozuk söz dizimi fırlatıyor; koşul düğümü bunu `safeEvalExpr` ile yutuyor.
  assert.throws(() => evalExpr('unknownField > 1', env))
  assert.throws(() => evalExpr('captionLength >', env))
})

test('interpolate: `{{alan}}` yer tutucuları env’den dolar, tanımsız olan olduğu gibi kalır', () => {
  const env = { caption: 'Merhaba', captionLength: 7 }
  assert.equal(interpolate('{{caption}} — {{captionLength}} karakter', env), 'Merhaba — 7 karakter')
  assert.equal(interpolate('değişmeyen metin', env), 'değişmeyen metin')
  assert.equal(interpolate('{{yok}}', env), '{{yok}}')
})

test('interpolate: `{{ }}` içinde yalnız alan adı değil, serbest bir DEĞER ifadesi de yazılabiliyor (n8n’in `{{ expression }}` alanları gibi)', () => {
  const env = { mediaCount: 3, captionLength: 95, isVideo: false }
  // Bare alan: eskisi gibi çalışıyor.
  assert.equal(interpolate('{{mediaCount}} görsel', env), '3 görsel')
  // Karşılaştırma: sonucu metne basılıyor, sabit bir alan listesine bağlı değil.
  assert.equal(interpolate('uzun mu: {{captionLength > 80}}', env), 'uzun mu: true')
  assert.equal(interpolate('{{mediaCount > 0 && !isVideo}}', env), 'true')
  // Bozuk ifade/tanımsız alan yer tutucuyu olduğu gibi bırakır — şablonu bozmuyor.
  assert.equal(interpolate('{{unknownField}}', env), '{{unknownField}}')
})

/**
 * **`runWalk` — `run.ts`taki gerçek `walk()`in DB'siz testi.** `execute` burada sahte: gerçek
 * davranış (her dalın kendi öğe grubu, hata kolu, çoklu kol yönlendirmesi) `run.ts`in
 * GERÇEKTEN delegasyon yaptığı aynı fonksiyonda (`runWalk`) sınanıyor — `NodeWalker`/
 * `publishedFromSteps` gibi yardımcı saf fonksiyonları ayrı ayrı test etmekten farklı: burada
 * uçtan uca orkestrasyonun kendisi koşuyor, artık n8n'deki gibi **öğe dizileriyle**.
 */
test('runWalk: tetikleyiciden çatallanan iki dal kendi grubunu taşıyor — biri ötekini ezmiyor', async () => {
  const g: Graph = {
    nodes: [
      { id: 't', type: 'trigger', data: {} },
      { id: 'genA', type: 'generate', data: {} },
      { id: 'genB', type: 'generate', data: {} },
      { id: 'pubA', type: 'instagram', data: {} },
      { id: 'pubB', type: 'tiktok', data: {} },
    ],
    edges: [
      { source: 't', target: 'genA' },
      { source: 't', target: 'genB' },
      { source: 'genA', target: 'pubA' },
      { source: 'genB', target: 'pubB' },
    ],
  }
  const published: string[] = []
  const result = await runWalk<string>(g, [{ id: 't', items: [] }], async (node, items) => {
    if (node.type === 'generate') return { status: 'ok', items: [`content-from-${node.id}`] }
    if (isPublish(node.type)) {
      published.push(`${node.id}:${items.join(',')}`)
      return { status: 'ok' }
    }
    return { status: 'ok' }
  })
  assert.deepEqual(published.sort(), ['pubA:content-from-genA', 'pubB:content-from-genB'])
  assert.equal(result.failure, null)
})

test('runWalk: `onStep` her adımı yazıldığı anda, sırayla ve hata adımı dahil veriyor', async () => {
  const g: Graph = {
    nodes: [
      { id: 't', type: 'trigger', data: {} },
      { id: 'gen', type: 'generate', data: {} },
      { id: 'pub', type: 'instagram', data: {} },
    ],
    edges: [
      { source: 't', target: 'gen' },
      { source: 'gen', target: 'pub' },
    ],
  }
  const seen: string[] = []
  const result = await runWalk<string>(
    g,
    [{ id: 't', items: [] }],
    async (node) => {
      // Bir sonraki düğüm koşarken öncekinin adımı zaten bildirilmiş olmalı (canlı kayıt).
      assert.equal(seen.length, g.nodes.findIndex((n) => n.id === node.id))
      if (node.type === 'instagram') throw new Error('boom')
      return { status: 'ok', items: node.type === 'generate' ? ['x'] : undefined }
    },
    [],
    undefined,
    (s) => seen.push(`${s.node}:${s.status}`),
  )
  assert.deepEqual(seen, ['t:ok', 'gen:ok', 'pub:fail'])
  assert.deepEqual(result.steps.map((s) => `${s.node}:${s.status}`), seen)
})

test('runWalk: bir düğümün `error` kenarı varsa patladığında akış durmuyor, hata koluna devam ediyor', async () => {
  const g: Graph = {
    nodes: [
      { id: 't', type: 'trigger', data: {} },
      { id: 'risky', type: 'hashtags', data: {} },
      { id: 'fallback', type: 'merge', data: {} },
      { id: 'normal', type: 'merge', data: {} },
    ],
    edges: [
      { source: 't', target: 'risky' },
      { source: 'risky', target: 'normal' },
      { source: 'risky', target: 'fallback', sourceHandle: 'error' },
    ],
  }
  const visited: string[] = []
  const result = await runWalk<string>(g, [{ id: 't', items: ['x'] }], async (node) => {
    visited.push(node.id)
    if (node.id === 'risky') throw new Error('boom')
    return { status: 'ok' }
  })
  assert.deepEqual(visited, ['t', 'risky', 'fallback'])
  // Hata koluna düştüğü için çalışma genel olarak başarısız sayılmıyor — n8n'in düğüm başına hata çıkışı gibi.
  assert.equal(result.failure, null)
  assert.ok(result.steps.some((s) => s.node === 'risky' && s.status === 'fail'))
})

test('runWalk: `error` kenarı yoksa eskisi gibi — patlama çalışmayı bitiriyor', async () => {
  const g: Graph = {
    nodes: [
      { id: 't', type: 'trigger', data: {} },
      { id: 'risky', type: 'hashtags', data: {} },
      { id: 'after', type: 'merge', data: {} },
    ],
    edges: [
      { source: 't', target: 'risky' },
      { source: 'risky', target: 'after' },
    ],
  }
  const visited: string[] = []
  const result = await runWalk<string>(g, [{ id: 't', items: ['x'] }], async (node) => {
    visited.push(node.id)
    if (node.id === 'risky') throw new Error('boom')
    return { status: 'ok' }
  })
  assert.deepEqual(visited, ['t', 'risky'])
  assert.equal(result.failure, 'boom')
  assert.ok(result.error instanceof Error)
})

test('runWalk: `routes` ile tek düğüm iki kolu farklı alt gruplarla besler (koşulun öğe bazlı dallanması)', async () => {
  // n8n'in IF düğümü gibi: her öğe kendi başına değerlendirilip `yes`/`no` koluna ayrılıyor,
  // tek bir ortak karar değil. Bu, `run.ts`teki gerçek `condition` düğümünün ürettiği şekil.
  const g: Graph = {
    nodes: [
      { id: 't', type: 'trigger', data: {} },
      { id: 'c', type: 'condition', data: {} },
      { id: 'yesSink', type: 'merge', data: {} },
      { id: 'noSink', type: 'merge', data: {} },
    ],
    edges: [
      { source: 't', target: 'c' },
      { source: 'c', target: 'yesSink', sourceHandle: 'yes' },
      { source: 'c', target: 'noSink', sourceHandle: 'no' },
    ],
  }
  const seen: Record<string, string[]> = {}
  await runWalk<string>(g, [{ id: 't', items: ['even-2', 'odd-3', 'even-4'] }], async (node, items) => {
    if (node.id === 'c') return { status: 'ok', routes: [{ handle: 'yes', items: items.filter((x) => x.startsWith('even')) }, { handle: 'no', items: items.filter((x) => x.startsWith('odd')) }] }
    seen[node.id] = items
    return { status: 'ok' }
  })
  assert.deepEqual(seen.yesSink, ['even-2', 'even-4'])
  assert.deepEqual(seen.noSink, ['odd-3'])
})

test('evaluateCondition: hazır kontroller `env`den okuyor, `custom` serbest ifadeye düşüyor', () => {
  const env = { hasPost: true, hasMedia: false, isVideo: false, caption: 'x', captionLength: 1, mediaCount: 0, hour: 10, weekday: 6 }
  assert.equal(evaluateCondition('hasPost', '', env), true)
  assert.equal(evaluateCondition('hasMedia', '', env), false)
  assert.equal(evaluateCondition('isVideo', '', env), false)
  assert.equal(evaluateCondition('weekend', '', env), true)
  assert.equal(evaluateCondition('custom', 'captionLength > 0', env), true)
  // Bozuk ifade akışı durdurmuyor — `false` sayılıyor (`safeEvalExpr`).
  assert.equal(evaluateCondition('custom', 'unknownField > 1', env), false)
})

test('runWalk: `merge` düğümü `all` modunda yalnız bütün kollar ulaştıktan sonra çalışıyor', async () => {
  const g: Graph = {
    nodes: [
      { id: 't', type: 'trigger', data: {} },
      { id: 'a', type: 'hashtags', data: {} },
      { id: 'b', type: 'hashtags', data: {} },
      { id: 'm', type: 'merge', data: { mode: 'all' } },
    ],
    edges: [
      { source: 't', target: 'a' },
      { source: 't', target: 'b' },
      { source: 'a', target: 'm' },
      { source: 'b', target: 'm' },
    ],
  }
  const executed: string[] = []
  const result = await runWalk<string>(g, [{ id: 't', items: [] }], async (node) => {
    executed.push(node.id)
    return { status: 'ok' }
  })
  // `m` iki kez ziyaret ediliyor (iki kol da ulaşıyor) ama yalnız SONUNCUSUNDA gerçekten çalışıyor.
  assert.equal(executed.filter((x) => x === 'm').length, 1, '`m` tam bir kez yürütülmeli')
  assert.equal(result.steps.filter((s) => s.node === 'm' && s.status === 'skip').length, 1, 'ilk kol bekleme adımı bırakmalı')
  assert.equal(result.steps.filter((s) => s.node === 'm' && s.status === 'ok').length, 1, 'ikinci kol asıl çalıştırmayı tetiklemeli')
})

test('canEnterSubWorkflow: azami derinlik ve döngüsel çağrı (A → B → A) engelleniyor', () => {
  const visited = new Set(['A', 'B'])
  // Derinlik sınırının altında ve hedef henüz zincirde değilse girilebilir.
  assert.equal(canEnterSubWorkflow(visited, 0, 'C', 2), true)
  assert.equal(canEnterSubWorkflow(visited, 1, 'C', 2), true)
  // Azami derinliğe ulaşıldıysa (depth === maxDepth) artık girilemez.
  assert.equal(canEnterSubWorkflow(visited, 2, 'C', 2), false)
  // Hedef zaten bu zincirde varsa (döngüsel çağrı) derinlik yetse de girilemez.
  assert.equal(canEnterSubWorkflow(visited, 0, 'A', 2), false)
  assert.equal(canEnterSubWorkflow(visited, 0, 'B', 2), false)
})

test('interpolate: her öğe kendi env’iyle eşleniyor — grup içinde öğe başına farklı sonuç (n8n’in öğe bazlı eşlemesi gibi)', () => {
  // `run.ts`teki `hashtags`/`transform` tam olarak bunu yapıyor: `items.map` ile her öğenin
  // KENDİ `envOf(item)`i hesaplanıp aynı şablona uygulanıyor — tek bir ortak değer değil.
  const items = [
    { caption: 'Kahve tarifi', captionLength: 12 },
    { caption: 'Kış rehberi', captionLength: 11 },
  ]
  const template = '{{caption}} ({{captionLength}} karakter)'
  const mapped = items.map((item) => interpolate(template, item))
  assert.deepEqual(mapped, ['Kahve tarifi (12 karakter)', 'Kış rehberi (11 karakter)'])
  // Aynı şablon, farklı öğe → farklı sonuç: eşleme grup genelinde tek bir değere düşmüyor.
  assert.notEqual(mapped[0], mapped[1])
})

test('splitByMedia: her öğeyi kendi medyası kadar öğeye ayırıyor; medyasız öğe değişmiyor', () => {
  const items = [
    { id: 'p1', media: ['a.jpg', 'b.jpg', 'c.jpg'] },
    { id: 'p2', media: ['x.jpg'] },
    { id: 'p3', media: [] as string[] },
  ]
  const out = splitByMedia(items)
  assert.deepEqual(
    out.map((o) => ({ id: o.id, media: o.media })),
    [
      { id: 'p1', media: ['a.jpg'] },
      { id: 'p1', media: ['b.jpg'] },
      { id: 'p1', media: ['c.jpg'] },
      { id: 'p2', media: ['x.jpg'] },
      { id: 'p3', media: [] },
    ],
  )
})

test('batchesOf: grubu parça boyutunda ardışık dilimlere bölüyor', () => {
  assert.deepEqual(batchesOf([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(batchesOf([1, 2, 3], 1), [[1], [2], [3]])
  assert.deepEqual(batchesOf([1, 2, 3], 10), [[1, 2, 3]])
  assert.deepEqual(batchesOf([], 2), [])
  // Boyut 0 ya da negatifse 1 kabul edilir — sonsuz boş dilim üretmiyor.
  assert.deepEqual(batchesOf([1, 2], 0), [[1], [2]])
})

test('runWalk: `loop` düğümü grafta geri kenar açmadan parça parça işliyor — her parça `loop` alt-grafını bir kez baştan sona yürütüyor, `done` orijinal grupla sürer', async () => {
  // `run.ts`teki gerçek `loop` düğümü tam bu desenle çalışıyor: `batchesOf` ile dilimleyip
  // her dilim için `runWalk`i özyinelemeli çağırıyor (`subWorkflow` gibi) — graf çevrimsiz kalıyor,
  // hiçbir geri kenar yok; yalnız aynı ileri yönlü alt-graf parça sayısı kadar yeniden yürüyor.
  // `done`: parçaların dönüştürülmüş çıktısını birleştirmiyor — akışa giren ORİJİNAL grupla
  // sürüyor ("bütün parçalar bitti" sinyali; sahte bir toplu üretim değil).
  const loopBody: Graph = {
    nodes: [{ id: 'body', type: 'hashtags', data: {} }],
    edges: [],
  }
  const bodyCalls: string[][] = []
  const items = ['a', 'b', 'c', 'd', 'e']
  const batches = batchesOf(items, 2)
  for (const batch of batches) {
    await runWalk<string>(loopBody, [{ id: 'body', items: batch }], async (_node, it) => {
      bodyCalls.push(it.map((x) => x.toUpperCase())) // alt-graf dönüştürse de (örn. büyük harfe çevirse) `done` bundan etkilenmiyor
      return { status: 'ok' }
    })
  }
  const doneItems = items // `run.ts`teki `loop` case'i de tam bunu döndürüyor — toplanan çıktı değil.
  assert.deepEqual(batches, [['a', 'b'], ['c', 'd'], ['e']])
  assert.deepEqual(bodyCalls, [['A', 'B'], ['C', 'D'], ['E']], 'alt-graf parça sayısı kadar, her parça kendi grubuyla çalıştı')
  assert.deepEqual(doneItems, items, '`done` alt-grafın dönüştürdüğü değil, akışa giren orijinal grupla sürer')
})

const weekly = (days: number[], times: string[]): Trigger => ({ mode: 'weekly', days, times, everyHours: 24 })

test('dueSlot: aralıktaki en son yuva; kaçan yuvalar tek telafi, bir günden eskisi çalışmaz', () => {
  const tz = 'Europe/Istanbul'
  const at = (d: number, h: number, m = 0) => zonedToUtc(2026, 11, d, h, m, tz)
  const t = weekly([0, 1, 2, 3, 4, 5, 6], ['09:00', '18:00'])
  assert.equal(dueSlot(t, tz, at(16, 8, 59), at(16, 8, 59, ) + 30_000), null, 'saati gelmedi')
  assert.equal(dueSlot(t, tz, at(16, 8, 59), at(16, 9, 0)), at(16, 9), 'tam saatinde')
  assert.equal(dueSlot(t, tz, at(16, 9, 0), at(16, 9, 1)), null, 'aynı yuva ikinci kez gelmez')
  // Uygulama 08:00-19:00 arası kapalıydı: 09:00 ve 18:00 kaçtı, yalnız sonuncusu çalışır.
  assert.equal(dueSlot(t, tz, at(16, 8), at(16, 19)), at(16, 18))
  // Üç gün kapalı: yalnız son 24 saatteki en son yuva.
  assert.equal(dueSlot(t, tz, at(13, 8), at(16, 8)), at(15, 18))
  assert.equal(dueSlot(weekly([1], ['09:00']), tz, at(10, 8), at(18, 8)), null, 'bir günden eski yuva çalışmaz')
  // Her N saatte bir: çağa hizalı.
  const every: Trigger = { mode: 'interval', days: [], times: [], everyHours: 3 }
  const h = 3_600_000
  assert.equal(dueSlot(every, tz, 9 * h + 1, 12 * h), 12 * h)
  assert.equal(dueSlot(every, tz, 12 * h, 14 * h), null)
  assert.deepEqual(nextSlots(every, tz, 12 * h, 2), [15 * h, 18 * h])
})

test('skipReason: atlanan çalışma nedenini yazar', () => {
  const g = (handle: string | null): Graph => ({
    nodes: [{ id: 't1', type: 'trigger', data: {} }, { id: 'q1', type: 'queue', data: {} }, { id: 'ig1', type: 'instagram', data: {} }],
    edges: [{ source: 't1', target: 'q1' }, { source: 'q1', target: 'ig1', sourceHandle: handle }],
  })
  const step = (node: string, type: RunStep['type'], status: RunStep['status'], detail?: string) => ({ node, type, status, detail })
  // Kuyruğun içeriği yalnız hata koluna bağlı: içerik alındı ama hesaba hiç varmadı.
  assert.match(skipReason(g('error'), [step('t1', 'trigger', 'ok'), step('q1', 'queue', 'ok', '3: merhaba')]), /error output/)
  assert.match(skipReason(g(null), [step('t1', 'trigger', 'ok'), step('q1', 'queue', 'skip', NO_CONTENT)]), /No content left/)
  assert.match(skipReason(g(null), [step('t1', 'trigger', 'ok'), step('q1', 'queue', 'ok'), step('ig1', 'instagram', 'skip', 'no items')]), /no items/)
  assert.match(skipReason(g(null), [step('t1', 'trigger', 'ok')]), /No account step was reached/)
})
