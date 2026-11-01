import { useEffect, useRef, useState } from 'react'
import { downloadBackup, getLastBackupAt, restoreBackup, validateBackup } from '../lib/backup'
import { notify, type ReminderSettings } from '../lib/reminders'
import {
  backupToFolder,
  chooseBackupFolder,
  folderBackupSupported,
  forgetBackupFolder,
  getBackupFolder,
  regrantBackupFolder,
  KEEP_DAILY,
} from '../lib/autobackup'
import type { FolderState } from '../lib/useBackground'

interface Props {
  reminders: ReminderSettings
  onRemindersChange: (s: ReminderSettings) => void
  folderState: FolderState
  folderError: string | null
  onFolderChanged: () => void
  onClose: () => void
}

const LEADS = [
  { v: 0, label: 'ตรงเวลา' },
  { v: 5, label: '5 นาทีก่อน' },
  { v: 15, label: '15 นาทีก่อน' },
  { v: 30, label: '30 นาทีก่อน' },
  { v: 60, label: '1 ชั่วโมงก่อน' },
]

export function SettingsDialog({ reminders, onRemindersChange, folderState, folderError, onFolderChanged, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const last = getLastBackupAt()
  useEffect(() => {
    getBackupFolder().then((d) => setFolderName(d?.name ?? null))
  }, [folderState])

  async function enableNotifications(on: boolean) {
    if (on && permission !== 'granted') {
      const p = await Notification.requestPermission()
      setPermission(p)
      if (p !== 'granted') {
        setMessage('Windows ยังไม่อนุญาตการแจ้งเตือน เปิดได้ที่ไอคอนแม่กุญแจหน้าแถบที่อยู่')
        return
      }
    }
    onRemindersChange({ ...reminders, enabled: on })
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const backup = validateBackup(JSON.parse(await file.text()))
      if (!confirm(`กู้คืนจากไฟล์นี้ (${backup.tasks.length} งาน, ${backup.meetings?.length ?? 0} บันทึกประชุม)? ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่`)) return
      await restoreBackup(backup)
      setMessage(`กู้คืนแล้ว ${backup.tasks.length} งาน`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'อ่านไฟล์ไม่ได้')
    }
  }

  async function pickFolder() {
    try {
      await chooseBackupFolder()
      await backupToFolder()
      setMessage('ตั้งโฟลเดอร์แล้ว และสำรองครั้งแรกเรียบร้อย')
      onFolderChanged()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setMessage(`ตั้งโฟลเดอร์ไม่สำเร็จ: ${(err as Error).message}`)
    }
  }

  const section = 'flex flex-col gap-2 border-t border-slate-200 pt-4'
  const btn = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50'
  const primary = 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700'

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col gap-4 rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold">ตั้งค่า</h2>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">แจ้งเตือน</h3>
          {permission === 'unsupported' ? (
            <p className="text-sm text-slate-600">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={reminders.enabled} onChange={(e) => enableNotifications(e.target.checked)} className="h-4 w-4" />
                เปิดแจ้งเตือนที่มุมจอ Windows
              </label>
              <div className={`grid grid-cols-2 gap-3 ${reminders.enabled ? '' : 'pointer-events-none opacity-40'}`}>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  งานที่ตั้งเวลาไว้ เตือน
                  <select value={reminders.leadMinutes} onChange={(e) => onRemindersChange({ ...reminders, leadMinutes: Number(e.target.value) })}>
                    {LEADS.map((l) => (
                      <option key={l.v} value={l.v}>{l.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <input type="checkbox" checked={reminders.morningEnabled} onChange={(e) => onRemindersChange({ ...reminders, morningEnabled: e.target.checked })} className="h-3.5 w-3.5" />
                    สรุปงานตอนเช้า เวลา
                  </span>
                  <input type="time" value={reminders.morningTime} disabled={!reminders.morningEnabled} onChange={(e) => e.target.value && onRemindersChange({ ...reminders, morningTime: e.target.value })} />
                </label>
              </div>
              {reminders.enabled && (
                <button onClick={() => notify('ทดสอบแจ้งเตือน', 'ถ้าเห็นข้อความนี้ แปลว่าแจ้งเตือนใช้งานได้', 'test')} className={`${btn} self-start`}>
                  ทดสอบแจ้งเตือน
                </button>
              )}
              <p className="text-xs text-slate-500">
                แจ้งเตือนทำงานตอนแอปเปิดอยู่ (ย่อหน้าต่างไว้ได้) แนะนำให้ตั้งแอปให้เปิดเองตอนเปิดเครื่อง: ใน Edge ไปที่ edge://apps คลิกขวาที่ Workbook แล้วเลือก "เริ่มเมื่อลงชื่อเข้าใช้"
              </p>
            </>
          )}
        </div>

        <div className={section}>
          <h3 className="text-sm font-semibold">สำรองอัตโนมัติลงโฟลเดอร์</h3>
          {!folderBackupSupported() ? (
            <p className="text-sm text-slate-600">ใช้ได้เฉพาะใน Edge หรือ Chrome บนคอมพิวเตอร์</p>
          ) : folderState === 'none' ? (
            <>
              <p className="text-sm text-slate-600">
                เลือกโฟลเดอร์ (เช่น ใน OneDrive) แอปจะบันทึกไฟล์สำรองให้เองทุกครั้งที่ข้อมูลเปลี่ยน เก็บไฟล์รายวันย้อนหลัง {KEEP_DAILY} วัน
              </p>
              <button onClick={pickFolder} className={`${primary} self-start`}>เลือกโฟลเดอร์</button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                โฟลเดอร์: <span className="font-medium">{folderName ?? '…'}</span>{' '}
                {folderState === 'granted' ? <span className="text-green-700">· ทำงานอยู่</span> : <span className="text-amber-700">· ต้องกดอนุญาตอีกครั้ง</span>}
              </p>
              {folderError && <p className="text-xs text-red-600">สำรองล่าสุดไม่สำเร็จ: {folderError}</p>}
              <div className="flex flex-wrap gap-2">
                {folderState !== 'granted' && (
                  <button
                    onClick={async () => {
                      if (await regrantBackupFolder()) {
                        await backupToFolder()
                        setMessage('เปิดสำรองอัตโนมัติอีกครั้งแล้ว')
                      }
                      onFolderChanged()
                    }}
                    className={primary}
                  >
                    อนุญาตอีกครั้ง
                  </button>
                )}
                {folderState === 'granted' && (
                  <button
                    onClick={async () => {
                      await backupToFolder()
                      setMessage('สำรองลงโฟลเดอร์แล้ว')
                    }}
                    className={btn}
                  >
                    สำรองตอนนี้
                  </button>
                )}
                <button onClick={pickFolder} className={btn}>เปลี่ยนโฟลเดอร์</button>
                <button
                  onClick={async () => {
                    await forgetBackupFolder()
                    onFolderChanged()
                  }}
                  className={`${btn} text-red-600`}
                >
                  เลิกสำรองอัตโนมัติ
                </button>
              </div>
            </>
          )}
        </div>

        <div className={section}>
          <h3 className="text-sm font-semibold">สำรอง / กู้คืนด้วยไฟล์</h3>
          <p className="text-xs text-slate-500">สำรองล่าสุด: {last ? new Date(last).toLocaleString('th-TH') : 'ยังไม่เคยสำรอง'}</p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                await downloadBackup()
                setMessage('ดาวน์โหลดไฟล์สำรองแล้ว')
              }}
              className={btn}
            >
              ดาวน์โหลดไฟล์สำรอง
            </button>
            <button onClick={() => fileRef.current?.click()} className={btn}>กู้คืนจากไฟล์</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
          </div>
        </div>

        {message && <p className="text-sm text-blue-700">{message}</p>}
        <button onClick={onClose} className="self-end rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">ปิด</button>
      </div>
    </div>
  )
}
