import { mergeInto, syncedPart, writeSave, type SaveData, type SyncedSave } from './save'
import { betterGhost, listGhosts, packGhost, putGhost, unpackGhost, type Ghost } from './ghosts'

/**
 * Cloud sync: progress is shared between the family's devices through a Firebase Realtime
 * Database, over its plain REST interface (no SDK). The first device creates a family code;
 * other devices join with it. Each sync reads the family's progress, merges it in (save.ts
 * mergeInto keeps the best of both and never loses coins), and writes the result back, using
 * Firebase's ETag check so two devices syncing at the same moment cannot overwrite each other.
 *
 * Ghosts sync too, separately because they are bigger (about 50 KB each): a small index lists
 * each ghost the family has (player, track and mode, best or last, distance, time, when) and
 * only ghosts that are missing or beaten are sent either way. A better best wins; for "last",
 * the most recent run wins.
 *
 * Layout: families/<code>/save, families/<code>/ghostIndex, families/<code>/ghosts/<id>.
 * The database address is set in CLOUD_DB_URL below. Without it, sync stays switched off.
 * The family code is the only key to the data, so it is long and random.
 */
export const CLOUD_DB_URL = ''

export type SyncState = 'off' | 'syncing' | 'ok' | 'error'

const CODE_KEY = 'ridgeline.family'
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A new family code: 12 characters (about 59 bits), shown as XXXX-XXXX-XXXX. */
export function newFamilyCode(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** Accepts a typed code with any case, spaces or dashes; null if it cannot be a code. */
export function normaliseCode(typed: string): string | null {
  const code = typed.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === 12 && [...code].every((c) => ALPHABET.includes(c)) ? code : null
}

export const showCode = (code: string) => code.match(/.{1,4}/g)!.join('-')

// Firebase keys may not contain . $ # [ ] /; race record keys look like "meadow.race500".
const encodeKey = (k: string) => k.replace(/\./g, '~')
const decodeKey = (k: string) => k.replace(/~/g, '.')
const mapKeys = <T>(o: Record<string, Record<string, T>> | undefined, f: (k: string) => string) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([name, inner]) => [name, Object.fromEntries(Object.entries(inner ?? {}).map(([k, v]) => [f(k), v]))]))

export const toCloud = (s: SyncedSave) => ({ ...s, playerTimes: mapKeys(s.playerTimes, encodeKey) })
export const fromCloud = (s: Partial<SyncedSave>): Partial<SyncedSave> => ({ ...s, playerTimes: mapKeys(s.playerTimes, decodeKey) })

/** A database address set on this device (localStorage 'ridgeline.cloudurl'), for testing. */
function configuredUrl(): string {
  try {
    return localStorage.getItem('ridgeline.cloudurl') ?? ''
  } catch {
    return ''
  }
}

