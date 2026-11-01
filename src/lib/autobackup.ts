import { db } from '../db'
import { exportBackup, setLastBackupAt } from './backup'
import { todayISO } from './dates'

/** Dated backup files kept in the folder; older ones are deleted. */
export const KEEP_DAILY = 30
const HANDLE_KEY = 'backupDir'
export const LATEST_NAME = 'workbook-latest.json'
const DAILY = /^workbook-(\d{4}-\d{2}-\d{2})\.json$/

export const dailyName = (date = todayISO()) => `workbook-${date}.json`

/** Dated backup files beyond the newest `keep`. */
export function filesToPrune(names: string[], keep = KEEP_DAILY): string[] {
  return names
    .filter((n) => DAILY.test(n))
    .sort()
    .reverse()
    .slice(keep)
}

// The File System Access API is in Edge and Chrome but not yet in TypeScript's DOM types.
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
  values(): AsyncIterable<FileSystemHandle>
}

export const folderBackupSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function getBackupFolder(): Promise<DirHandle | undefined> {
  return (await db.kv.get(HANDLE_KEY))?.value as DirHandle | undefined
}

export async function chooseBackupFolder(): Promise<DirHandle> {
  const pick = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker
  const dir = await pick({ id: 'workbook-backup', mode: 'readwrite' })
  await db.kv.put({ key: HANDLE_KEY, value: dir })
  return dir
}

export async function forgetBackupFolder(): Promise<void> {
  await db.kv.delete(HANDLE_KEY)
}

/** 'granted' | 'prompt' (needs a click to allow again) | 'none' (no folder chosen) */
export async function backupFolderState(): Promise<'granted' | 'prompt' | 'denied' | 'none'> {
  const dir = await getBackupFolder()
  if (!dir) return 'none'
  try {
    return await dir.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'prompt'
  }
}

/** Must be called from a click. */
export async function regrantBackupFolder(): Promise<boolean> {
  const dir = await getBackupFolder()
  return !!dir && (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'
}

async function writeFile(dir: DirHandle, name: string, text: string) {
  const file = await dir.getFileHandle(name, { create: true })
  const w = await file.createWritable()
  await w.write(text)
  await w.close()
}

/** Write latest + today's file, then prune. Returns false when there is no usable folder. */
export async function backupToFolder(): Promise<boolean> {
  const dir = await getBackupFolder()
  if (!dir || (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') return false
  const text = JSON.stringify(await exportBackup(), null, 2)
  await writeFile(dir, LATEST_NAME, text)
  await writeFile(dir, dailyName(), text)
  const names: string[] = []
  for await (const h of dir.values()) if (h.kind === 'file') names.push(h.name)
  for (const n of filesToPrune(names)) await dir.removeEntry(n)
  setLastBackupAt()
  return true
}
