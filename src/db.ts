import Dexie, { type Table } from 'dexie'

export type Priority = 1 | 2 | 3
export type Status = 'todo' | 'doing' | 'done'
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface AreaField {
  key: string
  label: string
  type: 'text' | 'url' | 'date'
}

export interface Area {
  id?: number
  name: string
  color: string
  fields: AreaField[]
  order: number
}

export interface Task {
  id?: number
  title: string
  notes: string
  /** YYYY-MM-DD, local date */
  dueDate?: string
  /** HH:MM, local time */
  dueTime?: string
  priority: Priority
  status: Status
  areaId: number
  tags: string[]
  recurrence: Recurrence
  /** Area-specific fields, keyed by AreaField.key */
  extra: Record<string, string>
  /** Set when the task came from a meeting action item (phase 2) */
  meetingId?: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export class WorkbookDB extends Dexie {
  tasks!: Table<Task, number>
  areas!: Table<Area, number>

  constructor(name = 'workbook') {
    super(name)
    this.version(1).stores({
      tasks: '++id, status, dueDate, areaId, priority, *tags, meetingId, completedAt',
      areas: '++id, order',
    })
    this.on('populate', (tx) => {
      tx.table('areas').bulkAdd(DEFAULT_AREAS)
    })
  }
}

export const DEFAULT_AREAS: Area[] = [
  {
    name: 'ซ่อมบำรุง',
    color: '#ea580c',
    order: 1,
    fields: [
      { key: 'machine', label: 'เครื่องจักร', type: 'text' },
      { key: 'woNo', label: 'เลข Work Order', type: 'text' },
      { key: 'jobType', label: 'ประเภทงาน (PM / CM / BD)', type: 'text' },
    ],
  },
  {
    name: 'คอนเทนต์',
    color: '#db2777',
    order: 2,
    fields: [
      { key: 'platform', label: 'แพลตฟอร์ม', type: 'text' },
      { key: 'productUrl', label: 'ลิงก์สินค้า', type: 'url' },
      { key: 'postDate', label: 'วันโพสต์', type: 'date' },
    ],
  },
  { name: 'ส่วนตัว', color: '#16a34a', order: 3, fields: [] },
]

export const db = new WorkbookDB()
