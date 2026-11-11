import { beforeEach, describe, expect, it } from 'vitest'
import { BASE_LEVELS } from '../src/data/upgrades'
import { CloudSync, normaliseCode, showCode } from '../src/save/cloud'
import { loadGhost, putGhost, type Ghost } from '../src/save/ghosts'
import { addScore, earn, emptySave, loadSave, mergeInto, spend, syncedPart } from '../src/save/save'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('progress sync between devices', () => {
  beforeEach(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
  })

  it('two iPads playing at once neither lose nor double-count coins', () => {
    const ipad = emptySave()
    const phone = emptySave()
    // Both start from the same synced state: 1000 coins earned on the iPad.
    earn(ipad, 1000)
    mergeInto(phone, syncedPart(ipad))
    expect(phone.coins).toBe(1000)
    // Then, without syncing: the iPad earns 500 and spends 300; the phone earns 200 and spends 700.
    earn(ipad, 500)
    spend(ipad, 300)
    earn(phone, 200)
    spend(phone, 700)
    mergeInto(ipad, syncedPart(phone))
    mergeInto(phone, syncedPart(ipad))
    expect(ipad.coins).toBe(1000 + 500 - 300 + 200 - 700)
    expect(phone.coins).toBe(ipad.coins)
  })

  it('merging the same progress again changes nothing', () => {
    const a = emptySave()
    const b = emptySave()
    earn(a, 800)
    a.levels.runabout = { ...BASE_LEVELS, engine: 4 }
    addScore(a, { name: 'Wille', vehicle: 'runabout', env: 'meadow', distance: 420 })
    mergeInto(b, syncedPart(a))
    const once = JSON.stringify(syncedPart(b))
    mergeInto(b, syncedPart(a))
    mergeInto(b, syncedPart(b))
    expect(JSON.stringify(syncedPart(b))).toBe(once)
  })

  it('keeps the best of both: upgrades, unlocks, bests, times and highscores', () => {
    const a = emptySave()
    const b = emptySave()
    a.levels.runabout = { ...BASE_LEVELS, engine: 5, tyres: 2 }
    b.levels.runabout = { ...BASE_LEVELS, engine: 3, tyres: 6 }
    a.unlocked = ['crater']
    b.unlocked = ['frost']
    a.playerBest = { Wille: { meadow: 900 } }
    b.playerBest = { Wille: { meadow: 700, frost: 300 }, Frans: { meadow: 500 } }
    a.playerTimes = { Wille: { 'meadow.race500': 70 } }
    b.playerTimes = { Wille: { 'meadow.race500': 64 } }
    addScore(a, { name: 'Wille', vehicle: 'runabout', env: 'meadow', distance: 900 })
    addScore(b, { name: 'Frans', vehicle: 'runabout', env: 'meadow', distance: 500 })
    mergeInto(a, syncedPart(b))
    expect(a.levels.runabout.engine).toBe(5)
    expect(a.levels.runabout.tyres).toBe(6)
    expect(a.unlocked.sort()).toEqual(['crater', 'frost'])
    expect(a.playerBest).toEqual({ Wille: { meadow: 900, frost: 300 }, Frans: { meadow: 500 } })
    expect(a.playerTimes.Wille['meadow.race500']).toBe(64)
    expect(a.scores.map((s) => s.name)).toEqual(['Wille', 'Frans'])
  })

  it('does not merge this device\'s own choices (who plays, vehicle, track)', () => {
    const a = emptySave()
    const b = emptySave()
    b.players = ['Johan']
    b.vehicleId = 'hauler'
    mergeInto(a, syncedPart(b))
    expect(a.players).toEqual(['Wille'])
    expect(a.vehicleId).toBe('runabout')
    expect(a.deviceId).not.toBe(b.deviceId)
  })

  it('turns an old plain coin count into this device\'s earnings', () => {
    localStorage.setItem('ridgeline.save', JSON.stringify({ version: 1, coins: 1550, levels: {}, best: {}, unlocked: [], envId: 'meadow', vehicleId: 'runabout' }))
    const save = loadSave()
    expect(save.coins).toBe(1550)
    expect(Object.values(save.ledger)).toEqual([{ earned: 1550, spent: 0 }])
    // And it keeps the same device id after the next load.
    localStorage.setItem('ridgeline.save', JSON.stringify(save))
    expect(loadSave().deviceId).toBe(save.deviceId)
  })

  it('cannot spend more than the bank', () => {
    const a = emptySave()
    earn(a, 100)
    expect(spend(a, 300)).toBe(false)
    expect(a.coins).toBe(100)
  })
})


