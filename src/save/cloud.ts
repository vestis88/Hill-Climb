import { mergeInto, syncedPart, writeSave, type SaveData, type SyncedSave } from './save'

/**
 * Cloud sync: progress is shared between the family's devices through a Firebase Realtime
 * Database, over its plain REST interface (no SDK). The first device creates a family code;
 * other devices join with it. Each sync reads the family's progress, merges it in (save.ts
 * mergeInto keeps the best of both and never loses coins), and writes the result back, using
 * Firebase's ETag check so two devices syncing at the same moment cannot overwrite each other.
 *
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

  private async run(): Promise<void> {
    const where = `${this.url.replace(/\/$/, '')}/saves/${this.code}.json`
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
        this.setState('ok')
        return
      }
      throw new Error('busy')
    } catch {
      this.setState('error')
    }
  }
}
