import { useState } from 'react'
import type { Area, Meeting, MeetingTemplate, Task } from '../db'
import { formatDue, todayISO } from '../lib/dates'

interface Props {
  meetings: Meeting[]
  templates: MeetingTemplate[]
  areaById: Map<number, Area>
  openItemsByMeeting: Map<number, Task[]>
  onOpen: (id: number) => void
  onCreate: (tpl?: MeetingTemplate) => void
}

export function MeetingList({ meetings, templates, areaById, openItemsByMeeting, onOpen, onCreate }: Props) {
  const [picking, setPicking] = useState(false)
  const today = todayISO()
  return (
    <div className="flex flex-col gap-4">
      {picking ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">เลือกเทมเพลต</div>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onCreate(t)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400"
              >
                <div className="font-medium">{t.name}</div>
                <div className="truncate text-xs text-slate-500">{t.sections.map((s) => s.heading).join(' · ')}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setPicking(false)} className="mt-2 text-xs text-slate-500 hover:underline">
            ยกเลิก
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="w-full rounded-md border border-dashed border-slate-300 bg-white py-2 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-700"
        >
          + บันทึกประชุมใหม่
        </button>
      )}
      <ul className="flex flex-col gap-2">
        {meetings.map((m) => {
          const area = areaById.get(m.areaId)
          const open = openItemsByMeeting.get(m.id!) ?? []
          return (
            <li key={m.id}>
              <button
                onClick={() => onOpen(m.id!)}
                className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300"
              >
                <div className="text-sm font-medium">{m.title}</div>
                <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span>{formatDue(m.date, today)}{m.time && ` ${m.time}`}</span>
                  {area && (
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: area.color }} />
                      {area.name}
                    </span>
                  )}
                  {m.attendees.length > 0 && <span>{m.attendees.length} คน</span>}
                  {open.length > 0 && <span className="font-semibold text-amber-700">Action Item ค้าง {open.length}</span>}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {meetings.length === 0 && <p className="py-12 text-center text-sm text-slate-500">ยังไม่มีบันทึกประชุม</p>}
    </div>
  )
}
