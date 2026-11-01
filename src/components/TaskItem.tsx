import type { Area, Task } from '../db'
import { formatDue, todayISO, RECURRENCE_LABEL } from '../lib/dates'
import { completeTask, reopenTask, toggleChecklistItem } from '../lib/tasks'

const PRIORITY_STYLE = { 1: 'border-red-500 bg-red-50', 2: 'border-slate-400', 3: 'border-slate-300' } as const

interface Props {
  task: Task
  area?: Area
  onOpen: () => void
  meetingTitle?: string
  onOpenMeeting?: () => void
}

export function TaskItem({ task, area, onOpen, meetingTitle, onOpenMeeting }: Props) {
  const today = todayISO()
  const done = task.status === 'done'
  const overdue = !done && !!task.dueDate && task.dueDate < today
  const extras = area?.fields.filter((f) => !f.trackerOnly).map((f) => task.extra[f.key]).filter(Boolean) ?? []
  return (
    <li className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:border-slate-300">
      <button
        aria-label={done ? 'ทำเครื่องหมายว่ายังไม่เสร็จ' : 'ทำเครื่องหมายว่าเสร็จ'}
        onClick={() => (done ? reopenTask(task) : completeTask(task))}
        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${done ? 'border-blue-600 bg-blue-600' : PRIORITY_STYLE[task.priority]}`}
      >
        {done && <span className="block text-center text-[11px] leading-4 text-white">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
      <button className="w-full text-left" onClick={onOpen}>
        <div className={`text-sm ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
          {task.priority === 1 && !done && <span className="mr-1.5 font-semibold text-red-600">P1</span>}
          {task.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {task.dueDate && (
            <span className={overdue ? 'font-semibold text-red-600' : task.dueDate === today ? 'font-semibold text-blue-700' : ''}>
              {formatDue(task.dueDate, today)}
              {task.dueTime && ` ${task.dueTime}`}
            </span>
          )}
          {task.checklist && task.checklist.length > 0 && (
            <span className={task.checklist.every((c) => c.done) ? 'text-green-700' : ''}>
              ☑ {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
            </span>
          )}
          {task.assignee && <span className="font-medium text-slate-700">@{task.assignee}</span>}
          {task.recurrence !== 'none' && <span>↻ {RECURRENCE_LABEL[task.recurrence]}</span>}
          {area && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: area.color }} />
              {area.name}
            </span>
          )}
          {extras.map((e, i) => (
            <span key={i} className="max-w-48 truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
              {e}
            </span>
          ))}
          {task.tags.map((t) => (
            <span key={t} className="text-blue-700">#{t}</span>
          ))}
        </div>
      </button>
      {!done && task.checklist && task.checklist.some((c) => !c.done) && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {task.checklist.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={c.done} onChange={() => toggleChecklistItem(task, c.id)} className="h-3.5 w-3.5" />
                <span className={c.done ? 'text-slate-400 line-through' : ''}>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      </div>
      {meetingTitle && onOpenMeeting && (
        <button
          onClick={onOpenMeeting}
          title="เปิดบันทึกประชุมที่สั่งงานนี้"
          className="max-w-44 shrink-0 truncate rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
        >
          จากประชุม: {meetingTitle}
        </button>
      )}
    </li>
  )
}
