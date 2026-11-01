import { describe, expect, it } from 'vitest'
import { newTask } from './tasks'
import { DEFAULT_REMINDER_SETTINGS, dueReminders, morningSummary, reminderKey, reminderText } from './reminders'
import { filesToPrune } from './autobackup'

const at = (s: string) => new Date(s) // local time
const task = (over = {}) => ({ ...newTask({ title: 'PM ปั๊มลม', areaId: 1, dueDate: '2026-11-02', dueTime: '09:00' }), id: 7, ...over })

describe('dueReminders', () => {
  it('fires at due time minus the lead time, once', () => {
    const t = task()
    expect(dueReminders([t], at('2026-11-02T08:44:00'), 15, new Set())).toHaveLength(0)
    const due = dueReminders([t], at('2026-11-02T08:45:00'), 15, new Set())
    expect(due).toHaveLength(1)
    expect(dueReminders([t], at('2026-11-02T08:46:00'), 15, new Set([due[0].key]))).toHaveLength(0)
  })
  it('catches up on a reminder missed while the app was closed, but not a stale one', () => {
    expect(dueReminders([task()], at('2026-11-02T13:00:00'), 0, new Set())).toHaveLength(1)
    expect(dueReminders([task()], at('2026-11-03T09:00:01'), 0, new Set())).toHaveLength(0)
  })
  it('skips done tasks and tasks without a time', () => {
    const now = at('2026-11-02T09:00:00')
    expect(dueReminders([task({ status: 'done' }), task({ dueTime: undefined })], now, 0, new Set())).toHaveLength(0)
  })
  it('reminds again when the task is moved to a new time', () => {
    expect(reminderKey(task(), 15)).not.toBe(reminderKey(task({ dueTime: '10:00' }), 15))
  })
  it('writes a Thai message with time left', () => {
    const [r] = dueReminders([task({ priority: 1 })], at('2026-11-02T08:45:00'), 15, new Set())
    expect(reminderText(r, at('2026-11-02T08:45:00'))).toEqual({ title: 'PM ปั๊มลม', body: 'P1 · ครบกำหนดอีก 15 นาที (09:00)' })
  })
})

describe('morningSummary', () => {
  const on = { ...DEFAULT_REMINDER_SETTINGS, enabled: true }
  const tasks = [
    task({ dueDate: '2026-11-02', priority: 1 }),
    task({ id: 8, dueDate: '2026-10-30' }),
    task({ id: 9, dueDate: '2026-11-05' }),
  ]
  it('waits for the morning time and shows once a day', () => {
    expect(morningSummary(tasks, at('2026-11-02T07:29:00'), on, null)).toBeNull()
    const s = morningSummary(tasks, at('2026-11-02T07:30:00'), on, null)
    expect(s).toEqual({ date: '2026-11-02', title: 'สรุปงานวันนี้', body: 'วันนี้ 1 งาน · เกินกำหนด 1 งาน · P1 1 งาน' })
    expect(morningSummary(tasks, at('2026-11-02T10:00:00'), on, '2026-11-02')).toBeNull()
  })
  it('stays quiet when turned off', () => {
    expect(morningSummary(tasks, at('2026-11-02T08:00:00'), DEFAULT_REMINDER_SETTINGS, null)).toBeNull()
    expect(morningSummary(tasks, at('2026-11-02T08:00:00'), { ...on, morningEnabled: false }, null)).toBeNull()
  })
})

describe('filesToPrune', () => {
  it('keeps the newest dated files and never touches other files', () => {
    const names = ['workbook-latest.json', 'notes.txt', 'workbook-2026-10-30.json', 'workbook-2026-11-01.json', 'workbook-2026-10-31.json']
    expect(filesToPrune(names, 2)).toEqual(['workbook-2026-10-30.json'])
    expect(filesToPrune(names, 30)).toEqual([])
  })
})
