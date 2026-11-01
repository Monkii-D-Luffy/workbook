import { describe, expect, it } from 'vitest'
import { formatDue, nextDueDate } from './dates'

describe('nextDueDate', () => {
  it('returns nothing for a one-off task', () => {
    expect(nextDueDate('2026-11-02', 'none', '2026-11-02')).toBeUndefined()
  })
  it('keeps a weekly schedule when completed on time', () => {
    expect(nextDueDate('2026-11-02', 'weekly', '2026-11-02')).toBe('2026-11-09')
  })
  it('keeps the schedule when completed early', () => {
    expect(nextDueDate('2026-11-09', 'weekly', '2026-11-05')).toBe('2026-11-16')
  })
  it('skips past occurrences when completed late', () => {
    // Weekly Monday PM finished 2.5 weeks late: next is the coming Monday, not an overdue one.
    expect(nextDueDate('2026-11-02', 'weekly', '2026-11-19')).toBe('2026-11-23')
  })
  it('skips weekends for weekday tasks', () => {
    expect(nextDueDate('2026-11-06', 'weekdays', '2026-11-06')).toBe('2026-11-09') // Fri -> Mon
  })
  it('clamps monthly tasks to the end of short months and returns to the anchor day', () => {
    expect(nextDueDate('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28')
    expect(nextDueDate('2026-01-31', 'monthly', '2026-03-01')).toBe('2026-03-31')
  })
  it('starts from today when the task has no due date', () => {
    expect(nextDueDate(undefined, 'daily', '2026-11-01')).toBe('2026-11-02')
  })
})

describe('formatDue', () => {
  it('uses relative words near today', () => {
    expect(formatDue('2026-11-01', '2026-11-01')).toBe('วันนี้')
    expect(formatDue('2026-11-02', '2026-11-01')).toBe('พรุ่งนี้')
    expect(formatDue('2026-10-31', '2026-11-01')).toBe('เมื่อวาน')
  })
  it('shows a Thai short date otherwise, with the Buddhist year in another year', () => {
    expect(formatDue('2026-11-05', '2026-11-01')).toBe('พฤ. 5 พ.ย.')
    expect(formatDue('2027-01-04', '2026-11-01')).toBe('จ. 4 ม.ค. 2570')
  })
})
