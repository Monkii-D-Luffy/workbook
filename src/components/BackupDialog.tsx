import { useRef, useState } from 'react'
import { downloadBackup, getLastBackupAt, restoreBackup, validateBackup } from '../lib/backup'

export function BackupDialog({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const last = getLastBackupAt()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const backup = validateBackup(JSON.parse(await file.text()))
      if (!confirm(`กู้คืนจากไฟล์นี้ (${backup.tasks.length} งาน)? ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่`)) return
      await restoreBackup(backup)
      setMessage(`กู้คืนแล้ว ${backup.tasks.length} งาน`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'อ่านไฟล์ไม่ได้')
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center bg-slate-900/30 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold">สำรอง / กู้คืนข้อมูล</h2>
        <p className="text-sm text-slate-600">
          ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ควรสำรองเป็นไฟล์ทุกสัปดาห์ แล้วเก็บไว้ใน OneDrive หรือ Google Drive
        </p>
        <p className="text-xs text-slate-500">
          สำรองล่าสุด: {last ? new Date(last).toLocaleString('th-TH') : 'ยังไม่เคยสำรอง'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await downloadBackup()
              setMessage('ดาวน์โหลดไฟล์สำรองแล้ว')
            }}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            ดาวน์โหลดไฟล์สำรอง
          </button>
          <button onClick={() => fileRef.current?.click()} className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50">
            กู้คืนจากไฟล์
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        </div>
        {message && <p className="text-sm text-blue-700">{message}</p>}
        <button onClick={onClose} className="self-end rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          ปิด
        </button>
      </div>
    </div>
  )
}
