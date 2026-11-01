import Dexie, { type Table } from 'dexie'

export type Priority = 1 | 2 | 3
export type Status = 'todo' | 'doing' | 'done'
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface AreaField {
  key: string
  label: string
  type: 'text' | 'url' | 'date' | 'number'
  /** Shown only in the Content Tracker table, not in the task editor */
  trackerOnly?: boolean
}

export interface Area {
  id?: number
  name: string
  color: string
  fields: AreaField[]
  /** Board columns before "เสร็จ" */
  stages?: string[]
  kind?: 'maintenance' | 'content' | 'personal'
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
  /** Board column within the area's stages; missing = the first stage */
  stage?: string
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

export type MeetingType =
  | 'daily'
  | 'breakdown'
  | 'weeklyPm'
  | 'monthlyKpi'
  | 'audit'
  | 'oneOnOneBoss'
  | 'oneOnOneTeam'
  | 'toolbox'
  | 'vendor'
  | 'project'
  | 'content'
  | 'general'

export const MEETING_TYPES: { type: MeetingType; label: string; color: string; actionTag?: string }[] = [
  { type: 'daily', label: 'Daily', color: '#0ea5e9' },
  { type: 'breakdown', label: 'Breakdown Review', color: '#dc2626', actionTag: 'breakdown' },
  { type: 'weeklyPm', label: 'Weekly PM', color: '#ea580c' },
  { type: 'monthlyKpi', label: 'Monthly KPI', color: '#7c3aed' },
  { type: 'audit', label: 'Audit', color: '#b45309', actionTag: 'audit' },
  { type: 'oneOnOneBoss', label: '1:1 หัวหน้า', color: '#0f766e' },
  { type: 'oneOnOneTeam', label: '1:1 ลูกทีม', color: '#15803d' },
  { type: 'toolbox', label: 'Safety Talk', color: '#ca8a04' },
  { type: 'vendor', label: 'Vendor', color: '#475569' },
  { type: 'project', label: 'Project', color: '#2563eb' },
  { type: 'content', label: 'Content', color: '#db2777' },
  { type: 'general', label: 'ทั่วไป', color: '#64748b' },
]

export interface Decision {
  id: string
  text: string
}

export interface MeetingTemplate {
  id?: number
  type?: MeetingType
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
  type?: MeetingType
  /** Shared by every meeting in a recurring series (monthly review, 1:1s) */
  seriesId?: string
  decisions?: Decision[]
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
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('areas')
          .toCollection()
          .modify((a: Area) => upgradeArea(a)),
      )
    this.version(5)
      .stores({ meetings: '++id, date, areaId, templateId, type, seriesId' })
      .upgrade(async (tx) => {
        const templates = tx.table('templates')
        await templates.toCollection().modify((t: MeetingTemplate) => {
          t.type ??= DEFAULT_TEMPLATES.find((d) => d.name === t.name)?.type ?? 'general'
        })
        const have = new Set((await templates.toArray()).map((t: MeetingTemplate) => t.type))
        await templates.bulkAdd(DEFAULT_TEMPLATES.filter((d) => !have.has(d.type)))
        const typeById = new Map((await templates.toArray()).map((t: MeetingTemplate) => [t.id, t.type]))
        await tx
          .table('meetings')
          .toCollection()
          .modify((m: Meeting) => {
            m.type ??= (m.templateId && typeById.get(m.templateId)) || 'general'
          })
      })
    this.on('populate', (tx) => {
      tx.table('areas').bulkAdd(DEFAULT_AREAS)
      tx.table('templates').bulkAdd(DEFAULT_TEMPLATES)
    })
  }
}

export const CONTENT_STAGES = ['ไอเดีย', 'เขียนสคริปต์', 'ถ่าย', 'ตัดต่อ', 'รอโพสต์']
export const CONTENT_TRACKER_FIELDS: AreaField[] = [
  { key: 'postUrl', label: 'ลิงก์โพสต์', type: 'url', trackerOnly: true },
  { key: 'views', label: 'วิว', type: 'number', trackerOnly: true },
  { key: 'clicks', label: 'คลิก', type: 'number', trackerOnly: true },
  { key: 'orders', label: 'ยอดขาย (ชิ้น)', type: 'number', trackerOnly: true },
  { key: 'commission', label: 'ค่าคอม (บาท)', type: 'number', trackerOnly: true },
]

export const DEFAULT_AREAS: Area[] = [
  {
    name: 'ซ่อมบำรุง',
    color: '#ea580c',
    kind: 'maintenance',
    stages: ['รอดำเนินการ', 'รออะไหล่', 'กำลังทำ', 'รอตรวจรับ'],
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
    kind: 'content',
    stages: CONTENT_STAGES,
    order: 2,
    fields: [
      { key: 'platform', label: 'แพลตฟอร์ม', type: 'text' },
      { key: 'productUrl', label: 'ลิงก์สินค้า', type: 'url' },
      { key: 'postDate', label: 'วันโพสต์', type: 'date' },
      ...CONTENT_TRACKER_FIELDS,
    ],
  },
  { name: 'ส่วนตัว', color: '#16a34a', kind: 'personal', stages: ['ต้องทำ', 'กำลังทำ'], order: 3, fields: [] },
]

