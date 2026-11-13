import { CLOUD_DB_URL, newFamilyCode, normaliseCode } from './cloud'

/**
 * Cloud backups: each device keeps its own full copy of its progress in the cloud, and any
 * device can load any of them. Nothing is merged or synced: loading a backup replaces this
 * device's progress with that one. So progress can be carried from one iPad to another, or
 * brought back after the home-screen icon was removed (which deletes the app's storage).
 *
 * What is backed up: every "ridgeline.*" item in this browser's storage (the save with coins,
 * upgrades, unlocks and records; all ghosts; settings, colours, Trimning), except the few items
 * that belong to the device itself (KEEP below).
 *
 * Layout in the Firebase Realtime Database (the same database as cloud sync, CLOUD_DB_URL):
 *   backups/<code>/index/<device>  { name, at, summary }   small, listed in Settings
 *   backups/<code>/data/<device>   the snapshot, one JSON string
 * The backup code is the only key, so it is long and random (like the family code).
 */
export interface BackupSummary {
  coins: number
  /** Klurbanor finished. */
  klur: number
  /** Players on that device's save. */
  players: string[]
  /** Furthest distance anyone drove, any map (m). */
  best: number
}

export interface BackupEntry {
  device: string
  name: string
  at: number
  summary: BackupSummary
}

const CODE_KEY = 'ridgeline.backupcode'
const DEVICE_KEY = 'ridgeline.backupdevice'
const NAME_KEY = 'ridgeline.devicename'
const LAST_KEY = 'ridgeline.lastbackup'
/** Items that belong to this device, not to its progress: never backed up or overwritten. */
const KEEP = new Set([CODE_KEY, DEVICE_KEY, NAME_KEY, LAST_KEY, 'ridgeline.family', 'ridgeline.cloudurl', 'ridgeline.testmode'])

type Fetch = (url: string, init?: RequestInit) => Promise<Response>
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

const ls = (): Store | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

function configuredUrl(): string {
  try {
    return localStorage.getItem('ridgeline.cloudurl') ?? ''
  } catch {
    return ''
  }
}

/** A name for this device until the family gives it one: "iPad", "iPhone" or "Dator". */
function defaultName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  return 'Dator'
}

/** All progress items in this browser's storage, as one object. */
export function snapshot(store: Store | null = ls()): Record<string, string> {
  const out: Record<string, string> = {}
  if (!store) return out
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith('ridgeline.') && !KEEP.has(k)) out[k] = store.getItem(k) ?? ''
  }
  return out
}

/** Replace this device's progress items with a snapshot's (device items are left alone). */
export function restoreSnapshot(snap: Record<string, string>, store: Store | null = ls()): void {
  if (!store) return
  const old: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith('ridgeline.') && !KEEP.has(k)) old.push(k)
  }
  for (const k of old) store.removeItem(k)
  for (const [k, v] of Object.entries(snap)) if (k.startsWith('ridgeline.') && !KEEP.has(k)) store.setItem(k, v)
}

/** A few numbers to recognise a backup by, from the snapshot's save. */
export function summarise(snap: Record<string, string>): BackupSummary {
  try {
    const save = JSON.parse(snap['ridgeline.save'] ?? '{}') as { coins?: number; unlocked?: string[]; players?: string[]; best?: Record<string, number> }
    return {
      coins: Math.round(save.coins ?? 0),
      klur: (save.unlocked ?? []).filter((u) => u.startsWith('klur:')).length,
      players: save.players ?? [],
      best: Math.round(Math.max(0, ...Object.values(save.best ?? {}))),
    }
  } catch {
    return { coins: 0, klur: 0, players: [], best: 0 }
  }
}

export class CloudBackup {
  state: 'off' | 'working' | 'ok' | 'error' = 'off'
  onState: () => void = () => undefined
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<boolean> | null = null

  constructor(
    private readonly url = CLOUD_DB_URL || configuredUrl(),
    private readonly fetchFn: Fetch = (u, i) => fetch(u, i),
    private readonly store: Store | null = ls(),
  ) {}

  /** True when a database address is set (otherwise the feature stays hidden). */
  get available(): boolean {
    return this.url !== ''
  }

