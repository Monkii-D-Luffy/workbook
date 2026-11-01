import { db, type Area, type Meeting, type MeetingTemplate } from '../db'
import { todayISO } from './dates'
import { newTask } from './tasks'

export function meetingFromTemplate(tpl: MeetingTemplate | undefined, areas: Area[], fallbackAreaId: number, now = Date.now(), today = todayISO()): Meeting {
  const area = areas.find((a) => a.name === tpl?.areaName)
  return {
    title: tpl ? `${tpl.name} ${today}` : `ประชุม ${today}`,
    date: today,
    areaId: area?.id ?? fallbackAreaId,
    templateId: tpl?.id,
    attendees: [],
    sections: (tpl?.sections ?? [{ heading: 'บันทึก' }]).map((s) => ({ ...s, body: '' })),
    createdAt: now,
    updatedAt: now,
  }
}

export function meetingSearchText(m: Meeting): string {
  return [m.title, ...m.attendees, ...m.sections.flatMap((s) => [s.heading, s.body])].join(' ').toLowerCase()
}

export function meetingMatches(m: Meeting, query?: string, areaId?: number): boolean {
  if (areaId !== undefined && m.areaId !== areaId) return false
  if (!query) return true
  const text = meetingSearchText(m)
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((q) => text.includes(q))
}

export function compareMeetings(a: Meeting, b: Meeting): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return (b.time ?? '').localeCompare(a.time ?? '') || b.createdAt - a.createdAt
}

/** Add an action item: it is a normal task that remembers its meeting. */
export async function addActionItem(
  meeting: Meeting,
  item: { title: string; assignee?: string; dueDate?: string; priority?: 1 | 2 | 3 },
): Promise<number> {
  return db.tasks.add(
    newTask({
      title: item.title.trim(),
      assignee: item.assignee?.trim() || undefined,
      dueDate: item.dueDate || undefined,
      priority: item.priority ?? 2,
      areaId: meeting.areaId,
      meetingId: meeting.id,
    }),
  )
}

/** Delete a meeting. Its action items stay as tasks but lose the link. */
export async function deleteMeeting(id: number): Promise<void> {
  await db.transaction('rw', db.meetings, db.tasks, async () => {
    await db.tasks.where('meetingId').equals(id).modify((t) => {
      delete t.meetingId
    })
    await db.meetings.delete(id)
  })
}
