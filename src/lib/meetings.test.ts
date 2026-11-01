import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, DEFAULT_AREAS, DEFAULT_TEMPLATES, WorkbookDB } from '../db'
import { addActionItem, compareMeetings, deleteMeeting, meetingFromTemplate, meetingMatches } from './meetings'
import { exportBackup, restoreBackup, validateBackup } from './backup'

const areas = DEFAULT_AREAS.map((a, i) => ({ ...a, id: i + 1 }))
const daily = { ...DEFAULT_TEMPLATES[0], id: 1 }

describe('meetingFromTemplate', () => {
  it('copies the template sections and picks the template area', () => {
    const m = meetingFromTemplate(daily, areas, 3, 1000, '2026-11-02')
    expect(m.title).toBe('Daily Maintenance Meeting 2026-11-02')
    expect(m.areaId).toBe(1)
    expect(m.sections.map((s) => s.heading)).toEqual(daily.sections.map((s) => s.heading))
    expect(m.sections.every((s) => s.body === '')).toBe(true)
  })
  it('falls back to a blank note in the current area', () => {
    const m = meetingFromTemplate(undefined, areas, 3, 1000, '2026-11-02')
    expect(m.areaId).toBe(3)
    expect(m.sections).toHaveLength(1)
  })
})

describe('meetingMatches / compareMeetings', () => {
  const m = { ...meetingFromTemplate(daily, areas, 3, 1000, '2026-11-02'), attendees: ['สมชาย'] }
  m.sections[0].body = 'ปั๊มน้ำหล่อเย็นรั่ว Downtime 45 นาที'
  it('searches title, attendees and section text', () => {
    expect(meetingMatches(m, 'หล่อเย็น')).toBe(true)
    expect(meetingMatches(m, 'สมชาย daily')).toBe(true)
    expect(meetingMatches(m, 'คอมเพรสเซอร์')).toBe(false)
    expect(meetingMatches(m, undefined, 2)).toBe(false)
  })
  it('lists newest meetings first', () => {
    const older = { ...m, date: '2026-11-01' }
    expect([older, m].sort(compareMeetings)[0].date).toBe('2026-11-02')
  })
})

describe('action items', () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.meetings.clear()])
  })
  it('become tasks linked to the meeting, in its area', async () => {
    const id = await db.meetings.add(meetingFromTemplate(daily, areas, 3))
    const meeting = (await db.meetings.get(id))!
    const taskId = await addActionItem(meeting, { title: ' สั่งซีลปั๊ม ', assignee: 'สมชาย', dueDate: '2026-11-05', priority: 1 })
    expect(await db.tasks.get(taskId)).toMatchObject({ title: 'สั่งซีลปั๊ม', assignee: 'สมชาย', meetingId: id, areaId: 1, priority: 1, status: 'todo' })
  })
  it('stay as tasks when their meeting is deleted', async () => {
    const id = await db.meetings.add(meetingFromTemplate(daily, areas, 3))
    const taskId = await addActionItem((await db.meetings.get(id))!, { title: 'ตามอะไหล่' })
    await deleteMeeting(id)
    expect(await db.meetings.get(id)).toBeUndefined()
    const task = (await db.tasks.get(taskId))!
    expect(task.title).toBe('ตามอะไหล่')
    expect(task.meetingId).toBeUndefined()
  })
})

describe('backup', () => {
  it('round-trips meetings and templates', async () => {
    await db.meetings.clear()
    await db.meetings.add(meetingFromTemplate(daily, areas, 3))
    const b = validateBackup(JSON.parse(JSON.stringify(await exportBackup())))
    await db.meetings.clear()
    await restoreBackup(b)
    expect(await db.meetings.count()).toBe(1)
    expect(await db.templates.count()).toBe(DEFAULT_TEMPLATES.length)
  })
  it('still restores a version 1 file and adds the default templates', async () => {
    await restoreBackup(validateBackup({ app: 'workbook', version: 1, exportedAt: '', areas, tasks: [] }))
    expect(await db.meetings.count()).toBe(0)
    expect(await db.templates.count()).toBe(DEFAULT_TEMPLATES.length)
  })
})

describe('upgrade from version 1', () => {
  it('keeps existing tasks and adds the meeting templates', async () => {
    const old = new Dexie('upgrade-test')
    old.version(1).stores({ tasks: '++id, status, dueDate, areaId, priority, *tags, meetingId, completedAt', areas: '++id, order' })
    await old.table('tasks').add({ title: 'งานเก่า', status: 'todo', tags: [] })
    old.close()
    const upgraded = new WorkbookDB('upgrade-test')
    expect(await upgraded.tasks.count()).toBe(1)
    expect(await upgraded.templates.count()).toBe(DEFAULT_TEMPLATES.length)
    upgraded.close()
  })
})