/** What the ghost index records about each ghost. */
interface GhostMeta {
  distance: number
  time?: number
  at?: number
}
const metaOf = (g: Ghost): GhostMeta => ({ distance: g.distance, ...(g.time !== undefined ? { time: g.time } : {}), at: g.at ?? 0 })
/** A Firebase-safe id for a player's ghost on a track and mode: "Wille~meadow_race500~best". */
const ghostId = (player: string, env: string, kind: 'best' | 'last') => `${player}~${env.replace(/[.$#[\]/]/g, '_')}~${kind}`

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export class CloudSync {
  state: SyncState = 'off'
  lastSync: number | null = null
  /** Called when progress from another device has been merged in, and when the state changes. */
  onMerged: () => void = () => undefined
  onState: () => void = () => undefined
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null

  constructor(
    private readonly save: SaveData,
    private readonly url = CLOUD_DB_URL || configuredUrl(),
    private readonly fetchFn: Fetch = (u, i) => fetch(u, i),
  ) {}

  /** True when a database address is set (otherwise the feature stays hidden). */
  get available(): boolean {
    return this.url !== ''
  }

  get code(): string | null {
    try {
      return localStorage.getItem(CODE_KEY)
    } catch {
      return null
    }
  }

  private setCode(code: string | null): void {
    try {
      if (code) localStorage.setItem(CODE_KEY, code)
      else localStorage.removeItem(CODE_KEY)
    } catch {
      // Storage unavailable: sync lasts this session only.
    }
  }

  /** Start sharing this device's progress under a new family code. */
  async createFamily(): Promise<string> {
    const code = newFamilyCode()
    this.setCode(code)
    await this.syncNow()
    return code
  }

  /** Join another device's family code: its progress is merged into this device's. */
  async join(typed: string): Promise<boolean> {
    const code = normaliseCode(typed)
    if (!code) return false
    this.setCode(code)
    await this.syncNow()
    return this.state === 'ok'
  }

  /** Stop syncing on this device (the family's progress stays in the cloud). */
  leave(): void {
    this.setCode(null)
    this.setState('off')
  }

  /** Sync a moment after a change, bundling several changes into one sync. */
  soon(): void {
    if (!this.available || !this.code) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.syncNow(), 1500)
  }

  /** Read, merge and write back now. Safe to call often; overlapping calls share one sync. */
  syncNow(): Promise<void> {
    if (!this.available || !this.code) return Promise.resolve()
    this.running ??= this.run().finally(() => (this.running = null))
    return this.running
  }

  private setState(s: SyncState): void {
    this.state = s
    if (s === 'ok') this.lastSync = Date.now()
    this.onState()
  }

  /** Send ghosts the cloud lacks or that beat its copy; fetch the ones that beat this device's. */
  private async syncGhosts(family: string): Promise<void> {
    const got = await this.fetchFn(`${family}/ghostIndex.json`, { cache: 'no-store' })
    if (!got.ok) throw new Error(`ghost index ${got.status}`)
    const remote = ((await got.json()) ?? {}) as Record<string, GhostMeta>
    const local = new Map(listGhosts().map((s) => [ghostId(s.player, s.env, s.kind), s]))
    const wins = (kind: 'best' | 'last', a: GhostMeta, b: GhostMeta) => (kind === 'best' ? betterGhost(a, b) : (a.at ?? 0) > (b.at ?? 0))
    const updates: Record<string, GhostMeta> = {}
    for (const [id, s] of local) {
      const meta = metaOf(s.ghost)
      const r = remote[id]
      if (r && !wins(s.kind, meta, r)) continue
      const put = await this.fetchFn(`${family}/ghosts/${id}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packGhost(s.ghost)) })
      if (!put.ok) throw new Error(`ghost write ${put.status}`)
      updates[id] = meta
    }
    if (Object.keys(updates).length) {
      const patch = await this.fetchFn(`${family}/ghostIndex.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      if (!patch.ok) throw new Error(`ghost index write ${patch.status}`)
    }
    for (const [id, r] of Object.entries(remote)) {
      if (updates[id]) continue
      const kind = id.endsWith('~best') ? 'best' : 'last'
      const mine = local.get(id)
      if (mine && !wins(kind, r, metaOf(mine.ghost))) continue
      const res = await this.fetchFn(`${family}/ghosts/${id}.json`, { cache: 'no-store' })
      const ghost = res.ok ? unpackGhost(await res.json()) : null
      if (ghost) putGhost(kind, ghost)
    }
  }

  private async run(): Promise<void> {
    const family = `${this.url.replace(/\/$/, '')}/families/${this.code}`
    const where = `${family}/save.json`
    this.setState('syncing')
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const got = await this.fetchFn(where, { headers: { 'X-Firebase-ETag': 'true' }, cache: 'no-store' })
        if (!got.ok) throw new Error(`read ${got.status}`)
        const etag = got.headers.get('ETag')
        const remote = (await got.json()) as Partial<SyncedSave> | null
        if (remote) {
          mergeInto(this.save, fromCloud(remote))
          writeSave(this.save)
          this.onMerged()
        }
        const put = await this.fetchFn(where, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(etag ? { 'if-match': etag } : {}) },
          body: JSON.stringify(toCloud(syncedPart(this.save))),
        })
        // 412: another device wrote in between; read its progress and try again.
        if (put.status === 412) continue
        if (!put.ok) throw new Error(`write ${put.status}`)
        await this.syncGhosts(family)
        this.setState('ok')
        return
      }
      throw new Error('busy')
    } catch {
      this.setState('error')
    }
  }
}
