import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Area, type Decision, type Meeting, type Priority, type Task } from '../db'
import { addActionItem, carriedActionItems, createNextMeeting, deleteMeeting, seriesOf } from '../lib/meetings'
import { formatDue } from '../lib/dates'
import { newChecklistId } from '../lib/tasks'
import { TypeBadge } from './MeetingList'
import { compareTasks, PRIORITY_LABEL } from '../lib/tasks'
import { TaskItem } from './TaskItem'

interface Props {
  meetingId: number
  areas: Area[]
  people: string[]
  meetings: Meeting[]
  tasks: Task[]
  onOpenMeeting: (id: number) => void
  onBack: () => void
  onOpenTask: (t: Task) => void
}

export function MeetingEditor({ meetingId, areas, people, meetings, tasks, onOpenMeeting, onBack, onOpenTask }: Props) {
  const stored = useLiveQuery(() => db.meetings.get(meetingId), [meetingId])
  const items = useLiveQuery(() => db.tasks.where('meetingId').equals(meetingId).toArray(), [meetingId], [] as Task[])
  const [draft, setDraft] = useState<Meeting | null>(null)
  const [saved, setSaved] = useState(true)
  const firstLoad = useRef(true)

  // Load once; after that the draft is the source of truth and autosaves.
  useEffect(() => {
    if (stored && firstLoad.current) {
      firstLoad.current = false
      setDraft(stored)
    }
  }, [stored])

  useEffect(() => {
    if (!draft || saved) return
    const t = setTimeout(async () => {
      await persist(draft)
      setSaved(true)
    }, 400)
    return () => clearTimeout(t)
  }, [draft, saved])

  // Leaving the page before the autosave fires must not lose the last keystrokes.
  const pending = useRef<Meeting | null>(null)
  pending.current = saved ? null : draft
  useEffect(
    () => () => {
      if (pending.current) persist(pending.current)
    },
    [],
  )

  if (stored === undefined && !draft) return <p className="p-6 text-sm text-slate-500">กำลังโหลด…</p>
  if (!draft) return <p className="p-6 text-sm text-slate-500">ไม่พบบันทึกนี้</p>

  const set = (patch: Partial<Meeting>) => {
    setDraft({ ...draft, ...patch })
    setSaved(false)
  }
  const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600'
  // Series links read the stored copy so a seriesId set by "next meeting" shows at once.
  const current = { ...draft, seriesId: stored?.seriesId ?? draft.seriesId }
  const series = seriesOf(current, meetings.map((m) => (m.id === meetingId ? current : m)))
  const pos = series.findIndex((m) => m.id === meetingId)
  const prev = pos > 0 ? series[pos - 1] : undefined
  const next = pos >= 0 && pos < series.length - 1 ? series[pos + 1] : undefined
  const carried = carriedActionItems(current, meetings, tasks)

  async function goNext() {
    if (!saved) {
      await persist(draft!)
      setSaved(true)
    }
    const id = await createNextMeeting({ ...current, id: meetingId })
    onOpenMeeting(id)
  }

  async function remove() {
    const n = items.length
    if (!confirm(`ลบบันทึก "${draft!.title}"?${n ? ` Action Item ${n} งานจะยังอยู่ในรายการ To-do` : ''}`)) return
    await deleteMeeting(meetingId)
    onBack()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 text-sm">
        <button onClick={onBack} className="text-blue-700 hover:underline">← บันทึกประชุมทั้งหมด</button>
        <TypeBadge type={draft.type} />
        <span className="flex-1 text-right text-xs text-slate-400">{saved ? 'บันทึกแล้ว' : 'กำลังบันทึก…'}</span>
        <button onClick={remove} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50">ลบบันทึกนี้</button>
      </div>
      <input
        aria-label="ชื่อการประชุม"
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
        className="border-transparent bg-transparent px-0 text-xl font-bold focus:border-transparent focus:ring-0"
      />
      <div className="grid grid-cols-3 gap-3">
        <label className={label}>
          วันที่
          <input type="date" value={draft.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </label>
        <label className={label}>
          เวลา
          <input type="time" value={draft.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })} />
        </label>
        <label className={label}>
          พื้นที่งาน
          <select value={draft.areaId} onChange={(e) => set({ areaId: Number(e.target.value) })}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
        {series.length > 1 && <span className="text-xs text-slate-500">ครั้งที่ {pos + 1} จาก {series.length}</span>}
        {prev && (
          <button onClick={() => onOpenMeeting(prev.id!)} className="text-blue-700 hover:underline">
            ‹ ครั้งก่อน ({formatDue(prev.date)})
          </button>
        )}
        {next && (
          <button onClick={() => onOpenMeeting(next.id!)} className="text-blue-700 hover:underline">
            ครั้งถัดไป ({formatDue(next.date)}) ›
          </button>
        )}
        <span className="flex-1" />
        <button onClick={goNext} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50">
          + สร้างครั้งถัดไป
        </button>
      </div>
      {carried.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50/40 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">Action Item ค้างจากครั้งก่อน ({carried.length})</h2>
          <p className="mb-2 text-xs text-slate-500">ไล่ถามความคืบหน้าในประชุมนี้ กดวงกลมเมื่อเสร็จ</p>
          <ul className="flex flex-col gap-2">
            {carried.map(({ task, from }) => (
              <TaskItem
                key={task.id}
                task={task}
                area={areas.find((a) => a.id === task.areaId)}
                onOpen={() => onOpenTask(task)}
                meetingTitle={formatDue(from.date)}
                onOpenMeeting={() => onOpenMeeting(from.id!)}
              />
            ))}
          </ul>
        </section>
      )}
      <Attendees value={draft.attendees} people={people} onChange={(attendees) => set({ attendees })} />
      {draft.sections.map((s, i) => (
        <label key={i} className={label}>
          <span className="text-sm font-semibold text-slate-800">{s.heading}</span>
          <textarea
            rows={Math.max(3, s.body.split('\n').length + 1)}
            placeholder={s.hint}
            value={s.body}
            onChange={(e) => set({ sections: draft.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })}
            className="text-sm font-normal text-slate-900"
          />
        </label>
      ))}
      <Decisions value={draft.decisions ?? []} onChange={(decisions) => set({ decisions })} />
      <ActionItems
        items={[...items].sort(compareTasks)}
        people={[...new Set([...draft.attendees, ...people])]}
        onAdd={(item) => addActionItem({ ...draft, id: meetingId }, item)}
        onOpenTask={onOpenTask}
        areas={areas}
      />
    </div>
  )
}

