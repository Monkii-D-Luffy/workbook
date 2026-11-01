import { useState } from 'react'
import { db, type Area, type ChecklistItem, type Priority, type Recurrence, type Task } from '../db'
import { RECURRENCE_LABEL } from '../lib/dates'
import { PRIORITY_LABEL, RECURRENCES, newChecklistId, newTask, parseTags } from '../lib/tasks'

interface Props {
  task?: Task
  areas: Area[]
  defaultAreaId: number
  /** Prefilled values for a new task, e.g. the day clicked in the calendar */
  defaults?: Partial<Task>
  onClose: () => void
}

export function TaskEditor({ task, areas, defaultAreaId, defaults, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? defaults?.dueDate ?? '')
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 2)
  const [areaId, setAreaId] = useState(task?.areaId ?? defaults?.areaId ?? defaultAreaId)
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '')
  const [assignee, setAssignee] = useState(task?.assignee ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? 'none')
  const [extra, setExtra] = useState<Record<string, string>>(task?.extra ?? {})
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist ?? [])
  const [newItem, setNewItem] = useState('')
  const area = areas.find((a) => a.id === areaId)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    // Keep only the extra fields that belong to the chosen area.
    const keep = Object.fromEntries((area?.fields ?? []).map((f) => [f.key, extra[f.key] ?? '']).filter(([, v]) => v))
    const fields = {
      title: title.trim(),
      notes,
      dueDate: dueDate || undefined,
      dueTime: (dueDate && dueTime) || undefined,
      priority,
      areaId,
      tags: parseTags(tags),
      assignee: assignee.trim() || undefined,
      recurrence,
      extra: keep,
      checklist: checklist.filter((c) => c.text.trim()),
    }
    if (task?.id) await db.tasks.update(task.id, { ...fields, updatedAt: Date.now() })
    else await db.tasks.add(newTask({ ...fields, stage: areaId === defaults?.areaId ? defaults?.stage : undefined }))
    onClose()
  }

  async function remove() {
    if (task?.id && confirm(`ลบงาน "${task.title}" ?`)) {
      await db.tasks.delete(task.id)
      onClose()
    }
  }

  const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600'
  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center bg-slate-900/30 p-4 pt-[8vh]" onMouseDown={onClose}>
      <form
        onSubmit={save}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="flex w-full max-w-xl flex-col gap-4 rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">{task ? 'แก้ไขงาน' : 'งานใหม่'}</h2>
        <input autoFocus aria-label="ชื่องาน" placeholder="ต้องทำอะไร" value={title} onChange={(e) => setTitle(e.target.value)} className="text-base" />
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            วันครบกำหนด
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className={label}>
            เวลา
            <input type="time" value={dueTime} disabled={!dueDate} onChange={(e) => setDueTime(e.target.value)} />
          </label>
          <label className={label}>
            ความสำคัญ
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value) as Priority)}>
              {([1, 2, 3] as Priority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            ทำซ้ำ
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            พื้นที่งาน
            <select value={areaId} onChange={(e) => setAreaId(Number(e.target.value))}>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            แท็ก (คั่นด้วย ,)
            <input value={tags} placeholder="เช่น ปั๊ม, ไลน์3" onChange={(e) => setTags(e.target.value)} />
          </label>
          <label className={label}>
            ผู้รับผิดชอบ
            <input value={assignee} list="people" placeholder="เว้นว่าง = ตัวเอง" onChange={(e) => setAssignee(e.target.value)} />
          </label>
          {area?.fields.filter((f) => !f.trackerOnly).map((f) => (
            <label key={f.key} className={label}>
              {f.label}
              <input
                type={f.type}
                value={extra[f.key] ?? ''}
                onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label className={label}>
          รายละเอียด
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-slate-600">
            Checklist {checklist.length > 0 && `(${checklist.filter((c) => c.done).length}/${checklist.length})`}
          </div>
          {checklist.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`เสร็จ: ${c.text}`}
                checked={c.done}
                onChange={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
                className="h-4 w-4"
              />
              <input
                aria-label="ขั้นตอน"
                value={c.text}
                onChange={(e) => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
                className={`flex-1 py-1 ${c.done ? 'text-slate-400 line-through' : ''}`}
              />
              <button type="button" aria-label={`ลบขั้นตอน ${c.text}`} onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))} className="px-1 text-slate-400 hover:text-red-600">
                ×
              </button>
            </div>
          ))}
          <input
            aria-label="เพิ่มขั้นตอน"
            placeholder="+ เพิ่มขั้นตอน แล้วกด Enter"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (newItem.trim()) setChecklist([...checklist, { id: newChecklistId(), text: newItem.trim(), done: false }])
                setNewItem('')
              }
            }}
            className="py-1"
          />
        </div>
        {recurrence !== 'none' && (
          <p className="text-xs text-slate-500">เมื่อกดเสร็จ ระบบจะสร้างงานรอบถัดไปให้อัตโนมัติ{checklist.length > 0 && ' พร้อม Checklist ที่ล้างเครื่องหมายแล้ว'}</p>
        )}
        <div className="flex items-center gap-2">
          {task && (
            <button type="button" onClick={remove} className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              ลบ
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            ยกเลิก
          </button>
          <button type="submit" disabled={!title.trim()} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
            บันทึก
          </button>
        </div>
      </form>
    </div>
  )
}
