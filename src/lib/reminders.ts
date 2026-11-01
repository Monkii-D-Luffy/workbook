import type { Task } from '../db'
import { parseISODate, toISODate } from './dates'

export interface ReminderSettings {
  enabled: boolean
  /** Minutes before the due time to remind; 0 = at the due time */
  leadMinutes: number
  morningEnabled: boolean
  /** HH:MM */
  morningTime: string
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  leadMinutes: 15,
  morningEnabled: true,
  morningTime: '07:30',
}

/** Missed reminders older than this are dropped instead of all firing when the app opens. */
export const CATCH_UP_MS = 12 * 3600 * 1000

export function dueAt(t: Task): Date | null {
  if (!t.dueDate || !t.dueTime) return null
  const d = parseISODate(t.dueDate)
  const [h, m] = t.dueTime.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

/** Identifies one reminder, so a task moved to a new time reminds again. */
export function reminderKey(t: Task, leadMinutes: number): string {
  return `${t.id}@${t.dueDate}T${t.dueTime}-${leadMinutes}`
}

export interface DueReminder {
  key: string
  task: Task
  at: Date
}

/** Timed reminders that are due now and not yet shown. */
export function dueReminders(tasks: Task[], now: Date, leadMinutes: number, shown: Set<string>): DueReminder[] {
  const out: DueReminder[] = []
  for (const t of tasks) {
    if (t.status === 'done') continue
    const due = dueAt(t)
    if (!due) continue
    const at = new Date(due.getTime() - leadMinutes * 60000)
    const key = reminderKey(t, leadMinutes)
    if (at <= now && now.getTime() - at.getTime() <= CATCH_UP_MS && !shown.has(key)) out.push({ key, task: t, at })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

export function reminderText(r: DueReminder, now: Date): { title: string; body: string } {
  const due = dueAt(r.task)!
  const mins = Math.round((due.getTime() - now.getTime()) / 60000)
  const when = mins > 0 ? `อีก ${mins} นาที (${r.task.dueTime})` : mins === 0 ? `ตอนนี้ (${r.task.dueTime})` : `เลยกำหนดมา ${-mins} นาที`
  return { title: r.task.title, body: `${r.task.priority === 1 ? 'P1 · ' : ''}ครบกำหนด${when}` }
}

/** The morning summary, once per day at or after the chosen time. */
export function morningSummary(
  tasks: Task[],
  now: Date,
  settings: ReminderSettings,
  lastShownDate: string | null,
): { date: string; title: string; body: string } | null {
  if (!settings.enabled || !settings.morningEnabled) return null
  const today = toISODate(now)
  if (lastShownDate === today) return null
  const [h, m] = settings.morningTime.split(':').map(Number)
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return null
  const open = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate <= today)
  const overdue = open.filter((t) => t.dueDate! < today).length
  const dueToday = open.length - overdue
  const p1 = open.filter((t) => t.priority === 1).length
  if (open.length === 0) return { date: today, title: 'สรุปงานวันนี้', body: 'ไม่มีงานครบกำหนดวันนี้' }
  const parts = [`วันนี้ ${dueToday} งาน`]
  if (overdue) parts.push(`เกินกำหนด ${overdue} งาน`)
  if (p1) parts.push(`P1 ${p1} งาน`)
  return { date: today, title: 'สรุปงานวันนี้', body: parts.join(' · ') }
}

const SETTINGS_KEY = 'workbook.reminders'
const SHOWN_KEY = 'workbook.remindersShown'
const MORNING_KEY = 'workbook.morningShown'

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

export const loadReminderSettings = () => ({ ...DEFAULT_REMINDER_SETTINGS, ...read<Partial<ReminderSettings>>(SETTINGS_KEY, {}) })
export const saveReminderSettings = (s: ReminderSettings) => write(SETTINGS_KEY, s)
export const loadShown = () => new Set(read<string[]>(SHOWN_KEY, []))
/** Keep the shown list short; old keys can never match again once their time has passed. */
export const saveShown = (s: Set<string>) => write(SHOWN_KEY, [...s].slice(-300))
export const loadMorningShown = () => read<string | null>(MORNING_KEY, null)
export const saveMorningShown = (date: string) => write(MORNING_KEY, date)

export async function notify(title: string, body: string, tag?: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png' }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return await reg.showNotification(title, options)
  } catch {
    /* fall back to a page notification */
  }
  new Notification(title, options)
}
