import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { compareTasks, completeTask, matches, newTask, parseTags } from './tasks'

const T = '2026-11-01'

describe('matches', () => {
  const pump = newTask({ title: 'เปลี่ยนซีลปั๊ม 3', areaId: 1, dueDate: '2026-10-30', tags: ['ปั๊ม'], extra: { woNo: 'WO-2611-015' } })
  it('shows overdue and due-today tasks in Today', () => {
    expect(matches(pump, { view: 'today' }, T)).toBe(true)
    expect(matches({ ...pump, dueDate: '2026-11-02' }, { view: 'today' }, T)).toBe(false)
  })
  it('shows the next 7 days in Upcoming', () => {
    expect(matches({ ...pump, dueDate: '2026-11-08' }, { view: 'upcoming' }, T)).toBe(true)
    expect(matches({ ...pump, dueDate: '2026-11-09' }, { view: 'upcoming' }, T)).toBe(false)
  })
  it('finds Thai words inside unspaced text, tags and extra fields', () => {
    expect(matches(pump, { view: 'all', query: 'ซีล' }, T)).toBe(true)
    expect(matches(pump, { view: 'all', query: 'wo-2611' }, T)).toBe(true)
    expect(matches(pump, { view: 'all', query: 'ปั๊ม มอเตอร์' }, T)).toBe(false)
  })
  it('searches done tasks too', () => {
    expect(matches({ ...pump, status: 'done' }, { view: 'today', query: 'ซีล' }, T)).toBe(true)
  })
  it('filters by area and tag', () => {
    expect(matches(pump, { view: 'all', areaId: 2 }, T)).toBe(false)
    expect(matches(pump, { view: 'all', tag: 'ไลน์3' }, T)).toBe(false)
  })
})

describe('compareTasks', () => {
  it('orders by due date, then priority', () => {
    const a = newTask({ title: 'a', areaId: 1, dueDate: '2026-11-02', priority: 3 })
    const b = newTask({ title: 'b', areaId: 1, dueDate: '2026-11-02', priority: 1 })
    const c = newTask({ title: 'c', areaId: 1, dueDate: '2026-11-01', priority: 3 })
    const d = newTask({ title: 'd', areaId: 1 })
    expect([a, b, c, d].sort(compareTasks).map((t) => t.title)).toEqual(['c', 'b', 'a', 'd'])
  })
})

describe('completeTask', () => {
  beforeEach(async () => {
    await db.tasks.clear()
  })
  it('marks a one-off task done without creating another', async () => {
    const id = await db.tasks.add(newTask({ title: 'ส่งรายงาน', areaId: 1, dueDate: T }))
    await completeTask((await db.tasks.get(id))!, 1000, T)
    expect((await db.tasks.get(id))!.status).toBe('done')
    expect(await db.tasks.count()).toBe(1)
  })
  it('creates the next occurrence of a repeating task', async () => {
    const id = await db.tasks.add(newTask({ title: 'PM ปั๊มลม', areaId: 1, dueDate: '2026-11-02', recurrence: 'weekly', tags: ['PM'] }))
    const nextId = await completeTask((await db.tasks.get(id))!, 1000, '2026-11-02')
    const next = (await db.tasks.get(nextId!))!
    expect(next).toMatchObject({ title: 'PM ปั๊มลม', status: 'todo', dueDate: '2026-11-09', recurrence: 'weekly', tags: ['PM'] })
    expect(next.completedAt).toBeUndefined()
  })
})

describe('parseTags', () => {
  it('splits on commas and #, trims and de-duplicates', () => {
    expect(parseTags('ปั๊ม, #ไลน์3,ปั๊ม , ')).toEqual(['ปั๊ม', 'ไลน์3'])
  })
})
