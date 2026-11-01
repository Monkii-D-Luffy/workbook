import { useMemo, useState } from 'react'
import type { Area, Task } from '../db'
import { boardColumns, DONE_COLUMN, DONE_VISIBLE_DAYS, moveToColumn } from '../lib/board'
import { formatDue, todayISO } from '../lib/dates'
import { compareTasks } from '../lib/tasks'

interface Props {
  tasks: Task[]
  area: Area
  onOpen: (t: Task) => void
  onAdd: (stage: string) => void
}

export function Board({ tasks, area, onOpen, onAdd }: Props) {
  const cols = useMemo(() => boardColumns(tasks, area), [tasks, area])
  const [over, setOver] = useState<string | null>(null)
  const today = todayISO()

  return (
    <div className="grid auto-cols-[minmax(10.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-4">
      {[...cols.entries()].map(([col, list]) => {
        const done = col === DONE_COLUMN
        return (
          <section
            key={col}
            aria-label={`คอลัมน์ ${done ? 'เสร็จ' : col}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(col)
            }}
            onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={async (e) => {
              e.preventDefault()
              setOver(null)
              const id = Number(e.dataTransfer.getData('text/plain'))
              const t = tasks.find((x) => x.id === id)
              if (t) await moveToColumn(t, col)
            }}
            className={`flex min-w-0 flex-col gap-2 rounded-lg p-2 ${over === col ? 'bg-blue-100' : done ? 'bg-green-50' : 'bg-slate-100'}`}
          >
            <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
              <span>{done ? 'เสร็จ' : col}</span>
              <span className="text-xs font-normal text-slate-500">{list.length}</span>
            </h2>
            {[...list].sort(compareTasks).map((t) => {
              const overdue = !done && t.dueDate && t.dueDate < today
              const checks = t.checklist ?? []
              return (
                <button
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                  onClick={() => onOpen(t)}
                  className={`flex cursor-grab flex-col gap-1 rounded-md border bg-white p-2 text-left shadow-sm hover:border-slate-400 ${
                    t.priority === 1 && !done ? 'border-l-4 border-l-red-500' : 'border-slate-200'
                  }`}
                >
                  <span className={`text-sm ${done ? 'text-slate-400 line-through' : ''}`}>{t.title}</span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                    {t.dueDate && <span className={overdue ? 'font-semibold text-red-600' : ''}>{formatDue(t.dueDate, today)}</span>}
                    {checks.length > 0 && <span>☑ {checks.filter((c) => c.done).length}/{checks.length}</span>}
                    {t.assignee && <span>@{t.assignee}</span>}
                    {Object.entries(t.extra)
                      .filter(([k]) => ['machine', 'woNo', 'platform'].includes(k))
                      .map(([k, v]) => (
                        <span key={k} className="rounded bg-slate-100 px-1">{v}</span>
                      ))}
                  </span>
                </button>
              )
            })}
            {!done && (
              <button onClick={() => onAdd(col)} className="rounded-md px-2 py-1 text-left text-xs text-slate-500 hover:bg-white">
                + เพิ่มการ์ด
              </button>
            )}
            {done && <p className="px-1 text-[11px] text-slate-400">แสดงงานที่เสร็จใน {DONE_VISIBLE_DAYS} วันล่าสุด</p>}
          </section>
        )
      })}
    </div>
  )
}
