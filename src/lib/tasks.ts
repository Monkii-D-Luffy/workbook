import { db, type Task, type Priority, type Recurrence } from '../db'
import { addDays, nextDueDate, todayISO } from './dates'

export type View = 'today' | 'upcoming' | 'all' | 'done'

export interface Filter {
  view: View
  areaId?: number
  tag?: string
  query?: string
}

export function newTask(partial: Partial<Task> & { title: string; areaId: number }): Task {
  const now = Date.now()
  return {
    notes: '',
    priority: 2,
    status: 'todo',
    tags: [],
    recurrence: 'none',
    extra: {},
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

/** Lower-case text used for search. Plain substring match works for Thai, which has no spaces between words. */
export function searchText(t: Task): string {
  return [t.title, t.notes, t.assignee ?? '', ...t.tags, ...Object.values(t.extra)].join(' ').toLowerCase()
}

export function matches(t: Task, f: Filter, today = todayISO()): boolean {
  if (f.areaId !== undefined && t.areaId !== f.areaId) return false
  if (f.tag && !t.tags.includes(f.tag)) return false
  if (f.query) {
    const terms = f.query.toLowerCase().split(/\s+/).filter(Boolean)
    const text = searchText(t)
    if (!terms.every((q) => text.includes(q))) return false
  }
  // A search looks across every view, done tasks included.
  if (f.query) return true
  switch (f.view) {
    case 'today':
      return t.status !== 'done' && !!t.dueDate && t.dueDate <= today
    case 'upcoming':
      return t.status !== 'done' && !!t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7)
    case 'all':
      return t.status !== 'done'
    case 'done':
      return t.status === 'done'
  }
}

export function compareTasks(a: Task, b: Task): number {
  if (a.status === 'done' && b.status === 'done') return (b.completedAt ?? 0) - (a.completedAt ?? 0)
  const ad = a.dueDate ?? '9999-12-31'
  const bd = b.dueDate ?? '9999-12-31'
  if (ad !== bd) return ad < bd ? -1 : 1
  if (a.priority !== b.priority) return a.priority - b.priority
  if ((a.dueTime ?? '') !== (b.dueTime ?? '')) return (a.dueTime ?? '99') < (b.dueTime ?? '99') ? -1 : 1
  return a.createdAt - b.createdAt
}

/**
 * Mark a task done. A repeating task also gets its next occurrence
 * created, so history stays as one row per completed occurrence.
 */
export async function completeTask(task: Task, now = Date.now(), today = todayISO()): Promise<number | undefined> {
  return db.transaction('rw', db.tasks, async () => {
    await db.tasks.update(task.id!, { status: 'done', completedAt: now, updatedAt: now })
    const next = nextDueDate(task.dueDate, task.recurrence, today)
    if (!next) return undefined
    const { id: _id, completedAt: _c, ...rest } = task
    return db.tasks.add({ ...rest, status: 'todo', dueDate: next, createdAt: now, updatedAt: now })
  })
}

export async function reopenTask(task: Task): Promise<void> {
  await db.tasks.update(task.id!, { status: 'todo', completedAt: undefined, updatedAt: Date.now() })
}

export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'P1 ด่วน', 2: 'P2 ปกติ', 3: 'P3 ไม่รีบ' }
export const RECURRENCES: Recurrence[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly']

export function parseTags(s: string): string[] {
  return [...new Set(s.split(/[,#]/).map((x) => x.trim()).filter(Boolean))]
}
