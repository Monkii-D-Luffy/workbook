import { db, type Area, type Meeting, type Task } from '../db'
import { addDays, parseISODate, toISODate, todayISO } from './dates'
import { completeTask, reopenTask } from './tasks'

export const DONE_COLUMN = '__done__'
/** Done tasks older than this drop off the board's done column. */
export const DONE_VISIBLE_DAYS = 14

export function stagesOf(area: Area): string[] {
  return area.stages?.length ? area.stages : ['ต้องทำ']
}

/** The column a task sits in. A stage that was renamed or removed falls back to the first column. */
export function columnOf(task: Task, area: Area): string {
  if (task.status === 'done') return DONE_COLUMN
  const stages = stagesOf(area)
  return task.stage && stages.includes(task.stage) ? task.stage : stages[0]
}

export function boardColumns(tasks: Task[], area: Area, now = Date.now()): Map<string, Task[]> {
  const cols = new Map<string, Task[]>([...stagesOf(area), DONE_COLUMN].map((s) => [s, []]))
  const cutoff = now - DONE_VISIBLE_DAYS * 86400000
  for (const t of tasks) {
    if (t.areaId !== area.id) continue
    if (t.status === 'done' && (t.completedAt ?? 0) < cutoff) continue
    cols.get(columnOf(t, area))!.push(t)
  }
  return cols
}

/** Move a card. Into done = complete (repeating tasks get their next round); out of done = reopen. */
export async function moveToColumn(task: Task, column: string): Promise<void> {
  if (column === DONE_COLUMN) {
    if (task.status !== 'done') await completeTask(task)
    return
  }
  if (task.status === 'done') await reopenTask(task)
  await db.tasks.update(task.id!, { stage: column, updatedAt: Date.now() })
}

/** Six Monday-first weeks covering the month of `monthISO` (any date in that month). */
export function monthGrid(monthISO: string): string[][] {
  const first = parseISODate(monthISO.slice(0, 8) + '01')
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const start = addDays(toISODate(first), -offset)
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
}

export function shiftMonth(monthISO: string, delta: number): string {
  const d = parseISODate(monthISO.slice(0, 8) + '01')
  return toISODate(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

export interface DayItems {
  tasks: Task[]
  meetings: Meeting[]
}

export function itemsByDay(tasks: Task[], meetings: Meeting[], areaId?: number): Map<string, DayItems> {
  const map = new Map<string, DayItems>()
  const get = (d: string) => map.get(d) ?? (map.set(d, { tasks: [], meetings: [] }), map.get(d)!)
  for (const t of tasks) if (t.dueDate && (areaId === undefined || t.areaId === areaId)) get(t.dueDate).tasks.push(t)
  for (const m of meetings) if (areaId === undefined || m.areaId === areaId) get(m.date).meetings.push(m)
  return map
}

export async function moveToDate(task: Task, date: string): Promise<void> {
  await db.tasks.update(task.id!, { dueDate: date, updatedAt: Date.now() })
}

export const isToday = (d: string) => d === todayISO()

/** Totals and rates for the Content Tracker. Missing numbers count as 0. */
export function contentStats(tasks: Task[]) {
  const n = (t: Task, k: string) => Number(t.extra[k]) || 0
  const views = tasks.reduce((s, t) => s + n(t, 'views'), 0)
  const clicks = tasks.reduce((s, t) => s + n(t, 'clicks'), 0)
  const orders = tasks.reduce((s, t) => s + n(t, 'orders'), 0)
  const commission = tasks.reduce((s, t) => s + n(t, 'commission'), 0)
  return { views, clicks, orders, commission, ctr: rate(clicks, views), conversion: rate(orders, clicks) }
}

export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}
