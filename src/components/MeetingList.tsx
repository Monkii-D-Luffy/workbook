import { useMemo, useState } from 'react'
import { MEETING_TYPES, type Area, type Meeting, type MeetingTemplate, type MeetingType, type Task } from '../db'
import { formatDue, todayISO } from '../lib/dates'
import { allDecisions, meetingTypeInfo } from '../lib/meetings'

interface Props {
  meetings: Meeting[]
  templates: MeetingTemplate[]
  areaById: Map<number, Area>
  openItemsByMeeting: Map<number, Task[]>
  query?: string
  onOpen: (id: number) => void
  onCreate: (tpl?: MeetingTemplate) => void
}

export function TypeBadge({ type }: { type?: MeetingType }) {
  const info = meetingTypeInfo(type)
  return (
    <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${info.color}1a`, color: info.color }}>
      {info.label}
    </span>
  )
}

export function MeetingList({ meetings, templates, areaById, openItemsByMeeting, query, onOpen, onCreate }: Props) {
  const [picking, setPicking] = useState(false)
  const [tab, setTab] = useState<'meetings' | 'decisions'>('meetings')
  const [type, setType] = useState<MeetingType | undefined>()
  const today = todayISO()
  const usedTypes = useMemo(() => new Set(meetings.map((m) => m.type ?? 'general')), [meetings])
  const shown = type ? meetings.filter((m) => (m.type ?? 'general') === type) : meetings
  const decisions = useMemo(() => allDecisions(meetings, query, type), [meetings, query, type])
  const chip = (active: boolean) => `rounded-full px-2.5 py-0.5 text-xs ${active ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`

  return (
    <div className="flex flex-col gap-4">
      {picking ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">เลือกประเภทการประชุม</div>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onCreate(t)}
                className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400"
              >
                <span className="flex items-center gap-2 font-medium">
                  <TypeBadge type={t.type} />
                  {t.name}
                </span>
                <span className="truncate text-xs text-slate-500">{t.sections.map((s) => s.heading).join(' · ')}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPicking(false)} className="mt-2 text-xs text-slate-500 hover:underline">ยกเลิก</button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="w-full rounded-md border border-dashed border-slate-300 bg-white py-2 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-700"
        >
          + บันทึกประชุมใหม่
        </button>
      )}

      <div className="flex items-center gap-4 border-b border-slate-200 text-sm">
        {(['meetings', 'decisions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-1 pb-2 ${tab === t ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t === 'meetings' ? 'การประชุม' : 'Decision Log'}
          </button>
        ))}
      </div>

      {usedTypes.size > 1 && (
        <div className="flex flex-wrap gap-1.5" aria-label="กรองประเภทประชุม">
          <button className={chip(!type)} onClick={() => setType(undefined)}>ทุกประเภท</button>
          {MEETING_TYPES.filter((t) => usedTypes.has(t.type)).map((t) => (
            <button key={t.type} className={chip(type === t.type)} onClick={() => setType(type === t.type ? undefined : t.type)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'meetings' ? (
        <>
          <ul className="flex flex-col gap-2">
            {shown.map((m) => {
              const area = areaById.get(m.areaId)
              const open = openItemsByMeeting.get(m.id!) ?? []
              return (
                <li key={m.id}>
                  <button
                    onClick={() => onOpen(m.id!)}
                    className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <TypeBadge type={m.type} />
                      <span className="truncate">{m.title}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{formatDue(m.date, today)}{m.time && ` ${m.time}`}</span>
                      {area && (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: area.color }} />
                          {area.name}
                        </span>
                      )}
                      {m.attendees.length > 0 && <span>{m.attendees.length} คน</span>}
                      {m.seriesId && <span>↻ ต่อเนื่อง</span>}
                      {(m.decisions?.length ?? 0) > 0 && <span>มติ {m.decisions!.length}</span>}
                      {open.length > 0 && <span className="font-semibold text-amber-700">Action Item ค้าง {open.length}</span>}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {shown.length === 0 && <p className="py-12 text-center text-sm text-slate-500">ยังไม่มีบันทึกประชุม</p>}
        </>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {decisions.map((d) => (
              <li key={`${d.meeting.id}-${d.id}`} className="flex items-start gap-3 px-4 py-2.5">
                <span className="w-20 shrink-0 pt-0.5 text-xs text-slate-500">{formatDue(d.meeting.date, today)}</span>
                <span className="flex-1 text-sm">{d.text}</span>
                <button onClick={() => onOpen(d.meeting.id!)} className="flex max-w-56 shrink-0 items-center gap-1.5 text-xs text-slate-500 hover:text-blue-700">
                  <TypeBadge type={d.meeting.type} />
                  <span className="truncate">{d.meeting.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {decisions.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">ยังไม่มีการตัดสินใจที่บันทึกไว้ เพิ่มได้ในหัวข้อ "มติ / การตัดสินใจ" ของแต่ละประชุม</p>
          )}
        </>
      )}
    </div>
  )
}
