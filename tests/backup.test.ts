import { describe, expect, it } from 'vitest'
import { CloudBackup, summarise } from '../src/save/backup'

/** A stand-in for the Firebase Realtime Database's REST interface (GET/PUT on paths). */
function fakeDb() {
  const data: Record<string, unknown> = {}
  const fetchFn = async (url: string, init?: RequestInit) => {
    const path = url.replace('https://db.example/', '').replace(/\.json$/, '')
    const parts = path.split('/')
    if (init?.method === 'PUT') {
      let node = data as Record<string, unknown>
      for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>
      node[parts[parts.length - 1]] = JSON.parse(String(init.body))
      return new Response('{}', { status: 200 })
    }
    let node: unknown = data
    for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p]
    return new Response(JSON.stringify(node ?? null), { status: 200 })
  }
  return fetchFn as unknown as (u: string, i?: RequestInit) => Promise<Response>
}

/** A stand-in for one device's localStorage. */
function fakeStore(items: Record<string, string> = {}) {
  const m = new Map(Object.entries(items))
  return {
    get length() {
      return m.size
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    map: m,
  }
}

const save = (coins: number, klur: string[]) => JSON.stringify({ version: 1, coins, unlocked: klur, players: ['Wille'], best: { meadow: 812 } })

describe('cloud backups', () => {
  it('each device backs up on its own; any device can load any backup, replacing only progress', async () => {
    const db = fakeDb()
    const ipad = fakeStore({ 'ridgeline.save': save(5000, ['klur:k1', 'klur:k2']), 'ridgeline.ghost.Wille.meadow.best': 'G1', 'ridgeline.testmode': '1' })
    const phone = fakeStore({ 'ridgeline.save': save(300, []), 'ridgeline.settings': '{"music":false}' })
    const a = new CloudBackup('https://db.example', db, ipad)
    const b = new CloudBackup('https://db.example', db, phone)
    a.name = 'Willes iPad'
    b.name = 'Telefonen'
    const code = await a.start()
    expect(await b.use(code)).toBe(true)
    expect(await b.backupNow()).toBe(true)

    const list = (await b.list())!
    expect(list.map((e) => e.name).sort()).toEqual(['Telefonen', 'Willes iPad'])
    const fromIpad = list.find((e) => e.name === 'Willes iPad')!
    expect(fromIpad.summary).toMatchObject({ coins: 5000, klur: 2, best: 812 })

    // The phone loads the iPad's progress: save and ghosts replaced, its own extra items gone,
    // its device items (code, id, name) kept.
    const phoneId = b.device
    expect(await b.load(fromIpad.device)).toBe(true)
    expect(JSON.parse(phone.getItem('ridgeline.save')!).coins).toBe(5000)
    expect(phone.getItem('ridgeline.ghost.Wille.meadow.best')).toBe('G1')
    expect(phone.getItem('ridgeline.settings')).toBeNull()
    expect(phone.getItem('ridgeline.testmode')).toBeNull()
    expect(b.device).toBe(phoneId)
    expect(b.name).toBe('Telefonen')
    expect(b.code).toBe(code)
    // Its next backup goes to its own slot, not over the iPad's.
    await b.backupNow()
    const after = (await a.list())!
    expect(after).toHaveLength(2)
    expect(after.find((e) => e.name === 'Willes iPad')!.device).not.toBe(phoneId)
  })

  it('a wrong code is refused, and with no database address the feature is off', async () => {
    const b = new CloudBackup('https://db.example', fakeDb(), fakeStore())
    expect(await b.use('nope')).toBe(false)
    const off = new CloudBackup('', fakeDb(), fakeStore())
    expect(off.available).toBe(false)
    expect(await off.backupNow()).toBe(false)
  })

  it('summarises a save', () => {
    expect(summarise({ 'ridgeline.save': save(1234.4, ['klur:k1', 'hat:cap']) })).toEqual({ coins: 1234, klur: 1, players: ['Wille'], best: 812 })
  })
})
