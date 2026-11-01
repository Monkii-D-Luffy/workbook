import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, DEFAULT_AREAS, WorkbookDB } from '../db'
import { newTask } from './tasks'
import { boardColumns, columnOf, contentStats, DONE_COLUMN, itemsByDay, monthGrid, moveToColumn, shiftMonth } from './board'

const maint = { ...DEFAULT_AREAS[0], id: 1 }

describe('board columns', () => {
  it('puts a task without a stage, or with a removed stage, in the first column', () => {
    expect(columnOf(newTask({ title: 'a', areaId: 1 }), maint)).toBe('รอดำเนินการ')
    expect(columnOf(newTask({ title: 'a', areaId: 1, stage: 'ไม่มีแล้ว' }), maint)).toBe('รอดำเนินการ')
    expect(columnOf(newTask({ title: 'a', areaId: 1, stage: 'รออะไหล่' }), maint)).toBe('รออะไหล่')
    expect(columnOf(newTask({ title: 'a', areaId: 1, stage: 'รออะไหล่', status: 'done' }), maint)).toBe(DONE_COLUMN)
  })
  it('shows only this area and hides tasks finished more than 14 days ago', () => {
    const now = Date.parse('2026-11-20T00:00:00Z')
    const cols = boardColumns(
      [
        newTask({ title: 'mine', areaId: 1 }),
        newTask({ title: 'other area', areaId: 2 }),
        newTask({ title: 'recent', areaId: 1, status: 'done', completedAt: now - 3 * 86400000 }),
        newTask({ title: 'old', areaId: 1, status: 'done', completedAt: now - 20 * 86400000 }),
      ],
      maint,
      now,
    )
    expect([...cols.keys()]).toEqual([...maint.stages!, DONE_COLUMN])
    expect(cols.get('รอดำเนินการ')!.map((t) => t.title)).toEqual(['mine'])
    expect(cols.get(DONE_COLUMN)!.map((t) => t.title)).toEqual(['recent'])
  })
})

describe('moveToColumn', () => {
  beforeEach(async () => {
    await db.tasks.clear()
  })
  it('completes a task dropped on done and creates the next round of a repeating one', async () => {
    const id = await db.tasks.add(newTask({ title: 'PM', areaId: 1, dueDate: '2026-11-02', recurrence: 'weekly', stage: 'กำลังทำ' }))
    await moveToColumn((await db.tasks.get(id))!, DONE_COLUMN)
    expect((await db.tasks.get(id))!.status).toBe('done')
    expect(await db.tasks.count()).toBe(2)
  })
  it('reopens a done task dragged back and sets its stage', async () => {
    const id = await db.tasks.add(newTask({ title: 'x', areaId: 1, status: 'done', completedAt: 1 }))
    await moveToColumn((await db.tasks.get(id))!, 'รออะไหล่')
    expect(await db.tasks.get(id)).toMatchObject({ status: 'todo', stage: 'รออะไหล่' })
  })
})

describe('calendar helpers', () => {
  it('builds six Monday-first weeks around the month', () => {
    const g = monthGrid('2026-11-15')
    expect(g).toHaveLength(6)
    expect(g[0][0]).toBe('2026-10-26') // Monday before Sun 1 Nov 2026
    expect(g[0][6]).toBe('2026-11-01')
    expect(g.flat()).toContain('2026-11-30')
  })
  it('moves between months across the year end', () => {
    expect(shiftMonth('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01')
  })
  it('groups tasks and meetings by day, filtered by area', () => {
    const m = { title: 'Daily', date: '2026-11-02', areaId: 1, attendees: [], sections: [], createdAt: 0, updatedAt: 0, id: 1 }
    const map = itemsByDay([newTask({ title: 'a', areaId: 1, dueDate: '2026-11-02' }), newTask({ title: 'b', areaId: 2, dueDate: '2026-11-02' })], [m], 1)
    expect(map.get('2026-11-02')!.tasks.map((t) => t.title)).toEqual(['a'])
    expect(map.get('2026-11-02')!.meetings).toHaveLength(1)
  })
})

describe('contentStats', () => {
  it('sums numbers and computes CTR and conversion, ignoring blanks', () => {
    const s = contentStats([
      newTask({ title: 'a', areaId: 2, extra: { views: '1000', clicks: '50', orders: '5', commission: '120' } }),
      newTask({ title: 'b', areaId: 2, extra: { views: '3000', clicks: '', orders: 'x' } }),
    ])
    expect(s).toMatchObject({ views: 4000, clicks: 50, orders: 5, commission: 120, ctr: 50 / 4000, conversion: 0.1 })
    expect(contentStats([]).ctr).toBeNull()
  })
})

describe('upgrade to version 4', () => {
  it('adds board stages, kinds and tracker fields to existing areas', async () => {
    const old = new Dexie('v3-test')
    old.version(3).stores({
      tasks: '++id, status, dueDate, areaId, priority, *tags, meetingId, completedAt',
      areas: '++id, order',
      meetings: '++id, date, areaId, templateId',
      templates: '++id, order',
      kv: 'key',
    })
    await old.table('areas').bulkAdd([
      { name: 'คอนเทนต์', color: '#db2777', order: 2, fields: [{ key: 'platform', label: 'แพลตฟอร์ม', type: 'text' }] },
      { name: 'งานบ้าน', color: '#000', order: 4, fields: [] },
    ])
    old.close()
    const upgraded = new WorkbookDB('v3-test')
    const [content, home] = await upgraded.areas.orderBy('order').toArray()
    expect(content.kind).toBe('content')
    expect(content.stages).toContain('ตัดต่อ')
    expect(content.fields.map((f) => f.key)).toEqual(['platform', 'postUrl', 'views', 'clicks', 'orders', 'commission'])
    expect(home.stages).toEqual(['ต้องทำ', 'กำลังทำ'])
    upgraded.close()
  })
})