/** Save only what the editor changes, so fields set elsewhere (the series link) are never overwritten. */
function persist(m: Meeting) {
  const { title, date, time, areaId, attendees, sections, decisions } = m
  return db.meetings.update(m.id!, { title, date, time, areaId, attendees, sections, decisions, updatedAt: Date.now() })
}

function Decisions({ value, onChange }: { value: Decision[]; onChange: (v: Decision[]) => void }) {
  const [text, setText] = useState('')
  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">มติ / การตัดสินใจ</h2>
      <p className="mb-2 text-xs text-slate-500">ทุกข้อจะไปรวมใน Decision Log ค้นย้อนหลังได้ว่าตกลงหรืออนุมัติอะไรเมื่อไหร่</p>
      <ul className="mb-2 flex flex-col gap-1.5">
        {value.map((d, i) => (
          <li key={d.id} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs text-slate-400">{i + 1}.</span>
            <input
              aria-label={`มติข้อ ${i + 1}`}
              value={d.text}
              onChange={(e) => onChange(value.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x)))}
              className="flex-1 py-1"
            />
            <button aria-label={`ลบมติข้อ ${i + 1}`} onClick={() => onChange(value.filter((x) => x.id !== d.id))} className="px-1 text-slate-400 hover:text-red-600">
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        aria-label="เพิ่มมติ"
        placeholder="+ เช่น อนุมัติงบเปลี่ยนปั๊ม CW-02 80,000 บาท แล้วกด Enter"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (text.trim()) onChange([...value, { id: newChecklistId(), text: text.trim() }])
            setText('')
          }
        }}
        className="w-full py-1"
      />
    </section>
  )
}

function Attendees({ value, people, onChange }: { value: string[]; people: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('')
  const add = () => {
    const names = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (names.length) onChange([...new Set([...value, ...names])])
    setText('')
  }
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      ผู้เข้าร่วม
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5">
        {value.map((p) => (
          <span key={p} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-normal text-slate-800">
            {p}
            <button aria-label={`เอา ${p} ออก`} onClick={() => onChange(value.filter((x) => x !== p))} className="text-slate-400 hover:text-red-600">
              ×
            </button>
          </span>
        ))}
        <input
          aria-label="เพิ่มผู้เข้าร่วม"
          list="people"
          value={text}
          placeholder={value.length ? '' : 'พิมพ์ชื่อแล้วกด Enter'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={add}
          className="min-w-40 flex-1 border-0 px-1 py-0.5 focus:ring-0"
        />
      </div>
      {people.length > 0 && value.length === 0 && <span className="font-normal text-slate-400">ชื่อที่เคยใช้จะขึ้นให้เลือก</span>}
    </div>
  )
}

function ActionItems({
  items,
  people,
  onAdd,
  onOpenTask,
  areas,
}: {
  items: Task[]
  people: string[]
  onAdd: (i: { title: string; assignee?: string; dueDate?: string; priority: Priority }) => Promise<unknown>
  onOpenTask: (t: Task) => void
  areas: Area[]
}) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<Priority>(2)
  const open = items.filter((t) => t.status !== 'done').length

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const item = { title, assignee, dueDate, priority }
    // Clear first so typing the next item right away is never wiped by a late reset.
    setTitle('')
    setAssignee('')
    setPriority(2)
    await onAdd(item)
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">
        Action Items {items.length > 0 && <span className="font-normal text-slate-500">· ค้าง {open} / {items.length}</span>}
      </h2>
      <p className="mb-3 text-xs text-slate-500">ทุกข้อจะเข้าไปอยู่ในรายการ To-do ทันที พร้อมลิงก์กลับมาที่ประชุมนี้</p>
      <form onSubmit={submit} className="mb-3 grid grid-cols-[minmax(0,1fr)_7.5rem_9rem_6.5rem_auto] gap-2">
        <input aria-label="Action Item" placeholder="ต้องทำอะไร" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="ผู้รับผิดชอบ" placeholder="ใครทำ" list="action-people" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
        <input aria-label="กำหนดเสร็จ" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <select aria-label="ความสำคัญของ Action Item" value={priority} onChange={(e) => setPriority(Number(e.target.value) as Priority)}>
          {([1, 2, 3] as Priority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
        <button type="submit" disabled={!title.trim()} className="rounded-md bg-amber-600 px-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
          เพิ่ม
        </button>
        <datalist id="action-people">
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </form>
      <ul className="flex flex-col gap-2">
        {items.map((t) => (
          <TaskItem key={t.id} task={t} area={areas.find((a) => a.id === t.areaId)} onOpen={() => onOpenTask(t)} />
        ))}
      </ul>
    </section>
  )
}
