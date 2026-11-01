import { db, type Area, type Task } from '../db'

export interface Backup {
  app: 'workbook'
  version: 1
  exportedAt: string
  areas: Area[]
  tasks: Task[]
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'workbook',
    version: 1,
    exportedAt: new Date().toISOString(),
    areas: await db.areas.toArray(),
    tasks: await db.tasks.toArray(),
  }
}

export function validateBackup(data: unknown): Backup {
  const b = data as Backup
  if (!b || b.app !== 'workbook' || b.version !== 1 || !Array.isArray(b.areas) || !Array.isArray(b.tasks)) {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Workbook')
  }
  return b
}

/** Replace everything in the database with the backup's contents. */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', db.areas, db.tasks, async () => {
    await db.tasks.clear()
    await db.areas.clear()
    await db.areas.bulkAdd(b.areas)
    await db.tasks.bulkAdd(b.tasks)
  })
}

const LAST_BACKUP_KEY = 'workbook.lastBackupAt'

export function getLastBackupAt(): number | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function setLastBackupAt(t = Date.now()): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(t))
  } catch {
    /* storage unavailable: the reminder just keeps showing */
  }
}

export async function downloadBackup(): Promise<void> {
  const data = await exportBackup()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workbook-backup-${data.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  setLastBackupAt()
}
