import { useEffect, useRef, useState } from 'react'
import type { Meeting, Task } from '../db'
import {
  dueReminders,
  loadMorningShown,
  loadReminderSettings,
  loadShown,
  morningSummary,
  notify,
  reminderText,
  saveMorningShown,
  saveShown,
  type ReminderSettings,
} from './reminders'
import { backupFolderState, backupToFolder } from './autobackup'

const TICK_MS = 30_000

/** Checks every 30 s for reminders and the morning summary while the app is open. */
export function useReminders(tasks: Task[], settings: ReminderSettings) {
  const latest = useRef(tasks)
  latest.current = tasks
  useEffect(() => {
    if (!settings.enabled) return
    const check = () => {
      const now = new Date()
      const shown = loadShown()
      for (const r of dueReminders(latest.current, now, settings.leadMinutes, shown)) {
        const { title, body } = reminderText(r, now)
        notify(title, body, r.key)
        shown.add(r.key)
      }
      saveShown(shown)
      const summary = morningSummary(latest.current, now, settings, loadMorningShown())
      if (summary) {
        notify(summary.title, summary.body, 'morning')
        saveMorningShown(summary.date)
      }
    }
    // Let the task list load first so the first check sees real data.
    const first = setTimeout(check, 3000)
    const id = setInterval(check, TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [settings])
}

export type FolderState = 'granted' | 'prompt' | 'denied' | 'none'

/** Writes a backup to the chosen folder a few seconds after data stops changing. */
export function useAutoBackup(tasks: Task[], meetings: Meeting[], refreshKey: number) {
  const [state, setState] = useState<FolderState>('none')
  const [lastError, setLastError] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    backupFolderState().then(setState)
  }, [refreshKey])

  useEffect(() => {
    // Skip the first render: that is just the data loading, not a change.
    if (!loaded.current) {
      if (tasks.length || meetings.length) loaded.current = true
      return
    }
    if (state !== 'granted') return
    const t = setTimeout(() => {
      backupToFolder()
        .then((ok) => {
          setLastError(null)
          if (!ok) backupFolderState().then(setState)
        })
        .catch((e) => setLastError(e instanceof Error ? e.message : String(e)))
    }, 5000)
    return () => clearTimeout(t)
  }, [tasks, meetings, state])

  return { state, lastError }
}

export { loadReminderSettings }
