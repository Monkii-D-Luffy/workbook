import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, DEFAULT_AREAS, DEFAULT_TEMPLATES, WorkbookDB } from '../db'
import { addActionItem, allDecisions, carriedActionItems, compareMeetings, createNextMeeting, deleteMeeting, meetingFromTemplate, meetingMatches, seriesOf } from './meetings'
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

describe('meeting types and series', () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.meetings.clear()])
  })
  const monthly = { ...DEFAULT_TEMPLATES.find((t) => t.type === 'monthlyKpi')!, id: 6 }
  const audit = { ...DEFAULT_TEMPLATES.find((t) => t.type === 'audit')!, id: 7 }

  it('ships a template for every meeting type', () => {
    const types = new Set(DEFAULT_TEMPLATES.map((t) => t.type))
    expect(types.size).toBe(12)
  })
  it('creates the next meeting with the same headings and people, and links the series', async () => {
    const first = { ...meetingFromTemplate(monthly, areas, 3, 1000, '2026-10-31'), attendees: ['หัวหน้าฝ่ายผลิต'] }
    first.sections[0].body = 'OEE 78%'
    const id = await db.meetings.add(first)
    const nextId = await createNextMeeting((await db.meetings.get(id))!)
    const [a, b] = [(await db.meetings.get(id))!, (await db.meetings.get(nextId))!]
    expect(a.seriesId).toBeTruthy()
    expect(b.seriesId).toBe(a.seriesId)
    expect(b.type).toBe('monthlyKpi')
    expect(b.title).toMatch(/^Monthly KPI Review \d{4}-\d{2}-\d{2}$/)
    expect(b.attendees).toEqual(['หัวหน้าฝ่ายผลิต'])
    expect(b.sections[0]).toMatchObject({ heading: 'OEE', body: '' })
  })
  it('carries open action items from earlier meetings in the series only', async () => {
    const id1 = await db.meetings.add({ ...meetingFromTemplate(monthly, areas, 3, 1000, '2026-10-01'), seriesId: 's1' })
    const id2 = await db.meetings.add({ ...meetingFromTemplate(monthly, areas, 3, 1000, '2026-11-01'), seriesId: 's1' })
    const other = await db.meetings.add(meetingFromTemplate(monthly, areas, 3, 1000, '2026-10-15'))
    const m1 = (await db.meetings.get(id1))!
    await addActionItem(m1, { title: 'ลด MTTR ไลน์ 2' })
    const doneId = await addActionItem(m1, { title: 'เสร็จแล้ว' })
    await db.tasks.update(doneId, { status: 'done' })
    await addActionItem((await db.meetings.get(other))!, { title: 'ไม่ใช่ series นี้' })
    await addActionItem((await db.meetings.get(id2))!, { title: 'ของครั้งนี้เอง' })
    const all = await db.meetings.toArray()
    const carried = carriedActionItems((await db.meetings.get(id2))!, all, await db.tasks.toArray())
    expect(carried.map((c) => c.task.title)).toEqual(['ลด MTTR ไลน์ 2'])
    expect(carried[0].from.id).toBe(id1)
    expect(seriesOf((await db.meetings.get(id2))!, all).map((m) => m.id)).toEqual([id1, id2])
  })
  it('tags audit action items so findings are easy to track', async () => {
    const id = await db.meetings.add(meetingFromTemplate(audit, areas, 3))
    const taskId = await addActionItem((await db.meetings.get(id))!, { title: 'ปิด Finding ข้อ 3' })
    expect((await db.tasks.get(taskId))!.tags).toEqual(['audit'])
  })
  it('lists decisions newest first and filters them by text and type', () => {
    const a = { ...meetingFromTemplate(monthly, areas, 3, 1, '2026-10-01'), id: 1, decisions: [{ id: 'd1', text: 'อนุมัติงบเปลี่ยนปั๊ม' }] }
    const b = { ...meetingFromTemplate(audit, areas, 3, 1, '2026-11-01'), id: 2, decisions: [{ id: 'd2', text: 'ปิด Finding ภายใน 30 วัน' }] }
    expect(allDecisions([a, b]).map((d) => d.id)).toEqual(['d2', 'd1'])
    expect(allDecisions([a, b], 'ปั๊ม').map((d) => d.id)).toEqual(['d1'])
    expect(allDecisions([a, b], undefined, 'audit').map((d) => d.id)).toEqual(['d2'])
    expect(meetingMatches(a, 'อนุมัติงบ')).toBe(true)
    expect(meetingMatches(a, undefined, undefined, 'audit')).toBe(false)
  })
})

describe('upgrade to version 5', () => {
  it('types existing templates and meetings and adds the new templates once', async () => {
    const old = new Dexie('v4-test')
    old.version(4).stores({
      tasks: '++id, status, dueDate, areaId, priority, *tags, meetingId, completedAt',
      areas: '++id, order',
      meetings: '++id, date, areaId, templateId',
      templates: '++id, order',
      kv: 'key',
    })
    const legacy = DEFAULT_TEMPLATES.filter((t) => ['daily', 'breakdown', 'weeklyPm', 'content', 'general'].includes(t.type!)).map(({ type: _t, ...rest }) => rest)
    const ids = await old.table('templates').bulkAdd(legacy, { allKeys: true })
    await old.table('meetings').add({ title: 'เก่า', date: '2026-10-01', areaId: 1, templateId: ids[1], attendees: [], sections: [], createdAt: 0, updatedAt: 0 })
    old.close()
    const upgraded = new WorkbookDB('v4-test')
    const templates = await upgraded.templates.toArray()
    expect(templates).toHaveLength(12)
    expect(templates.every((t) => t.type)).toBe(true)
    expect((await upgraded.meetings.toArray())[0].type).toBe('breakdown')
    upgraded.close()
  })
})
