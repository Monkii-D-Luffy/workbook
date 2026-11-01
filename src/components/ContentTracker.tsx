import { useEffect, useMemo, useState } from 'react'
import { db, type Area, type Task } from '../db'
import { columnOf, contentStats, DONE_COLUMN, moveToColumn, rate, stagesOf } from '../lib/board'

interface Props {
  tasks: Task[]
  area: Area
  onOpen: (t: Task) => void
  onAdd: () => void
}

const fmt = (n: number) => n.toLocaleString('th-TH')
const pct = (r: number | null) => (r === null ? '–' : `${(r * 100).toFixed(1)}%`)

function Cell({ task, field, type = 'text', align = 'left' }: { task: Task; field: string; type?: string; align?: 'left' | 'right' }) {
  const stored = task.extra[field] ?? ''
  const [value, setValue] = useState(stored)
  useEffect(() => setValue(stored), [stored])
  const commit = () => {
    if (value === stored) return
    const extra = { ...task.extra }
    if (value) extra[field] = value
    else delete extra[field]
    db.tasks.update(task.id!, { extra, updatedAt: Date.now() })
  }
  return (
    <input
      aria-label={field}
      type={type}
      min={type === 'number' ? 0 : undefined}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`w-full border-transparent bg-transparent px-1.5 py-1 hover:border-slate-300 ${align === 'right' ? 'text-right' : ''}`}
    />
  )
}

export function ContentTracker({ tasks, area, onOpen, onAdd }: Props) {
  const [platform, setPlatform] = useState('')
  const all = useMemo(() => tasks.filter((t) => t.areaId === area.id), [tasks, area.id])
  const platforms = useMemo(() => [...new Set(all.map((t) => t.extra.platform).filter(Boolean))].sort(), [all])
  const rows = useMemo(
    () =>
      all
        .filter((t) => !platform || t.extra.platform === platform)
        .sort((a, b) => (b.extra.postDate ?? b.dueDate ?? '').localeCompare(a.extra.postDate ?? a.dueDate ?? '') || b.createdAt - a.createdAt),
    [all, platform],
  )
  const stats = contentStats(rows)
  const stages = stagesOf(area)
  const th = 'px-1.5 py-2 text-left font-semibold whitespace-nowrap'
  const num = (t: Task, k: string) => Number(t.extra[k]) || 0

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-2">
        {[
          ['วิวรวม', fmt(stats.views)],
          ['คลิกรวม', fmt(stats.clicks)],
          ['CTR (คลิก/วิว)', pct(stats.ctr)],
          ['Conversion (ขาย/คลิก)', pct(stats.conversion)],
          ['ค่าคอมรวม', `฿${fmt(stats.commission)}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select aria-label="กรองแพลตฟอร์ม" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">ทุกแพลตฟอร์ม</option>
          {platforms.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="flex-1 text-xs text-slate-500">{rows.length} ชิ้น · แก้ตัวเลขในตารางได้เลย</span>
        <button onClick={onAdd} className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-pink-700">+ คอนเทนต์ใหม่</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className={th}>คอนเทนต์</th>
              <th className={th}>สถานะ</th>
              <th className={th}>แพลตฟอร์ม</th>
              <th className={th}>วันโพสต์</th>
              <th className={th}>ลิงก์โพสต์</th>
              <th className={`${th} text-right`}>วิว</th>
              <th className={`${th} text-right`}>คลิก</th>
              <th className={`${th} text-right`}>ขาย</th>
              <th className={`${th} text-right`}>ค่าคอม ฿</th>
              <th className={`${th} text-right`}>CTR</th>
              <th className={`${th} text-right`}>Conv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 align-middle hover:bg-slate-50/60">
                <td className="max-w-56 px-1.5">
                  <button onClick={() => onOpen(t)} className="block w-full truncate text-left hover:text-blue-700 hover:underline" title={t.title}>
                    {t.title}
                  </button>
                </td>
                <td className="px-1">
                  <select
                    aria-label={`สถานะ ${t.title}`}
                    value={columnOf(t, area)}
                    onChange={(e) => moveToColumn(t, e.target.value)}
                    className="border-transparent bg-transparent py-1 hover:border-slate-300"
                  >
                    {stages.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value={DONE_COLUMN}>โพสต์แล้ว</option>
                  </select>
                </td>
                <td className="w-28"><Cell task={t} field="platform" /></td>
                <td className="w-36"><Cell task={t} field="postDate" type="date" /></td>
                <td className="w-40">
                  <div className="flex items-center">
                    <Cell task={t} field="postUrl" type="url" />
                    {t.extra.postUrl && (
                      <a href={t.extra.postUrl} target="_blank" rel="noreferrer" aria-label="เปิดโพสต์" className="px-1 text-blue-700">↗</a>
                    )}
                  </div>
                </td>
                <td className="w-24"><Cell task={t} field="views" type="number" align="right" /></td>
                <td className="w-20"><Cell task={t} field="clicks" type="number" align="right" /></td>
                <td className="w-16"><Cell task={t} field="orders" type="number" align="right" /></td>
                <td className="w-24"><Cell task={t} field="commission" type="number" align="right" /></td>
                <td className="px-1.5 text-right text-slate-600">{pct(rate(num(t, 'clicks'), num(t, 'views')))}</td>
                <td className="px-1.5 text-right text-slate-600">{pct(rate(num(t, 'orders'), num(t, 'clicks')))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-slate-500">ยังไม่มีงานในพื้นที่ "{area.name}"</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