/** An in-memory stand-in for the Firebase REST API, with ETag checks like the real one. */
function fakeFirebase() {
  const db = new Map<string, string>()
  let version = 0
  const etags = new Map<string, string>()
  const fetchFn = async (url: string, init?: RequestInit) => {
    const key = url.replace(/^https:\/\/[^/]+\//, '')
    const method = init?.method ?? 'GET'
    if (method === 'GET') {
      const body = db.get(key) ?? 'null'
      return new Response(body, { status: 200, headers: { ETag: etags.get(key) ?? 'null_etag' } })
    }
    const want = (init?.headers as Record<string, string> | undefined)?.['if-match']
    if (want && want !== (etags.get(key) ?? 'null_etag')) return new Response('', { status: 412 })
    const text = String(init?.body)
    // Firebase rejects keys with dots.
    if (/"[^"]*\.[^"]*":/.test(text.replace(/"\d+(\.\d+)?"/g, ''))) return new Response('bad key', { status: 400 })
    const merged = method === 'PATCH' ? JSON.stringify({ ...JSON.parse(db.get(key) ?? '{}'), ...JSON.parse(text) }) : text
    db.set(key, merged)
    etags.set(key, `e${++version}`)
    return new Response(merged, { status: 200 })
  }
  return { db, fetchFn: fetchFn as unknown as (u: string, i?: RequestInit) => Promise<Response> }
}

describe('cloud sync (fake Firebase)', () => {
  beforeEach(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
  })

  it('a second device joins with the code and gets the first device\'s progress', async () => {
    const fb = fakeFirebase()
    const ipad = emptySave()
    earn(ipad, 1200)
    ipad.levels.runabout = { ...BASE_LEVELS, engine: 3 }
    ipad.playerTimes = { Wille: { 'meadow.race500': 66 } }
    const a = new CloudSync(ipad, 'https://x.firebaseio.com', fb.fetchFn)
    const code = await a.createFamily()
    expect(a.state).toBe('ok')

    // The phone has its own localStorage in real life; here the code is passed by hand.
    const phone = emptySave()
    const b = new CloudSync(phone, 'https://x.firebaseio.com', fb.fetchFn)
    expect(await b.join(showCode(code).toLowerCase())).toBe(true)
    expect(phone.coins).toBe(1200)
    expect(phone.levels.runabout.engine).toBe(3)
    expect(phone.playerTimes.Wille['meadow.race500']).toBe(66)
  })

  it('two devices syncing at the same moment both keep their coins', async () => {
    const fb = fakeFirebase()
    const one = emptySave()
    const two = emptySave()
    const a = new CloudSync(one, 'https://x.firebaseio.com', fb.fetchFn)
    const code = await a.createFamily()
    const b = new CloudSync(two, 'https://x.firebaseio.com', fb.fetchFn)
    await b.join(code)
    earn(one, 300)
    earn(two, 500)
    await Promise.all([a.syncNow(), b.syncNow()])
    await a.syncNow()
    await b.syncNow()
    expect(one.coins).toBe(800)
    expect(two.coins).toBe(800)
  })

  it('stays off without a database address, and rejects mistyped codes', async () => {
    const s = new CloudSync(emptySave(), '')
    expect(s.available).toBe(false)
    expect(normaliseCode('ABCD-EFGH-JK')).toBeNull()
    expect(normaliseCode('abcd efgh jkmn')).toBe('ABCDEFGHJKMN')
  })
})

describe('ghost sync (fake Firebase)', () => {
  const ghost = (player: string, env: string, distance: number, at: number, time?: number): Ghost => ({ v: 1, player, vehicle: 'runabout', env, distance, time, at, wheels: 2, data: [1, 2, 3, 4, 5, 6, 7, 8, 9] })

  it('ghosts recorded on one device appear on the other, and the better best wins', async () => {
    const fb = fakeFirebase()
    // Device A: Wille's best 500 m on Green Meadows, and a 500 m race in 70 s.
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
    const storeA = globalThis.localStorage
    putGhost('best', ghost('Wille', 'meadow', 500, 1))
    putGhost('last', ghost('Wille', 'meadow', 300, 2))
    putGhost('best', ghost('Wille', 'meadow.race500', 500, 1, 70))
    const a = new CloudSync(emptySave(), 'https://x.firebaseio.com', fb.fetchFn)
    const code = await a.createFamily()
    expect(a.state).toBe('ok')

    // Device B: its own, better race ghost (64 s) and an older last run.
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
    const storeB = globalThis.localStorage
    putGhost('best', ghost('Wille', 'meadow.race500', 500, 5, 64))
    putGhost('last', ghost('Wille', 'meadow', 200, 0))
    const b = new CloudSync(emptySave(), 'https://x.firebaseio.com', fb.fetchFn)
    await b.join(code)
    expect(b.state).toBe('ok')
    expect(loadGhost('Wille', 'meadow', 'best')!.distance).toBe(500) // fetched from A
    expect(loadGhost('Wille', 'meadow', 'last')!.distance).toBe(300) // A's is newer
    expect(loadGhost('Wille', 'meadow.race500', 'best')!.time).toBe(64) // B's own is better

    // Back on A: it receives B's faster race ghost.
    ;(globalThis as { localStorage?: unknown }).localStorage = storeA
    await a.syncNow()
    expect(loadGhost('Wille', 'meadow.race500', 'best')!.time).toBe(64)
    void storeB
    // Ghost ids are Firebase-safe (no dots).
    expect([...fb.db.keys()].some((k) => k.includes('ghosts/Wille~meadow_race500~best'))).toBe(true)
  })
})

