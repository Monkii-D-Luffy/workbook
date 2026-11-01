import { db, MEETING_TYPES, type Area, type Meeting, type MeetingTemplate, type MeetingType, type Task } from '../db'
import { todayISO } from './dates'
import { newTask } from './tasks'

export function meetingFromTemplate(tpl: MeetingTemplate | undefined, areas: Area[], fallbackAreaId: number, now = Date.now(), today = todayISO()): Meeting {
  const area = areas.find((a) => a.name === tpl?.areaName)
  return {
    title: tpl ? `${tpl.name} ${today}` : `ประชุม ${today}`,
    date: today,
    areaId: area?.id ?? fallbackAreaId,
    templateId: tpl?.id,
    type: tpl?.type ?? 'general',
    attendees: [],
    sections: (tpl?.sections ?? [{ heading: 'บันทึก' }]).map((s) => ({ ...s, body: '' })),
    createdAt: now,
    updatedAt: now,
  }
}

export function meetingSearchText(m: Meeting): string {
  return [m.title, typeLabel(m.type), ...m.attendees, ...m.sections.flatMap((s) => [s.heading, s.body]), ...(m.decisions ?? []).map((d) => d.text)]
    .join(' ')
    .toLowerCase()
}

export function meetingMatches(m: Meeting, query?: string, areaId?: number, type?: MeetingType): boolean {
  if (areaId !== undefined && m.areaId !== areaId) return false
  if (type && (m.type ?? 'general') !== type) return false
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
      tags: meetingTypeInfo(meeting.type).actionTag ? [meetingTypeInfo(meeting.type).actionTag!] : [],
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

export function meetingTypeInfo(type: MeetingType | undefined) {
  return MEETING_TYPES.find((t) => t.type === (type ?? 'general')) ?? MEETING_TYPES.at(-1)!
}

export const typeLabel = (type: MeetingType | undefined) => meetingTypeInfo(type).label

const DATE_SUFFIX = /\s*\d{4}-\d{2}-\d{2}$/

/** Meetings in the same series, oldest first. */
export function seriesOf(m: Meeting, all: Meeting[]): Meeting[] {
  if (!m.seriesId) return [m]
  return all.filter((x) => x.seriesId === m.seriesId).sort((a, b) => -compareMeetings(a, b))
}

/** A new meeting following `m`: same type, area, attendees and headings; empty notes. */
export function nextMeetingDraft(m: Meeting, seriesId: string, now = Date.now(), date = todayISO()): Meeting {
  return {
    title: `${m.title.replace(DATE_SUFFIX, '')} ${date}`,
    date,
    time: m.time,
    areaId: m.areaId,
    templateId: m.templateId,
    type: m.type,
    seriesId,
    attendees: [...m.attendees],
    sections: m.sections.map((s) => ({ heading: s.heading, hint: s.hint, body: '' })),
    decisions: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Create the next meeting in a series, starting the series on `m` if needed. Returns the new id. */
export async function createNextMeeting(m: Meeting): Promise<number> {
  return db.transaction('rw', db.meetings, async () => {
    const seriesId = m.seriesId ?? `s${m.id}-${Date.now().toString(36)}`
    if (!m.seriesId) await db.meetings.update(m.id!, { seriesId })
    return db.meetings.add(nextMeetingDraft(m, seriesId))
  })
}

/** Open action items from earlier meetings in the same series. */
export function carriedActionItems(m: Meeting, all: Meeting[], tasks: Task[]): { task: Task; from: Meeting }[] {
  if (!m.seriesId) return []
  const earlier = seriesOf(m, all).filter((x) => x.id !== m.id && compareMeetings(x, m) > 0)
  const byId = new Map(earlier.map((x) => [x.id!, x]))
  return tasks
    .filter((t) => t.status !== 'done' && t.meetingId !== undefined && byId.has(t.meetingId))
    .map((t) => ({ task: t, from: byId.get(t.meetingId!)! }))
}

export interface DecisionRow {
  id: string
  text: string
  meeting: Meeting
}

/** Every decision across meetings, newest meeting first. */
export function allDecisions(meetings: Meeting[], query?: string, type?: MeetingType): DecisionRow[] {
  const terms = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return [...meetings]
    .filter((m) => !type || (m.type ?? 'general') === type)
    .sort(compareMeetings)
    .flatMap((m) => (m.decisions ?? []).map((d) => ({ ...d, meeting: m })))
    .filter((r) => terms.every((q) => `${r.text} ${r.meeting.title}`.toLowerCase().includes(q)))
}
