import type { Recurrence } from '../db'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(now = new Date()): string {
  return toISODate(now)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

function addMonthClamped(iso: string, anchorDay: number): string {
  const d = parseISODate(iso)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const lastDay = new Date(y, m + 1, 0).getDate()
  return toISODate(new Date(y, m, Math.min(anchorDay, lastDay)))
}

/** One step of a recurrence rule from a given date. */
export function stepRecurrence(iso: string, rule: Recurrence, anchorDay: number): string {
  switch (rule) {
    case 'daily':
      return addDays(iso, 1)
    case 'weekdays': {
      let next = addDays(iso, 1)
      while ([0, 6].includes(parseISODate(next).getDay())) next = addDays(next, 1)
      return next
    }
    case 'weekly':
      return addDays(iso, 7)
    case 'monthly':
      return addMonthClamped(iso, anchorDay)
    default:
      return iso
  }
}

/**
 * Next due date for a repeating task that was just completed.
 * Keeps the original schedule (e.g. PM every Monday) and skips any
 * occurrences already in the past, so a late completion never creates
 * a task that is overdue on arrival.
 */
export function nextDueDate(dueDate: string | undefined, rule: Recurrence, today = todayISO()): string | undefined {
  if (rule === 'none') return undefined
  const start = dueDate ?? today
  const anchorDay = parseISODate(start).getDate()
  let next = stepRecurrence(start, rule, anchorDay)
  while (next <= today) next = stepRecurrence(next, rule, anchorDay)
  return next
}

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** Short Thai label: "วันนี้", "พรุ่งนี้", "เมื่อวาน", or "จ. 3 พ.ย." */
export function formatDue(iso: string, today = todayISO()): string {
  if (iso === today) return 'วันนี้'
  if (iso === addDays(today, 1)) return 'พรุ่งนี้'
  if (iso === addDays(today, -1)) return 'เมื่อวาน'
  const d = parseISODate(iso)
  const sameYear = d.getFullYear() === parseISODate(today).getFullYear()
  const base = `${TH_DAYS[d.getDay()]} ${d.getDate()} ${TH_MONTHS[d.getMonth()]}`
  return sameYear ? base : `${base} ${d.getFullYear() + 543}`
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'ไม่ซ้ำ',
  daily: 'ทุกวัน',
  weekdays: 'ทุกวันทำงาน (จ.–ศ.)',
  weekly: 'ทุกสัปดาห์',
  monthly: 'ทุกเดือน',
}
