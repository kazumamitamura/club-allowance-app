'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

const TIME_ITEMS = [
  { key: 'leave_hourly', label: '時間休' },
  { key: 'overtime_weekday', label: '平日残業' },
  { key: 'overtime_weekday2', label: '平日2' },
  { key: 'overtime_late_night', label: '深夜' },
  { key: 'overtime_holiday', label: '休日' },
  { key: 'overtime_holiday_late', label: '休日深夜' },
  { key: 'lateness', label: '遅刻' },
  { key: 'early_leave', label: '早退' },
  { key: 'leave_childcare', label: '育児' },
  { key: 'leave_nursing', label: '介護' },
  { key: 'leave_special_paid', label: '特休(有)' },
  { key: 'leave_special_unpaid', label: '特休(無)' },
  { key: 'leave_duty_exemption', label: '義務免' },
  { key: 'leave_holiday_shift', label: '休振' },
  { key: 'leave_comp_day', label: '振代' },
  { key: 'leave_admin', label: '管休' },
]

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [allowances, setAllowances] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [aggregatedData, setAggregatedData] = useState<any[]>([])
  
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({})
  const [patternDefs, setPatternDefs] = useState<Record<string, {start:string, end:string}>>({})
  
  const [allowanceStatuses, setAllowanceStatuses] = useState<Record<string, any>>({})
  const [scheduleStatuses, setScheduleStatuses] = useState<Record<string, any>>({})

  const [userList, setUserList] = useState<{id: string, email: string}[]>([]) 
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  
  const [viewMode, setViewMode] = useState<'allowance' | 'schedule'>('allowance')
  const [uploading, setUploading] = useState(false)

  // ファイル保持用
  const [masterFile, setMasterFile] = useState<File | null>(null)
  const [patternFile, setPatternFile] = useState<File | null>(null)

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() || '')) {
        alert('管理者権限がありません')
        router.push('/')
        return
      }
      setIsAdmin(true)
      fetchData(selectedMonth)
      fetchMasters()
    }
    checkAdmin()
  }, [])

  useEffect(() => {
    aggregateData()
  }, [allowances, schedules, selectedUserId, allowanceStatuses, scheduleStatuses])

  const handleMonthChange = (offset: number) => {
    const newDate = new Date(selectedMonth)
    newDate.setMonth(newDate.getMonth() + offset)
    setSelectedMonth(newDate)
    fetchData(newDate)
  }

  const fetchData = async (date: Date) => {
    setLoading(true)
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    const { data: allowData } = await supabase.from('allowances').select('*').gte('date', startDate).lte('date', endDate).order('date')
    const { data: schedData } = await supabase.from('daily_schedules').select('*').gte('date', startDate).lte('date', endDate).order('date')
    
    const ym = `${y}-${String(m).padStart(2, '0')}`
    const { data: appData } = await supabase.from('monthly_applications').select('*').eq('year_month', ym)
    
    const allowMap: Record<string, any> = {}
    const schedMap: Record<string, any> = {}
    appData?.forEach((a: any) => {
        if (a.application_type === 'allowance') allowMap[a.user_id] = a
        else schedMap[a.user_id] = a
    })
    setAllowanceStatuses(allowMap)
    setScheduleStatuses(schedMap)

    setAllowances(allowData || [])
    setSchedules(schedData || [])

    const uMap = new Map<string, string>()
    allowData?.forEach((a: any) => { if(a.user_email) uMap.set(a.user_id, a.user_email) })
    schedData?.forEach((s: any) => { if(s.user_email && !uMap.has(s.user_id)) uMap.set(s.user_id, s.user_email) })
    setUserList(Array.from(uMap.entries()).map(([id, email]) => ({ id, email })))

    setLoading(false)
  }

  const fetchMasters = async () => {
    const { data: users } = await supabase.from('user_profiles').select('*')
    const pMap: Record<string, string> = {}
    users?.forEach((u: any) => pMap[u.email] = u.full_name)
    setUserProfiles(pMap)

    const { data: patterns } = await supabase.from('work_patterns').select('*')
    const tMap: Record<string, {start:string, end:string}> = {}
    patterns?.forEach((p: any) => tMap[p.code] = { start: p.start_time, end: p.end_time })
    setPatternDefs(tMap)
  }

  const addTime = (curr: number, timeStr: string | null) => {
    if (!timeStr || !timeStr.includes(':')) return curr
    const [hStr, mStr] = timeStr.split(':')
    const h = parseInt(hStr, 10); const m = parseInt(mStr, 10)
    if (isNaN(h) || isNaN(m)) return curr
    return curr + (h * 60) + m
  }

  const formatMinutes = (minutes: number) => {
    if (!minutes || minutes === 0 || isNaN(minutes)) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}:${String(m).padStart(2, '0')}`
  }

  const aggregateData = () => {
    const targets = selectedUserId === 'all' ? userList : userList.filter(u => u.id === selectedUserId)
    const result = targets.map(user => {
        const myAllowances = allowances.filter(a => a.user_id === user.id)
        const mySchedules = schedules.filter(s => s.user_id === user.id)
        const allowApp = allowanceStatuses[user.id] || {}
        const schedApp = scheduleStatuses[user.id] || {}

        const row: any = {
            id: user.id,
            name: userProfiles[user.email] || user.email, 
            email: user.email,
            allowStatus: allowApp.status || 'draft',
            schedStatus: schedApp.status || 'draft',
            allowApprovedAt: allowApp.approved_at,
            schedApprovedAt: schedApp.approved_at,
            total_amount: myAllowances.reduce((sum, a) => sum + a.amount, 0),
            allowance_count: myAllowances.length,
            allowance_details: myAllowances,
            patterns: {},
            annual_leave_start: 20,
            annual_leave_used: 0,
            annual_leave_remain: 20,
            time_totals: {},
            schedule_details: mySchedules
        }

        TIME_ITEMS.forEach(t => row.time_totals[t.key] = 0)
        mySchedules.forEach(s => {
            if (s.work_pattern_code) row.patterns[s.work_pattern_code] = (row.patterns[s.work_pattern_code] || 0) + 1
            if (s.leave_annual === '1日') row.annual_leave_used += 1.0
            if (s.leave_annual === '半日') row.annual_leave_used += 0.5
            TIME_ITEMS.forEach(t => { if (s[t.key]) row.time_totals[t.key] = addTime(row.time_totals[t.key], s[t.key]) })
        })
        row.annual_leave_remain = row.annual_leave_start - row.annual_leave_used
        return row
    })
    setAggregatedData(result)
  }

  const updateStatus = async (userId: string, type: 'allowance' | 'schedule', newStatus: string) => {
    const actionName = newStatus === 'approved' ? '承認' : '差し戻し'
    if (!confirm(`${actionName}しますか？`)) return
    const ym = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`
    await supabase.from('monthly_applications').upsert({
        user_id: userId, year_month: ym, application_type: type,
        status: newStatus, approved_at: newStatus === 'approved' ? new Date().toISOString() : null
    })
    fetchData(selectedMonth)
  }

  const handleDeleteAllowance = async (id: number) => {
    if (!confirm('削除しますか？')) return
    await supabase.from('allowances').delete().eq('id', id)
    fetchData(selectedMonth)
  }

  const fmtDate = (iso: string) => {
      if (!iso) return ''
      const d = new Date(iso)
      return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
  }

  const downloadAllowanceExcel = () => {
    const wb = XLSX.utils.book_new()
    const y = selectedMonth.getFullYear()
    const m = selectedMonth.getMonth() + 1
    const rows: any[] = []
    
    aggregatedData.forEach(user => {
        let header = `【${user.name}】`
        if (user.allowStatus === 'approved') {
            header += `  [承認済: ${fmtDate(user.allowApprovedAt)}  承認者: 友野・武田事務長]`
        }
        rows.push({ "日付": header })
        if (user.allowance_details.length > 0) {
            const sorted = [...user.allowance_details].sort((a,b) => a.date.localeCompare(b.date))
            sorted.forEach((d: any) => {
                rows.push({ "氏名": user.name, "日付": d.date, "業務内容": d.activity_type, "区分": d.destination_type || '-', "詳細": d.destination_detail || '-', "金額": d.amount })
            })
            rows.push({ "氏名": "合計", "金額": user.total_amount })
        } else { rows.push({ "氏名": "支給なし" }) }
        rows.push({}) 
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, "手当明細")
    XLSX.writeFile(wb, `特殊勤務手当_${y}年${m}月.xlsx`)
  }

  const downloadMonthlyScheduleExcel = () => {
    const wb = XLSX.utils.book_new()
    const y = selectedMonth.getFullYear()
    const m = selectedMonth.getMonth() + 1
    const ws = createScheduleSheet(y, m, schedules)
    XLSX.utils.book_append_sheet(wb, ws, `${m}月`)
    XLSX.writeFile(wb, `勤務実績表_${y}年${m}月.xlsx`)
  }

  const downloadAnnualScheduleExcel = async () => {
    if (!confirm('出力しますか？')) return
    setDownloading(true)
    try {
        const wb = XLSX.utils.book_new()
        const currentY = selectedMonth.getFullYear()
        const currentM = selectedMonth.getMonth() + 1
        const fiscalYear = currentM < 4 ? currentY - 1 : currentY
        const startDate = `${fiscalYear}-04-01`
        const endDate = `${fiscalYear + 1}-03-31`
        const { data: annualSchedules } = await supabase.from('daily_schedules').select('*').gte('date', startDate).lte('date', endDate).order('date')
        const safeSchedules = annualSchedules || []
        for (let i = 0; i < 12; i++) {
            const targetMonthIndex = 3 + i 
            const d = new Date(fiscalYear, targetMonthIndex, 1)
            const sheetYear = d.getFullYear()
            const sheetMonth = d.getMonth() + 1
            const monthlyData = safeSchedules.filter((s: any) => { const sDate = new Date(s.date); return sDate.getFullYear() === sheetYear && (sDate.getMonth() + 1) === sheetMonth })
            const ws = createScheduleSheet(sheetYear, sheetMonth, monthlyData)
            XLSX.utils.book_append_sheet(wb, ws, `${sheetMonth}月`)
        }
        XLSX.writeFile(wb, `勤務実績表_${fiscalYear}年度.xlsx`)
    } catch (e) { alert('出力エラー'); console.error(e) } finally { setDownloading(false) }
  }

  const createScheduleSheet = (year: number, month: number, sourceData: any[]) => {
    const lastDay = new Date(year, month, 0).getDate()
    const allDates: string[] = []
    for (let d = 1; d <= lastDay; d++) { allDates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`) }
    const rows: any[] = []
    const targets = selectedUserId === 'all' ? userList : userList.filter(u => u.id === selectedUserId)

    targets.forEach(u => {
        const name = userProfiles[u.email] || u.email
        let header = `■ 勤務実績表: ${name} (${year}年${month}月)`
        const isCurrentViewMonth = year === selectedMonth.getFullYear() && month === (selectedMonth.getMonth() + 1)
        if (isCurrentViewMonth && scheduleStatuses[u.id]?.status === 'approved') {
            const date = scheduleStatuses[u.id].approved_at
            header += `  [承認済: ${fmtDate(date)}  承認者: 小松・武田事務長]`
        }
        rows.push({ "日付": header })
        const headerRow: any = { "日付": "日付", "氏名": "氏名", "勤務形態": "勤務形態", "開始時間": "開始時間", "終了時間": "終了時間", "年休": "年休" }
        TIME_ITEMS.forEach(t => headerRow[t.label] = t.label)
        rows.push(headerRow)
        allDates.forEach(dateStr => {
            const sched = sourceData.find((s: any) => s.user_id === u.id && s.date === dateStr)
            const pattern = sched?.work_pattern_code
            const times = pattern ? patternDefs[pattern] : null
            const row: any = {
                "日付": dateStr, "氏名": name, "勤務形態": pattern || '',
                "開始時間": times ? times.start.slice(0, 5) : '', "終了時間": times ? times.end.slice(0, 5) : '',
                "年休": sched?.leave_annual || ''
            }
            TIME_ITEMS.forEach(t => { const raw = sched ? sched[t.key] : ''; row[t.label] = raw })
            rows.push(row)
        })
        rows.push({}); rows.push({})
    })
    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true })
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, ...TIME_ITEMS.map(() => ({ wch: 10 }))]
    return ws
  }

  // ★修正: CSV実行処理（ファイルを選んでボタンを押す形式）
  const processUpload = async (type: 'master' | 'patterns') => {
    const file = type === 'master' ? masterFile : patternFile
    if (!file) { alert('ファイルを選択してください'); return }
    if (!confirm('データを登録しますか？既存データは更新されます。')) return

    setUploading(true)
    const reader = new FileReader()
    
    reader.onload = async (evt) => {
        try {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer)
            const wb = XLSX.read(data, { type: 'array' })
            const sheet = wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
            let count = 0
            const cleanRows = rows.filter(row => row.length > 0)

            for (const row of cleanRows) {
                if (type === 'master') {
                    let dateStr = String(row[0]).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/\//g, '-')
                    const code = row[1]
                    if (!isNaN(Number(row[0])) && Number(row[0]) > 40000) { const d = new Date((Number(row[0]) - 25569) * 86400 * 1000); dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
                    if (dateStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) { const [y, m, d] = dateStr.split('-'); const fmtDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; await supabase.from('master_schedules').upsert({ date: fmtDate, work_pattern_code: code }, { onConflict: 'date' }); count++ }
                } else if (type === 'patterns') {
                    const code = row[0]; const start = row[1]; const end = row[2]
                    if (code && start && end) { await supabase.from('work_patterns').upsert({ code, start_time: start, end_time: end }, { onConflict: 'code' }); count++ }
                }
            }
            alert(`${count}件のデータを登録しました！`)
            if(type === 'master') setMasterFile(null)
            else setPatternFile(null)
            fetchMasters()
            fetchData(selectedMonth)
        } catch (e: any) { alert('読込エラー: ' + e.message) } finally { setUploading(false) }
    }
    reader.readAsArrayBuffer(file)
  }

  if (!isAdmin) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <h1 className="font-bold text-lg">事務担当者用ダッシュボード</h1>
        <div className="flex gap-4 items-center">
            <button onClick={() => router.push('/')} className="text-xs bg-slate-600 px-4 py-2 rounded hover:bg-slate-500 font-bold">アプリに戻る</button>
        </div>
      </div>

      <div className="max-w-[95%] mx-auto p-6 space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow border border-slate-200">
          <div className="flex items-center gap-4">
            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold">‹</button>
            <span className="text-2xl font-extrabold text-slate-800 w-40 text-center">{selectedMonth.getFullYear()}年 {selectedMonth.getMonth() + 1}月</span>
            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold">›</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600">表示対象:</span>
            <select className="p-2 border border-slate-300 rounded font-bold text-sm" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="all">全員を表示</option>
                {userList.map(u => (<option key={u.id} value={u.id}>{userProfiles[u.email] ? `${userProfiles[u.email]} (${u.email})` : u.email}</option>))}
            </select>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setViewMode('allowance')} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'allowance' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-500'}`}>💰 表示:手当</button>
             <button onClick={() => setViewMode('schedule')} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'schedule' ? 'bg-green-600 text-white shadow' : 'bg-slate-100 text-slate-500'}`}>⏰ 表示:勤務</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow border border-slate-200 flex flex-wrap gap-4 items-center justify-end">
            <span className="text-sm font-bold text-slate-500 mr-auto">帳票出力メニュー:</span>
            <button onClick={downloadAllowanceExcel} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow flex items-center gap-2">💰 手当帳票 (.xlsx)</button>
            <div className="h-8 w-px bg-slate-300 mx-2"></div>
            <button onClick={downloadMonthlyScheduleExcel} className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-green-700 shadow flex items-center gap-2">📅 月間 勤務表 (.xlsx)</button>
            <button onClick={downloadAnnualScheduleExcel} disabled={downloading} className="bg-green-800 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-green-900 shadow flex items-center gap-2">{downloading ? '⏳ 出力中...' : '📅 年間 勤務表 (4月-3月)'}</button>
        </div>

        {/* テーブル表示部分は省略せずそのまま記述 */}
        {loading ? <div className="text-center py-20 text-slate-500 font-bold animate-pulse">データを集計中...</div> : (
          <div className="bg-white rounded-xl shadow overflow-hidden border border-slate-200">
            {viewMode === 'allowance' && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-white">
                        <tr><th className="p-4 font-bold w-1/4">氏名 (手当ステータス)</th><th className="p-4 font-bold text-right w-1/6">支給合計額</th><th className="p-4 font-bold">内訳</th><th className="p-4 font-bold w-32 text-center">承認操作</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {aggregatedData.map((user, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                            <td className="p-4 font-bold align-top">
                                <div>{user.name}</div>
                                {user.allowStatus === 'submitted' && <span className="inline-block bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded border border-yellow-300 mt-1">⏳ 申請中</span>}
                                {user.allowStatus === 'approved' && <div className="mt-1"><span className="inline-block bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded border border-green-300">🈴 承認済</span><div className="text-[10px] text-slate-400 mt-1">{fmtDate(user.allowApprovedAt)}</div></div>}
                            </td>
                            <td className="p-4 text-right font-extrabold text-blue-700 align-top text-lg">¥{user.total_amount.toLocaleString()}</td>
                            <td className="p-4">
                                <div className="flex flex-wrap gap-2">
                                    {user.allowance_details.map((d: any) => (<div key={d.id} className="bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm flex items-center gap-3"><span className="font-bold text-slate-700">{d.date.slice(8)}日</span><span className="text-slate-600 text-xs">{d.activity_type}</span><span className="font-bold text-blue-600">¥{d.amount.toLocaleString()}</span><button onClick={() => handleDeleteAllowance(d.id)} className="text-slate-300 hover:text-red-500 text-lg leading-none">×</button></div>))}
                                </div>
                            </td>
                            <td className="p-4 text-center">
                                {user.allowStatus === 'submitted' && <button onClick={() => updateStatus(user.id, 'allowance', 'approved')} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-blue-700 w-full mb-2">手当承認</button>}
                                {(user.allowStatus === 'submitted' || user.allowStatus === 'approved') && <button onClick={() => updateStatus(user.id, 'allowance', 'draft')} className="bg-slate-200 text-slate-600 px-3 py-1 rounded text-xs font-bold hover:bg-slate-300 w-full">差し戻し</button>}
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            )}
            {viewMode === 'schedule' && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-800 text-white">
                        <tr>
                        <th className="p-4 font-bold sticky left-0 bg-slate-800 z-10 border-r border-slate-600 w-48"><div className="flex justify-between items-center"><span>氏名 (勤務ステータス)</span><span className="text-[10px] font-normal opacity-70">承認操作</span></div></th>
                        <th className="p-4 font-bold text-center bg-orange-900 border-l border-slate-600" colSpan={3}>年休管理</th>
                        <th className="p-4 font-bold border-l border-slate-600">勤務形態</th>
                        {TIME_ITEMS.map(item => <th key={item.key} className="p-4 font-bold text-center border-l border-slate-600 min-w-[80px]">{item.label}</th>)}
                        </tr>
                        <tr className="bg-orange-800 text-xs text-orange-100"><th className="sticky left-0 bg-slate-800 z-10 border-r border-slate-600"></th><th className="p-1 text-center border-l border-orange-700">使用</th><th className="p-1 text-center border-l border-orange-700">残</th><th className="p-1 text-center border-l border-orange-700">時休計</th><th className="border-l border-slate-600"></th>{TIME_ITEMS.map(i => <th key={i.key} className="border-l border-slate-600"></th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {aggregatedData.map((user, i) => (
                        <tr key={i} className="hover:bg-yellow-50 transition-colors text-slate-900">
                            <td className="p-4 font-bold sticky left-0 bg-white border-r border-slate-200 z-10 align-top">
                                <div className="mb-2">{user.name}</div>
                                <div className="flex flex-col gap-1 mb-2">
                                    {user.schedStatus === 'submitted' && <span className="inline-block bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded border border-yellow-300 text-center">⏳ 申請中</span>}
                                    {user.schedStatus === 'approved' && <><span className="inline-block bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded border border-green-300 text-center">🈴 承認済</span><span className="text-[9px] text-slate-400 text-center">{fmtDate(user.schedApprovedAt)}</span></>}
                                </div>
                                {user.schedStatus === 'submitted' && <button onClick={() => updateStatus(user.id, 'schedule', 'approved')} className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-green-700 w-full mb-1">勤務承認</button>}
                                {(user.schedStatus === 'submitted' || user.schedStatus === 'approved') && <button onClick={() => updateStatus(user.id, 'schedule', 'draft')} className="bg-slate-200 text-slate-600 px-3 py-1 rounded text-xs font-bold hover:bg-slate-300 w-full">差し戻し</button>}
                            </td>
                            <td className="p-4 text-center font-bold text-orange-700 border-l border-slate-100 bg-orange-50/20">{user.annual_leave_used > 0 ? `-${user.annual_leave_used}` : '-'}</td>
                            <td className="p-4 text-center border-l border-slate-100 bg-orange-50/20"><span className={`px-2 py-1 rounded font-bold ${user.annual_leave_remain < 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{user.annual_leave_remain}</span></td>
                            <td className="p-4 text-center font-bold text-slate-600 border-l border-slate-100 bg-orange-50/20">{formatMinutes(user.time_totals['leave_hourly']) || '-'}</td>
                            <td className="p-4 text-xs border-l border-slate-100"><div className="flex flex-wrap gap-1">{Object.entries(user.patterns).map(([code, count]) => <span key={code} className="px-1.5 py-0.5 rounded border bg-slate-100 border-slate-200"><b>{code as string}</b>:{count as number}</span>)}</div></td>
                            {TIME_ITEMS.map(item => <td key={item.key} className={`p-4 text-center border-l border-slate-100 ${user.time_totals[item.key] > 0 ? 'font-bold bg-yellow-50' : 'text-slate-300'}`}>{formatMinutes(user.time_totals[item.key]) || '-'}</td>)}
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">📅 ① カレンダー予定登録</h3>
                <p className="text-xs text-slate-500 mb-4">全員の予定を一括登録（日付, パターン）</p>
                <input type="file" accept=".csv" onChange={(e) => setMasterFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                <button onClick={() => processUpload('master')} disabled={!masterFile || uploading} className="mt-4 w-full bg-blue-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-blue-700 active:scale-95 active:bg-blue-800 transition-all disabled:opacity-50 disabled:active:scale-100">
                    登録を実行する
                </button>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">⏰ ② 勤務時間定義</h3>
                <p className="text-xs text-slate-500 mb-4">A=8:15...を定義（コード, 開始, 終了）</p>
                <input type="file" accept=".csv" onChange={(e) => setPatternFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                <button onClick={() => processUpload('patterns')} disabled={!patternFile || uploading} className="mt-4 w-full bg-blue-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-blue-700 active:scale-95 active:bg-blue-800 transition-all disabled:opacity-50 disabled:active:scale-100">
                    登録を実行する
                </button>
            </div>
        </div>
      </div>
    </div>
  )
}