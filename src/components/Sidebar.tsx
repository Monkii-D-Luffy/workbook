import type { Area } from '../db'
import type { Filter, View } from '../lib/tasks'

const VIEWS: { view: View; label: string }[] = [
  { view: 'today', label: 'วันนี้' },
  { view: 'upcoming', label: '7 วันข้างหน้า' },
  { view: 'all', label: 'งานที่ยังไม่เสร็จ' },
  { view: 'done', label: 'เสร็จแล้ว' },
]

interface Props {
  filter: Filter
  areas: Area[]
  tags: string[]
  counts: Record<View, number>
  onChange: (f: Filter) => void
  onOpenBackup: () => void
  backupOverdue: boolean
}

export function Sidebar({ filter, areas, tags, counts, onChange, onOpenBackup, backupOverdue }: Props) {
  const item = (active: boolean) =>
    `flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm ${
      active ? 'bg-blue-100 font-semibold text-blue-800' : 'text-slate-700 hover:bg-slate-200/60'
    }`
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-5 border-r border-slate-200 bg-white p-3">
      <div className="px-3 pt-1 text-lg font-bold text-blue-700">Workbook</div>
      <nav className="flex flex-col gap-0.5" aria-label="มุมมอง">
        {VIEWS.map((v) => (
          <button key={v.view} className={item(filter.view === v.view)} onClick={() => onChange({ ...filter, view: v.view })}>
            <span>{v.label}</span>
            {v.view !== 'done' && counts[v.view] > 0 && <span className="text-xs text-slate-500">{counts[v.view]}</span>}
          </button>
        ))}
      </nav>
      <div>
        <div className="px-3 pb-1 text-xs font-semibold text-slate-500">พื้นที่งาน</div>
        <button className={item(filter.areaId === undefined)} onClick={() => onChange({ ...filter, areaId: undefined })}>
          ทั้งหมด
        </button>
        {areas.map((a) => (
          <button key={a.id} className={item(filter.areaId === a.id)} onClick={() => onChange({ ...filter, areaId: a.id })}>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
              {a.name}
            </span>
          </button>
        ))}
      </div>
      {tags.length > 0 && (
        <div>
          <div className="px-3 pb-1 text-xs font-semibold text-slate-500">แท็ก</div>
          <div className="flex flex-wrap gap-1 px-2">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => onChange({ ...filter, tag: filter.tag === t ? undefined : t })}
                className={`rounded-full px-2 py-0.5 text-xs ${filter.tag === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto">
        <button className={item(false)} onClick={onOpenBackup}>
          <span>สำรอง / กู้คืนข้อมูล</span>
          {backupOverdue && <span className="h-2 w-2 rounded-full bg-amber-500" title="ยังไม่ได้สำรองข้อมูลเกิน 7 วัน" />}
        </button>
      </div>
    </aside>
  )
}
