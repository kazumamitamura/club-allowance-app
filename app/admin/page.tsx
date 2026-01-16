'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

// ★管理者メールアドレス
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
  
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [allowances, setAllowances] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [aggregatedData, setAggregatedData] = useState<any[]>([])
  const [userList, setUserList] = useState<{id: string, email: string}[]>([]) // ユーザー一覧
  const [selectedUserId, setSelectedUserId] = useState<string>('all') // 選択フィルター
  
  const [viewMode, setViewMode] = useState<'allowance' | 'schedule'>('allowance')

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
    }
    checkAdmin()
  }, [])

  // フィルタリング処理（データまたは選択ユーザーが変わったら再集計）
  useEffect(() => {
    aggregateData()
  }, [allowances, schedules, selectedUserId])

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

    // 全データ取得
    const { data: allowData } = await supabase.from('allowances').select('*').gte('date', startDate).lte('date', endDate).order('date')
    const { data: schedData } = await supabase.from('daily_schedules').select('*').gte('date', startDate).lte('date', endDate).order('date')
    
    setAllowances(allowData || [])
    setSchedules(schedData || [])

    // ユーザーリスト更新
    const uMap = new Map<string, string>()
    allowData?.forEach((a: any) => { if(a.user_email) uMap.set(a.user_id, a.user_email) })
    schedData?.forEach((s: any) => { if(s.user_email && !uMap.has(s.user_id)) uMap.set(s.user_id, s.user_email) })
    setUserList(Array.from(uMap.entries()).map(([id, email]) => ({ id, email })))

    setLoading(false)
  }

  // 集計ロジック
  const aggregateData = () => {
    // ユーザーリストをベースに集計（フィルタリング適用）
    const targets = selectedUserId === 'all' ? userList : userList.filter(u => u.id === selectedUserId)
    
    const result = targets.map(user => {
        const myAllowances = allowances.filter(a => a.user_id === user.id)
        const mySchedules = schedules.filter(s => s.user_id === user.id)

        const row: any = {
            id: user.id,
            name: user.email,
            total_amount: myAllowances.reduce((sum, a) => sum + a.amount, 0),
            allowance_count: myAllowances.length,
            allowance_details: myAllowances,
            patterns: {},
            annual_leave_start: 20,
            annual_leave_used: 0,
            annual_leave_remain: 20,
            time_totals: {},
            schedule_details: mySchedules // 詳細用
        }

        TIME_ITEMS.forEach(t => row.time_totals[t.key] = 0)

        mySchedules.forEach(s => {
            if (s.work_pattern_code) row.patterns[s.work_pattern_code] = (row.patterns[s.work_pattern_code] || 0) + 1
            if (s.leave_annual === '1日') row.annual_leave_used += 1.0
            if (s.leave_annual === '半日') row.annual_leave_used += 0.5
            
            TIME_ITEMS.forEach(t => {
                if (s[t.key]) row.time_totals[t.key] = addTime(row.time_totals[t.key], s[t.key])
            })
        })
        row.annual_leave_remain = row.annual_leave_start - row.annual_leave_used
        return row
    })
    setAggregatedData(result)
  }

  // 削除機能
  const handleDeleteAllowance = async (id: number) => {
    if (!confirm('削除しますか？')) return
    await supabase.from('allowances').delete().eq('id', id)
    fetchData(selectedMonth)
  }

  const addTime = (curr: number, timeStr: string | null) => {
    if (!timeStr || !timeStr.includes(':')) return curr
    const [h, m] = timeStr.split(':').map(Number)
    return curr + (h * 60) + m
  }
  const formatMinutes = (mins: number) => {
    if (mins === 0) return ''
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h}:${String(m).padStart(2, '0')}`
  }

  // --- Excel出力 (詳細版) ---
  const downloadExcel = () => {
    const wb = XLSX.utils.book_new()
    const y = selectedMonth.getFullYear()
    const m = selectedMonth.getMonth() + 1

    // 1. サマリーシート (全員または選択した人の合計)
    const summaryData = aggregatedData.map(row => {
        const timeData: any = {}
        TIME_ITEMS.forEach(t => timeData[t.label] = formatMinutes(row.time_totals[t.key]) || '-')
        return {
            "氏名": row.name,
            "手当合計": row.total_amount,
            "手当回数": row.allowance_count,
            "年休(残)": row.annual_leave_remain,
            "勤務内訳": Object.entries(row.patterns).map(([k, v]) => `${k}:${v}`).join(' '),
            ...timeData
        }
    })
    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, "サマリー")

    // 2. 詳細シート (Aさんのデータ... Bさんのデータ... と続く)
    const detailRows: any[] = []
    
    aggregatedData.forEach(user => {
        // ヘッダー的な行
        detailRows.push({ "日付": `【${user.name}】` }) 
        
        // 日付順にマージして出力するためのマップ
        const dateMap = new Map<string, any>()
        
        // 勤務データの展開
        user.schedule_details.forEach((s: any) => {
            if(!dateMap.has(s.date)) dateMap.set(s.date, { date: s.date, type: '勤務', info: s.work_pattern_code || '', amount: 0 })
            else {
                const d = dateMap.get(s.date)
                d.info += ` ${s.work_pattern_code || ''}`
            }
        })
        
        // 手当データの展開
        user.allowance_details.forEach((a: any) => {
            if(!dateMap.has(a.date)) dateMap.set(a.date, { date: a.date, type: '手当', info: a.activity_type, amount: a.amount })
            else {
                const d = dateMap.get(a.date)
                d.info += ` / ${a.activity_type}`
                d.amount += a.amount
            }
        })

        // 日付でソートして行に追加
        const sortedDates = Array.from(dateMap.keys()).sort()
        sortedDates.forEach(date => {
            const d = dateMap.get(date)
            detailRows.push({
                "氏名": user.name,
                "日付": d.date,
                "勤務/内容": d.info,
                "金額": d.amount > 0 ? d.amount : ''
            })
        })
        detailRows.push({}) // 空行を入れる
    })

    const wsDetails = XLSX.utils.json_to_sheet(detailRows)
    // 列幅調整
    wsDetails['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 40 }, { wch: 10 }]
    
    XLSX.utils.book_append_sheet(wb, wsDetails, "詳細データ")
    XLSX.writeFile(wb, `勤務手当詳細_${y}年${m}月.xlsx`)
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

      <div className="max-w-[95%] mx-auto p-6">
        
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow border border-slate-200">
          <div className="flex items-center gap-4">
            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold text-slate-500">‹</button>
            <span className="text-2xl font-extrabold text-slate-800 w-40 text-center">{selectedMonth.getFullYear()}年 {selectedMonth.getMonth() + 1}月</span>
            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold text-slate-500">›</button>
          </div>

          {/* ユーザー選択 */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600">表示対象:</span>
            <select 
                className="p-2 border border-slate-300 rounded font-bold text-sm"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
            >
                <option value="all">全員を表示</option>
                {userList.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>

          <div className="flex gap-4 items-center">
             <div className="flex bg-slate-100 p-1 rounded-lg">
               <button onClick={() => setViewMode('allowance')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'allowance' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>💰 手当</button>
               <button onClick={() => setViewMode('schedule')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'schedule' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>⏰ 勤務表</button>
             </div>
             <button onClick={downloadExcel} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-green-700 shadow flex items-center gap-2">
               📥 Excel出力
             </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500 font-bold animate-pulse">データを集計中...</div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden border border-slate-200">
            
            {/* === 手当集計モード === */}
            {viewMode === 'allowance' && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-white">
                        <tr>
                        <th className="p-4 font-bold w-1/4">氏名</th>
                        <th className="p-4 font-bold text-right w-1/6">支給合計額</th>
                        <th className="p-4 font-bold">内訳（削除可能）</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {aggregatedData.length === 0 && <tr><td colSpan={3} className="p-10 text-center text-slate-400">データがありません</td></tr>}
                        {aggregatedData.map((user, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                            <td className="p-4 font-bold align-top">{user.name}</td>
                            <td className="p-4 text-right font-extrabold text-blue-700 align-top text-lg">
                                ¥{user.total_amount.toLocaleString()}
                                <div className="text-xs text-slate-400 font-normal mt-1">{user.allowance_count}回</div>
                            </td>
                            <td className="p-4">
                                <div className="flex flex-wrap gap-2">
                                    {user.allowance_details.map((d: any) => (
                                    <div key={d.id} className="bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm flex items-center gap-3">
                                        <span className="font-bold text-slate-700">{d.date.slice(8)}日</span>
                                        <span className="text-slate-600 text-xs">{d.activity_type}</span>
                                        <span className="font-bold text-blue-600">¥{d.amount.toLocaleString()}</span>
                                        <button onClick={() => handleDeleteAllowance(d.id)} className="text-slate-300 hover:text-red-500 text-lg leading-none" title="削除">×</button>
                                    </div>
                                    ))}
                                </div>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            )}

            {/* === 勤務表集計モード === */}
            {viewMode === 'schedule' && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-800 text-white">
                        <tr>
                        <th className="p-4 font-bold sticky left-0 bg-slate-800 z-10 border-r border-slate-600">氏名</th>
                        <th className="p-4 font-bold text-center bg-orange-900 border-l border-slate-600" colSpan={3}>年休管理</th>
                        <th className="p-4 font-bold border-l border-slate-600">勤務形態</th>
                        {TIME_ITEMS.map(item => (
                            <th key={item.key} className="p-4 font-bold text-center border-l border-slate-600 min-w-[80px]">{item.label}</th>
                        ))}
                        </tr>
                        <tr className="bg-orange-800 text-xs text-orange-100">
                            <th className="sticky left-0 bg-slate-800 z-10 border-r border-slate-600"></th>
                            <th className="p-1 text-center border-l border-orange-700">使用</th>
                            <th className="p-1 text-center border-l border-orange-700">残</th>
                            <th className="p-1 text-center border-l border-orange-700">時休計</th>
                            <th className="border-l border-slate-600"></th>
                            {TIME_ITEMS.map(i => <th key={i.key} className="border-l border-slate-600"></th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {aggregatedData.length === 0 && <tr><td colSpan={20} className="p-10 text-center text-slate-400">データがありません</td></tr>}
                        {aggregatedData.map((user, i) => (
                        <tr key={i} className="hover:bg-yellow-50 transition-colors text-slate-900">
                            <td className="p-4 font-bold sticky left-0 bg-white border-r border-slate-200 z-10">{user.name}</td>
                            <td className="p-4 text-center font-bold text-orange-700 border-l border-slate-100 bg-orange-50/20">{user.annual_leave_used > 0 ? `-${user.annual_leave_used}` : '-'}</td>
                            <td className="p-4 text-center border-l border-slate-100 bg-orange-50/20">
                                <span className={`px-2 py-1 rounded font-bold ${user.annual_leave_remain < 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{user.annual_leave_remain}</span>
                            </td>
                            <td className="p-4 text-center font-bold text-slate-600 border-l border-slate-100 bg-orange-50/20">{formatMinutes(user.time_totals['leave_hourly']) || '-'}</td>
                            <td className="p-4 text-xs border-l border-slate-100">
                                <div className="flex flex-wrap gap-1">
                                    {Object.entries(user.patterns).map(([code, count]) => (
                                        <span key={code} className="px-1.5 py-0.5 rounded border bg-slate-100 border-slate-200"><b>{code as string}</b>:{count as number}</span>
                                    ))}
                                </div>
                            </td>
                            {TIME_ITEMS.map(item => (
                                <td key={item.key} className={`p-4 text-center border-l border-slate-100 ${user.time_totals[item.key] > 0 ? 'font-bold bg-yellow-50' : 'text-slate-300'}`}>{formatMinutes(user.time_totals[item.key]) || '-'}</td>
                            ))}
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}