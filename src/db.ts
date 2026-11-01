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

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
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
  /** Sub-steps, e.g. the steps of a PM job */
  checklist?: ChecklistItem[]
  /** Who does it, by name (people from meetings need no account) */
  assignee?: string
  /** Set when the task came from a meeting action item */
  meetingId?: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface MeetingSection {
  heading: string
  /** Hint shown in the empty box */
  hint?: string
  body: string
}

export interface MeetingTemplate {
  id?: number
  name: string
  areaName?: string
  sections: Omit<MeetingSection, 'body'>[]
  order: number
}

export interface Meeting {
  id?: number
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  time?: string
  areaId: number
  templateId?: number
  attendees: string[]
  sections: MeetingSection[]
  createdAt: number
  updatedAt: number
}

export class WorkbookDB extends Dexie {
  tasks!: Table<Task, number>
  areas!: Table<Area, number>
  meetings!: Table<Meeting, number>
  templates!: Table<MeetingTemplate, number>
  /** Small key-value store for things that must live in IndexedDB, such as the backup folder handle */
  kv!: Table<{ key: string; value: unknown }, string>

  constructor(name = 'workbook') {
    super(name)
    this.version(1).stores({
      tasks: '++id, status, dueDate, areaId, priority, *tags, meetingId, completedAt',
      areas: '++id, order',
    })
    this.version(2)
      .stores({
        meetings: '++id, date, areaId, templateId',
        templates: '++id, order',
      })
      .upgrade((tx) => tx.table('templates').bulkAdd(DEFAULT_TEMPLATES))
    this.version(3).stores({ kv: 'key' })
    this.on('populate', (tx) => {
      tx.table('areas').bulkAdd(DEFAULT_AREAS)
      tx.table('templates').bulkAdd(DEFAULT_TEMPLATES)
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

export const DEFAULT_TEMPLATES: MeetingTemplate[] = [
  {
    name: 'Daily Maintenance Meeting',
    areaName: 'ซ่อมบำรุง',
    order: 1,
    sections: [
      { heading: 'Breakdown 24 ชม. ที่ผ่านมา', hint: 'เครื่อง / อาการ / Downtime (นาที) / สถานะ' },
      { heading: 'งานค้างจากเมื่อวาน' },
      { heading: 'งาน PM วันนี้' },
      { heading: 'อะไหล่และปัญหาที่ต้องตาม' },
      { heading: 'อื่นๆ' },
    ],
  },
  {
    name: 'Breakdown Review (5 WHY)',
    areaName: 'ซ่อมบำรุง',
    order: 2,
    sections: [
      { heading: 'ปรากฏการณ์', hint: 'เครื่อง, เวลาเกิด, อาการที่เห็น' },
      { heading: 'ผลกระทบ', hint: 'Downtime (นาที), ของเสีย, ความปลอดภัย' },
      { heading: '5 WHY', hint: 'Why 1:\nWhy 2:\nWhy 3:\nWhy 4:\nWhy 5:' },
      { heading: 'Root Cause (6M)', hint: 'Man / Machine / Method / Material / Measurement / Mother Nature' },
      { heading: 'Corrective Action', hint: 'แก้ทันทีให้เครื่องกลับมาเดิน' },
      { heading: 'Preventive Action', hint: 'ป้องกันไม่ให้เกิดซ้ำ: ปรับ PM, Standard, Training' },
    ],
  },
  {
    name: 'Weekly PM Review',
    areaName: 'ซ่อมบำรุง',
    order: 3,
    sections: [
      { heading: 'PM Compliance', hint: 'แผน __ งาน / ทำจริง __ งาน = __%' },
      { heading: 'KPI สัปดาห์นี้', hint: 'MTBF / MTTR / Availability / OEE' },
      { heading: 'ปัญหาซ้ำ (Bad Actor)' },
      { heading: 'งานค้าง' },
      { heading: 'แผนสัปดาห์หน้า' },
    ],
  },
  {
    name: 'Content Planning',
    areaName: 'คอนเทนต์',
    order: 4,
    sections: [
      { heading: 'สินค้า / เป้าหมาย', hint: 'สินค้า, ค่าคอม, กลุ่มเป้าหมาย' },
      { heading: 'Hook 3 วินาทีแรก', hint: 'ไอเดีย Hook อย่างน้อย 3 แบบ' },
      { heading: 'โครงสคริปต์', hint: 'Pain → Solution → CTA, แบ่งซีน' },
      { heading: 'ตารางโพสต์' },
      { heading: 'ผลลัพธ์รอบก่อน', hint: 'Views / CTR / Conversion' },
    ],
  },
  {
    name: 'ประชุมทั่วไป',
    order: 5,
    sections: [{ heading: 'วาระ' }, { heading: 'สรุปการหารือ' }, { heading: 'มติ' }],
  },
]

export const db = new WorkbookDB()
