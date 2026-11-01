import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Meeting, type MeetingTemplate, type Task } from './db'
import { Sidebar } from './components/Sidebar'
import { TaskItem } from './components/TaskItem'
import { TaskEditor } from './components/TaskEditor'
import { SettingsDialog } from './components/SettingsDialog'
import { loadReminderSettings, useAutoBackup, useReminders } from './lib/useBackground'
import { saveReminderSettings, type ReminderSettings } from './lib/reminders'
import { regrantBackupFolder } from './lib/autobackup'
import { MeetingList } from './components/MeetingList'
import { MeetingEditor } from './components/MeetingEditor'
import { compareTasks, matches, newTask, type Filter, type View } from './lib/tasks'
import { compareMeetings, meetingFromTemplate, meetingMatches } from './lib/meetings'
import { getLastBackupAt } from './lib/backup'
import { todayISO } from './lib/dates'

const TITLES: Record<View, string> = {
  today: 'วันนี้',
  upcoming: '7 วันข้างหน้า',
  all: 'งานที่ยังไม่เสร็จ',
  done: 'เสร็จแล้ว',
}
const WEEK = 7 * 24 * 3600 * 1000

type Page = { kind: 'tasks' } | { kind: 'meetings' } | { kind: 'meeting'; id: number }

export default function App() {
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], [])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])
  const meetings = useLiveQuery(() => db.meetings.toArray(), [], [] as Meeting[])
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), [], [] as MeetingTemplate[])
  const [page, setPage] = useState<Page>({ kind: 'tasks' })
  const [filter, setFilter] = useState<Filter>({ view: 'today' })
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const [reminders, setReminders] = useState<ReminderSettings>(loadReminderSettings)
  const [folderRefresh, setFolderRefresh] = useState(0)
  const [quick, setQuick] = useState('')
  const today = todayISO()

  // Ctrl+K / "/" focuses search, "n" opens a new task.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if ((e.ctrlKey && e.key === 'k') || (!typing && e.key === '/')) {
        e.preventDefault()
        document.getElementById('search')?.focus()
      } else if (!typing && e.key === 'n' && !editing) {
        e.preventDefault()
        setEditing('new')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const visible = useMemo(() => tasks.filter((t) => matches(t, filter, today)).sort(compareTasks), [tasks, filter, today])
  const counts = useMemo(() => {
    const base = { areaId: filter.areaId, tag: filter.tag }
    const n = (view: View) => tasks.filter((t) => matches(t, { ...base, view }, today)).length
    return { today: n('today'), upcoming: n('upcoming'), all: n('all'), done: 0 }
  }, [tasks, filter.areaId, filter.tag, today])
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'th')), [tasks])
  const people = useMemo(
    () =>
      [...new Set([...meetings.flatMap((m) => m.attendees), ...tasks.map((t) => t.assignee ?? '')])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'th')),
    [meetings, tasks],
  )
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id!, a])), [areas])
  const meetingById = useMemo(() => new Map(meetings.map((m) => [m.id!, m])), [meetings])
  const openItemsByMeeting = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const t of tasks) if (t.meetingId && t.status !== 'done') map.set(t.meetingId, [...(map.get(t.meetingId) ?? []), t])
    return map
  }, [tasks])
  const openActionItems = [...openItemsByMeeting.entries()].filter(([id]) => meetingById.has(id)).reduce((n, [, v]) => n + v.length, 0)
  const visibleMeetings = useMemo(
    () => meetings.filter((m) => meetingMatches(m, filter.query, filter.areaId)).sort(compareMeetings),
    [meetings, filter.query, filter.areaId],
  )
  useReminders(tasks, reminders)
  const folder = useAutoBackup(tasks, meetings, folderRefresh)
  const lastBackup = getLastBackupAt()
  const backupOverdue =
    folder.state === 'prompt' || (tasks.length + meetings.length > 0 && (!lastBackup || Date.now() - lastBackup > WEEK))

  const defaultAreaId = filter.areaId ?? areas.find((a) => a.name === 'ส่วนตัว')?.id ?? areas[0]?.id ?? 1

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = quick.trim()
    if (!title) return
    const dueDate = filter.view === 'today' ? today : undefined
    setQuick('')
    await db.tasks.add(newTask({ title, areaId: defaultAreaId, dueDate, tags: filter.tag ? [filter.tag] : [] }))
  }

  async function createMeeting(tpl?: MeetingTemplate) {
    const id = await db.meetings.add(meetingFromTemplate(tpl, areas, defaultAreaId))
    setFilter({ ...filter, query: undefined })
    setPage({ kind: 'meeting', id })
  }

  const openMeeting = (id: number) => {
    setFilter({ ...filter, query: undefined })
    setPage({ kind: 'meeting', id })
  }

  const renderTask = (t: Task) => (
    <TaskItem
      key={t.id}
      task={t}
      area={areaById.get(t.areaId)}
      onOpen={() => setEditing(t)}
      meetingTitle={t.meetingId ? meetingById.get(t.meetingId)?.title : undefined}
      onOpenMeeting={t.meetingId ? () => openMeeting(t.meetingId!) : undefined}
    />
  )

  const overdue = filter.view === 'today' && !filter.query ? visible.filter((t) => t.dueDate! < today) : []
  const main = overdue.length ? visible.filter((t) => !overdue.includes(t)) : visible
  const areaSuffix = filter.areaId ? ` · ${areaById.get(filter.areaId)?.name}` : ''
  const heading =
    page.kind === 'meeting'
      ? 'บันทึกประชุม'
      : filter.query
        ? `ผลการค้นหา "${filter.query}"`
        : page.kind === 'meetings'
          ? `บันทึกประชุม${areaSuffix}`
          : `${TITLES[filter.view]}${areaSuffix}${filter.tag ? ` · #${filter.tag}` : ''}`

  return (
    <div className="flex h-full">
      <Sidebar
        onMeetings={page.kind !== 'tasks'}
        onShowMeetings={() => {
          setFilter({ ...filter, query: undefined })
          setPage({ kind: 'meetings' })
        }}
        openActionItems={openActionItems}
        filter={filter}
        areas={areas}
        tags={tags}
        counts={counts}
        onChange={(f, toTasks) => {
          setFilter({ ...f, query: undefined })
          if (toTasks) setPage({ kind: 'tasks' })
          else if (page.kind === 'meeting') setPage({ kind: 'meetings' })
        }}
        onOpenBackup={() => setBackupOpen(true)}
        backupOverdue={backupOverdue}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-[1] flex items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-6 py-3 backdrop-blur">
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{heading}</h1>
          <input
            id="search"
            type="search"
            placeholder={page.kind === 'tasks' ? 'ค้นหางาน (Ctrl+K)' : 'ค้นหาบันทึกประชุม (Ctrl+K)'}
            value={filter.query ?? ''}
            onChange={(e) => {
              setFilter({ ...filter, query: e.target.value || undefined })
              if (page.kind === 'meeting') setPage({ kind: 'meetings' })
            }}
            className="w-64"
          />
          <button onClick={() => setEditing('new')} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
            + งานใหม่
          </button>
        </header>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-5">
          {folder.state === 'prompt' && (
            <button
              onClick={async () => {
                await regrantBackupFolder()
                setFolderRefresh((n) => n + 1)
              }}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100"
            >
              สำรองอัตโนมัติหยุดชั่วคราว เพราะเบราว์เซอร์ขออนุญาตเข้าโฟลเดอร์อีกครั้ง <span className="font-semibold underline">กดตรงนี้เพื่ออนุญาต</span>
            </button>
          )}
          {page.kind === 'meeting' && (
            <MeetingEditor
              key={page.id}
              meetingId={page.id}
              areas={areas}
              people={people}
              onBack={() => setPage({ kind: 'meetings' })}
              onOpenTask={setEditing}
            />
          )}
          {page.kind === 'meetings' && (
            <MeetingList
              meetings={visibleMeetings}
              templates={templates}
              areaById={areaById}
              openItemsByMeeting={openItemsByMeeting}
              onOpen={openMeeting}
              onCreate={createMeeting}
            />
          )}
          {page.kind === 'tasks' && (
            <>
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
                  <ul className="flex flex-col gap-2">{overdue.map(renderTask)}</ul>
                </section>
              )}
              <section>
                {overdue.length > 0 && main.length > 0 && (
                  <h2 className="mb-2 text-sm font-semibold text-slate-600">วันนี้ ({main.length})</h2>
                )}
                <ul className="flex flex-col gap-2">{main.map(renderTask)}</ul>
                {visible.length === 0 && (
                  <p className="py-12 text-center text-sm text-slate-500">
                    {filter.query ? 'ไม่พบงานที่ตรงกับคำค้น' : filter.view === 'today' ? 'ไม่มีงานค้างวันนี้' : 'ยังไม่มีงานในมุมมองนี้'}
                  </p>
                )}
              </section>
            </>
          )}
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
      {backupOpen && (
        <SettingsDialog
          reminders={reminders}
          onRemindersChange={(r) => {
            setReminders(r)
            saveReminderSettings(r)
          }}
          folderState={folder.state}
          folderError={folder.lastError}
          onFolderChanged={() => setFolderRefresh((n) => n + 1)}
          onClose={() => setBackupOpen(false)}
        />
      )}
      <datalist id="people">
        {people.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  )
}
