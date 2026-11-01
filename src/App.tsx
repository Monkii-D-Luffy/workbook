import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Task } from './db'
import { Sidebar } from './components/Sidebar'
import { TaskItem } from './components/TaskItem'
import { TaskEditor } from './components/TaskEditor'
import { BackupDialog } from './components/BackupDialog'
import { compareTasks, matches, newTask, type Filter, type View } from './lib/tasks'
import { getLastBackupAt } from './lib/backup'
import { todayISO } from './lib/dates'

const TITLES: Record<View, string> = {
  today: 'วันนี้',
  upcoming: '7 วันข้างหน้า',
  all: 'งานที่ยังไม่เสร็จ',
  done: 'เสร็จแล้ว',
}
const WEEK = 7 * 24 * 3600 * 1000

export default function App() {
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], [])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])
  const [filter, setFilter] = useState<Filter>({ view: 'today' })
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const [quick, setQuick] = useState('')
  const today = todayISO()

  // Ctrl+K / "/" focuses search, "n" opens a new task.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if ((e.ctrlKey && e.key === 'k') || (!typing && e.key === '/')) {
        e.preventDefault()
        document.getElementById('search')?.focus()
      } else if (!typing && e.key === 'n') {
        e.preventDefault()
        setEditing('new')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visible = useMemo(() => tasks.filter((t) => matches(t, filter, today)).sort(compareTasks), [tasks, filter, today])
  const counts = useMemo(() => {
    const base = { areaId: filter.areaId, tag: filter.tag }
    const n = (view: View) => tasks.filter((t) => matches(t, { ...base, view }, today)).length
    return { today: n('today'), upcoming: n('upcoming'), all: n('all'), done: 0 }
  }, [tasks, filter.areaId, filter.tag, today])
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'th')), [tasks])
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id!, a])), [areas])
  const lastBackup = getLastBackupAt()
  const backupOverdue = tasks.length > 0 && (!lastBackup || Date.now() - lastBackup > WEEK)

  const defaultAreaId = filter.areaId ?? areas.find((a) => a.name === 'ส่วนตัว')?.id ?? areas[0]?.id ?? 1

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = quick.trim()
    if (!title) return
    const dueDate = filter.view === 'today' ? today : undefined
    await db.tasks.add(newTask({ title, areaId: defaultAreaId, dueDate, tags: filter.tag ? [filter.tag] : [] }))
    setQuick('')
  }

  const overdue = filter.view === 'today' && !filter.query ? visible.filter((t) => t.dueDate! < today) : []
  const main = overdue.length ? visible.filter((t) => !overdue.includes(t)) : visible
  const heading = filter.query
    ? `ผลการค้นหา "${filter.query}"`
    : `${TITLES[filter.view]}${filter.areaId ? ` · ${areaById.get(filter.areaId)?.name}` : ''}${filter.tag ? ` · #${filter.tag}` : ''}`

  return (
    <div className="flex h-full">
      <Sidebar
        filter={filter}
        areas={areas}
        tags={tags}
        counts={counts}
        onChange={(f) => setFilter({ ...f, query: undefined })}
        onOpenBackup={() => setBackupOpen(true)}
        backupOverdue={backupOverdue}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-[1] flex items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-6 py-3 backdrop-blur">
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{heading}</h1>
          <input
            id="search"
            type="search"
            placeholder="ค้นหา (Ctrl+K)"
            value={filter.query ?? ''}
            onChange={(e) => setFilter({ ...filter, query: e.target.value || undefined })}
            className="w-64"
          />
          <button onClick={() => setEditing('new')} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
            + งานใหม่
          </button>
        </header>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-5">
          {filter.view !== 'done' && !filter.query && (
            <form onSubmit={quickAdd}>
              <input
                aria-label="เพิ่มงานด่วน"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                placeholder={`+ เพิ่มงาน${filter.view === 'today' ? 'วันนี้' : ''} แล้วกด Enter`}
                className="w-full py-2"
              />
            </form>
          )}
          {overdue.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-red-600">เกินกำหนด ({overdue.length})</h2>
              <ul className="flex flex-col gap-2">
                {overdue.map((t) => (
                  <TaskItem key={t.id} task={t} area={areaById.get(t.areaId)} onOpen={() => setEditing(t)} />
                ))}
              </ul>
            </section>
          )}
          <section>
            {overdue.length > 0 && main.length > 0 && <h2 className="mb-2 text-sm font-semibold text-slate-600">วันนี้ ({main.length})</h2>}
            <ul className="flex flex-col gap-2">
              {main.map((t) => (
                <TaskItem key={t.id} task={t} area={areaById.get(t.areaId)} onOpen={() => setEditing(t)} />
              ))}
            </ul>
            {visible.length === 0 && (
              <p className="py-12 text-center text-sm text-slate-500">
                {filter.query ? 'ไม่พบงานที่ตรงกับคำค้น' : filter.view === 'today' ? 'ไม่มีงานค้างวันนี้' : 'ยังไม่มีงานในมุมมองนี้'}
              </p>
            )}
          </section>
        </div>
      </main>
      {editing && (
        <TaskEditor
          task={editing === 'new' ? undefined : editing}
          areas={areas}
          defaultAreaId={defaultAreaId}
          onClose={() => setEditing(null)}
        />
      )}
      {backupOpen && <BackupDialog onClose={() => setBackupOpen(false)} />}
    </div>
  )
}