  get code(): string | null {
    return this.store?.getItem(CODE_KEY) ?? null
  }

  /** This device's own id for its backup (not part of the progress, so it survives a restore). */
  get device(): string {
    let id = this.store?.getItem(DEVICE_KEY) ?? null
    if (!id) {
      id = newFamilyCode().toLowerCase()
      this.store?.setItem(DEVICE_KEY, id)
    }
    return id
  }

  get name(): string {
    return this.store?.getItem(NAME_KEY) || defaultName()
  }

  set name(n: string) {
    this.store?.setItem(NAME_KEY, n.trim().slice(0, 30) || defaultName())
  }

  /** When this device last backed up (ms), or null. */
  get last(): number | null {
    const v = Number(this.store?.getItem(LAST_KEY))
    return v > 0 ? v : null
  }

  private base(): string {
    return `${this.url.replace(/\/$/, '')}/backups/${this.code}`
  }

  private setState(s: CloudBackup['state']): void {
    this.state = s
    this.onState()
  }

  /** Start backing up under a new code (the first device). */
  async start(): Promise<string> {
    const code = newFamilyCode()
    this.store?.setItem(CODE_KEY, code)
    await this.backupNow()
    return code
  }

  /** Use a code from another device: this device's backups go there too, and theirs can be loaded. */
  async use(typed: string): Promise<boolean> {
    const code = normaliseCode(typed)
    if (!code) return false
    this.store?.setItem(CODE_KEY, code)
    return (await this.list()) !== null
  }

  /** Stop backing up on this device (its backup stays in the cloud). */
  stop(): void {
    this.store?.removeItem(CODE_KEY)
    this.setState('off')
  }

  /** Back up a little later, bundling several changes (after a run, a purchase). */
  soon(delay = 20000): void {
    if (!this.available || !this.code) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.backupNow(), delay)
  }

  /** Send this device's progress now. Overlapping calls share one upload. */
  backupNow(): Promise<boolean> {
    if (!this.available || !this.code) return Promise.resolve(false)
    this.running ??= this.upload().finally(() => (this.running = null))
    return this.running
  }

  private async upload(): Promise<boolean> {
    this.setState('working')
    try {
      const snap = snapshot(this.store)
      const at = Date.now()
      const entry = { name: this.name, at, summary: summarise(snap) }
      const json = { 'Content-Type': 'application/json' }
      const data = await this.fetchFn(`${this.base()}/data/${this.device}.json`, { method: 'PUT', headers: json, body: JSON.stringify(JSON.stringify(snap)) })
      if (!data.ok) throw new Error(`backup ${data.status}`)
      const index = await this.fetchFn(`${this.base()}/index/${this.device}.json`, { method: 'PUT', headers: json, body: JSON.stringify(entry) })
      if (!index.ok) throw new Error(`index ${index.status}`)
      this.store?.setItem(LAST_KEY, String(at))
      this.setState('ok')
      return true
    } catch {
      this.setState('error')
      return false
    }
  }

  /** Every device's backup under this code, newest first; null if the cloud cannot be reached. */
  async list(): Promise<BackupEntry[] | null> {
    if (!this.available || !this.code) return null
    try {
      const res = await this.fetchFn(`${this.base()}/index.json`, { cache: 'no-store' })
      if (!res.ok) return null
      const all = ((await res.json()) ?? {}) as Record<string, Omit<BackupEntry, 'device'>>
      return Object.entries(all)
        .map(([device, e]) => ({ device, ...e }))
        .sort((a, b) => b.at - a.at)
    } catch {
      return null
    }
  }

  /**
   * Load another device's (or this device's own) backup onto this device, replacing its
   * progress. The caller reloads the page afterwards. False if it could not be fetched.
   */
  async load(device: string): Promise<boolean> {
    if (!this.available || !this.code) return false
    try {
      const res = await this.fetchFn(`${this.base()}/data/${device}.json`, { cache: 'no-store' })
      if (!res.ok) return false
      const text = (await res.json()) as string | null
      if (!text) return false
      restoreSnapshot(JSON.parse(text) as Record<string, string>, this.store)
      return true
    } catch {
      return false
    }
  }
}
