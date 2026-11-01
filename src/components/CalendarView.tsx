import { useMemo, useState } from 'react'
import type { Area, Meeting, Task } from '../db'
import { itemsByDay, monthGrid, moveToDate, shiftMonth } from '../lib/board'
import { todayISO } from '../lib/dates'
import { compareTasks } from '../lib/tasks'

const DAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.']
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const MAX_PER_DAY = 4

interface Props {
  tasks: Task[]
  meetings: Meeting[]
  areaId?: number
  areaById: Map<number, Area>
  onOpenTask: (t: Task) => void
  onOpenMeeting: (id: number) => void
  onAdd: (date: string) => void
}

export function CalendarView({ tasks, meetings, areaId, areaById, onOpenTask, onOpenMeeting, onAdd }: Props) {
  const today = todayISO()
  const [month, setMonth] = useState(today)
  const [over, setOver] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const grid = useMemo(() => monthGrid(month), [month])
  const byDay = useMemo(() => itemsByDay(tasks, meetings, areaId), [tasks, meetings, areaId])
  const m = Number(month.slice(5, 7))
  const title = `${MONTHS[m - 1]} ${Number(month.slice(0, 4)) + 543}`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="เดือนก่อน" className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-white">‹</button>
        <button onClick={() => setMonth(today)} className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-white">วันนี้</button>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="เดือนถัดไป" className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-white">›</button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-xs [gap:1px]">
        {DAYS.map((d) => (
          <div key={d} className="bg-slate-50 px-2 py-1 text-center font-semibold text-slate-600">{d}</div>
        ))}
        {grid.flat().map((d) => {
          const items = byDay.get(d)
          const inMonth = d.slice(5, 7) === month.slice(5, 7)
          const list = [...(items?.tasks ?? [])].sort(compareTasks)
          const showAll = expanded === d
          const shown = showAll ? list : list.slice(0, MAX_PER_DAY - (items?.meetings.length ?? 0))
          return (
            <div
              key={d}
              data-date={d}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(d)
              }}
              onDragLeave={() => setOver((o) => (o === d ? null : o))}
              onDrop={async (e) => {
                e.preventDefault()
                setOver(null)
                const t = tasks.find((x) => x.id === Number(e.dataTransfer.getData('text/plain')))
                if (t) await moveToDate(t, d)
              }}
              onDoubleClick={(e) => e.target === e.currentTarget && onAdd(d)}
              className={`group flex min-h-24 flex-col gap-0.5 p-1 ${over === d ? 'bg-blue-50' : inMonth ? 'bg-white' : 'bg-slate-50'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`px-1 ${d === today ? 'rounded-full bg-blue-600 font-semibold text-white' : inMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                  {Number(d.slice(8))}
                </span>
                <button onClick={() => onAdd(d)} aria-label={`เพิ่มงานวันที่ ${d}`} className="invisible rounded px-1 text-slate-400 hover:bg-slate-100 group-hover:visible focus:visible">+</button>
              </div>
              {items?.meetings.map((mt) => (
                <button key={`m${mt.id}`} onClick={() => onOpenMeeting(mt.id!)} className="truncate rounded bg-amber-100 px-1 text-left text-amber-900 hover:bg-amber-200">
                  {mt.time && `${mt.time} `}{mt.title}
                </button>
              ))}
              {shown.map((t) => {
                const color = areaById.get(t.areaId)?.color ?? '#94a3b8'
                const done = t.status === 'done'
                return (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                    onClick={() => onOpenTask(t)}
                    title={t.title}
                    className={`flex items-center gap-1 truncate rounded px-1 text-left hover:bg-slate-100 ${done ? 'text-slate-400 line-through' : t.dueDate! < today ? 'text-red-700' : 'text-slate-800'}`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="truncate">{t.dueTime && `${t.dueTime} `}{t.priority === 1 && !done ? '❗' : ''}{t.title}</span>
                  </button>
                )
              })}
              {list.length > shown.length && (
                <button onClick={() => setExpanded(d)} className="px-1 text-left text-slate-500 hover:underline">
                  +{list.length - shown.length} งาน
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-slate-500">ลากงานไปวางวันอื่นเพื่อเลื่อนกำหนด · กด + หรือดับเบิลคลิกช่องว่างเพื่อเพิ่มงาน · แถบสีเหลือง = บันทึกประชุม</p>
    </div>
  )
}