/** Fill in board stages, kind and tracker fields on areas made before version 4. */
export function upgradeArea(a: Area): void {
  const def = DEFAULT_AREAS.find((d) => d.name === a.name)
  a.kind ??= def?.kind
  a.stages ??= def?.stages ?? ['ต้องทำ', 'กำลังทำ']
  if (a.kind === 'content') {
    for (const f of CONTENT_TRACKER_FIELDS) if (!a.fields.some((x) => x.key === f.key)) a.fields.push(f)
  }
}

export const DEFAULT_TEMPLATES: MeetingTemplate[] = [
  {
    type: 'daily',
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
    type: 'breakdown',
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
    type: 'weeklyPm',
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
    type: 'content',
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
    type: 'general',
    name: 'ประชุมทั่วไป',
    order: 5,
    sections: [{ heading: 'วาระ' }, { heading: 'สรุปการหารือ' }],
  },
  {
    type: 'monthlyKpi',
    name: 'Monthly KPI Review',
    areaName: 'ซ่อมบำรุง',
    order: 6,
    sections: [
      { heading: 'OEE', hint: 'เป้า __% / จริง __% (Availability × Performance × Quality)' },
      { heading: 'MTBF / MTTR', hint: 'MTBF __ ชม. (เดือนก่อน __) / MTTR __ นาที (เดือนก่อน __)' },
      { heading: 'PM Compliance', hint: 'แผน __ งาน / ทำจริง __ งาน = __%' },
      { heading: 'Breakdown Top 5 (Pareto)', hint: 'เครื่อง / จำนวนครั้ง / Downtime รวม' },
      { heading: 'งบซ่อมบำรุงและอะไหล่ vs แผน' },
      { heading: 'ปัญหาสำคัญ / Bad Actor' },
      { heading: 'แผนเดือนหน้า' },
    ],
  },
  {
    type: 'audit',
    name: 'Audit',
    areaName: 'ซ่อมบำรุง',
    order: 7,
    sections: [
      { heading: 'ประเภท Audit / มาตรฐาน', hint: 'ISO 9001 / IATF 16949 / ISO 14001 / ภายใน / ลูกค้า' },
      { heading: 'ขอบเขตและพื้นที่' },
      { heading: 'Findings', hint: '1. [Major / Minor / OFI] ข้อกำหนด ... · หลักฐาน ...' },
      { heading: 'Root Cause' },
      { heading: 'Corrective Action', hint: 'ใส่แต่ละข้อเป็น Action Item ด้านล่าง เพื่อติดตามจนปิด' },
    ],
  },
  {
    type: 'oneOnOneBoss',
    name: '1:1 กับหัวหน้า',
    areaName: 'ซ่อมบำรุง',
    order: 8,
    sections: [
      { heading: 'อัปเดตสั้น', hint: '3 เรื่องหลักตั้งแต่ครั้งก่อน' },
      { heading: 'เรื่องที่ต้องให้ตัดสินใจ' },
      { heading: 'Escalation / ความเสี่ยง' },
      { heading: 'ขออนุมัติ', hint: 'งบ / คน / อะไหล่ / OT' },
      { heading: 'สิ่งที่หัวหน้ามอบหมาย' },
    ],
  },
  {
    type: 'oneOnOneTeam',
    name: '1:1 กับลูกทีม',
    areaName: 'ซ่อมบำรุง',
    order: 9,
    sections: [
      { heading: 'งานที่ทำไปและงานค้าง' },
      { heading: 'ปัญหา / อุปสรรค' },
      { heading: 'ทักษะที่ต้องพัฒนา' },
      { heading: 'Feedback ทั้งสองทาง' },
    ],
  },
  {
    type: 'toolbox',
    name: 'Toolbox / Safety Talk',
    areaName: 'ซ่อมบำรุง',
    order: 10,
    sections: [
      { heading: 'หัวข้อความปลอดภัย', hint: 'เช่น LOTO, งานที่สูง, Hot work' },
      { heading: 'Near miss / อุบัติเหตุที่ผ่านมา' },
      { heading: 'ข้อควรปฏิบัติ' },
      { heading: 'คำถามจากทีม' },
    ],
  },
  {
    type: 'vendor',
    name: 'ประชุม Vendor / ผู้รับเหมา',
    areaName: 'ซ่อมบำรุง',
    order: 11,
    sections: [
      { heading: 'บริษัท / ผู้ติดต่อ' },
      { heading: 'ขอบเขตงาน' },
      { heading: 'ราคา / ใบเสนอราคา' },
      { heading: 'กำหนดส่งมอบ' },
      { heading: 'ความปลอดภัย / Permit' },
      { heading: 'ข้อตกลง' },
    ],
  },
  {
    type: 'project',
    name: 'Project Kickoff / Review',
    areaName: 'ซ่อมบำรุง',
    order: 12,
    sections: [
      { heading: 'เป้าหมาย / ตัวชี้วัดความสำเร็จ' },
      { heading: 'ขอบเขต', hint: 'ทำ / ไม่ทำ' },
      { heading: 'ทีมและหน้าที่' },
      { heading: 'Timeline / Milestone' },
      { heading: 'ความเสี่ยง' },
      { heading: 'งบประมาณ' },
    ],
  },
]

export const db = new WorkbookDB()
