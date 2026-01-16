'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

const TIME_ITEMS = [
  { key: 'leave_hourly', label: '時間年休' },
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
  const [users, setUsers] = useState<{id: string, email: string}[]>([]) 
  const [selectedUser, setSelectedUser] = useState<string>('all') 
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
    const endDate = `${y}-${String(m).padStart(2, '0')}-31`

    const { data: allowData } = await supabase.from('allowances').select('*').gte('date', startDate).lte('date', endDate).order('date')
    const { data: schedData } = await supabase.from('daily_schedules').select('*').gte('date', startDate).lte('date', endDate)
    
    // ★修正: ユーザーリストを両方のテーブルから作成
    const userMap = new Map()
    allowData?.forEach((a: any) => { if(a.user_email) userMap.set(a.user_id, a.user_email) })
    schedData?.forEach((s: any) => { if(s.user_email) userMap.set(s.user_id, s.user_email) }) // schedule側のemailも使用

    const userList = Array.from(userMap.entries()).map(([id, email]) => ({ id, email }))
    setUsers(userList)

    setAllowances(allowData || [])
    setSchedules(schedData || [])
    setLoading(false)
  }

  const downloadCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    
    if (viewMode === 'allowance') {
      csvContent += "氏名(Email),支給合計額,回数,内訳\n";
      aggregateAllowances().forEach(row => {
        const details = row.details.map((d: any) => `${d.date.slice(8)}日:${d.activity_type}`).join(' / ');
        csvContent += `${row.name},${row.total},${row.count},"${details}"\n`;
      });
    } else {
      const header = ["氏名", "勤務形態(回数)", "年休(日)", ...TIME_ITEMS.map(t => t.label)].join(",");
      csvContent += header + "\n";
      aggregateSchedules().forEach(row => {
        const patterns = Object.entries(row.patterns).map(([k, v]) => `${k}:${v}`).join(' ');
        const times = TIME_ITEMS.map(t => formatMinutes(row.time_totals[t.key])).join(",");
        csvContent += `${row.name},"${patterns}",${row.leave_annual_days},${times}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `allowance_report_${selectedMonth.getFullYear()}_${selectedMonth.getMonth()+1}_${viewMode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const aggregateAllowances = () => {
    const agg: Record<string, { name: string, total: number, count: number, details: any[] }> = {}
    allowances.forEach(row => {
      if (selectedUser !== 'all' && row.user_id !== selectedUser) return;
      const key = row.user_id
      if (!agg[key]) agg[key] = { name: row.user_email, total: 0, count: 0, details: [] }
      agg[key].total += row.amount
      agg[key].count += 1
      agg[key].details.push(row)
    })
    return Object.values(agg)
  }

  const addTime = (currentMinutes: number, timeStr: string | null) => {
    if (!timeStr || !timeStr.includes(':')) return currentMinutes
    const [h, m] = timeStr.split(':').map(Number)
    return currentMinutes + (h * 60) + m
  }
  
  const formatMinutes = (minutes: number) => {
    if (minutes === 0) return '-'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}:${String(m).padStart(2, '0')}`
  }

  const aggregateSchedules = () => {
    const agg: Record<string, any> = {}
    
    schedules.forEach(row => {
      if (selectedUser !== 'all' && row.user_id !== selectedUser) return;

      const key = row.user_id
      if (!agg[key]) {
        // user_emailがdaily_schedulesにあればそれを使う、なければallowancesから探す
        let email = row.user_email 
        if (!email) {
            const foundUser = users.find(u => u.id === key)
            email = foundUser ? foundUser.email : key.slice(0, 8) + '...'
        }

        agg[key] = {
          name: email,
          patterns: {},
          leave_annual_days: 0,
          time_totals: {},
        }
        TIME_ITEMS.forEach(item => agg[key].time_totals[item.key] = 0)
      }

      if (row.work_pattern_code) {
        const code = row.work_pattern_code
        agg[key].patterns[code] = (agg[key].patterns[code] || 0) + 1
      }

      if (row.leave_annual === '1日') agg[key].leave_annual_days += 1
      if (row.leave_annual === '半日') agg[key].leave_annual_days += 0.5

      TIME_ITEMS.forEach(item => {
        if (row[item.key]) {
          agg[key].time_totals[item.key] = addTime(agg[key].time_totals[item.key], row[item.key])
        }
      })
    })
    return Object.values(agg)
  }

  if (!isAdmin) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <h1 className="font-bold text-lg">事務担当者用ダッシュボード</h1>
        <button onClick={() => router.push('/')} className="text-xs bg-slate-600 px-3 py-1 rounded hover:bg-slate-500">戻る</button>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold">‹</button>
            <span className="text-xl font-bold w-32 text-center">{selectedMonth.getFullYear()}年 {selectedMonth.getMonth() + 1}月</span>
            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold">›</button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">表示対象:</span>
            <select 
              value={selectedUser} 
              onChange={(e) => setSelectedUser(e.target.value)}
              className="p-2 border border-slate-300 rounded text-sm font-bold min-w-[200px]"
            >
              <option value="all">全員を表示</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-4">
             <div className="flex bg-slate-100 p-1 rounded-lg">
               <button onClick={() => setViewMode('allowance')} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'allowance' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>💰 手当集計</button>
               <button onClick={() => setViewMode('schedule')} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'schedule' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>⏰ 勤務集計</button>
             </div>
             <button onClick={downloadCSV} className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 shadow-sm flex items-center gap-1">
               📥 CSV出力
             </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-500">読み込み中...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
            {viewMode === 'allowance' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600 border-b">
                    <tr>
                      <th className="p-4 font-bold">氏名 (Email)</th>
                      <th className="p-4 font-bold text-right">支給合計額</th>
                      <th className="p-4 font-bold text-right">回数</th>
                      <th className="p-4 font-bold">内訳（日付: 内容）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aggregateAllowances().length === 0 ? (
                      <tr><td colSpan={4} className="p-6 text-center text-slate-400">データがありません</td></tr>
                    ) : (
                      aggregateAllowances().map((user: any, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-4 font-bold">{user.name}</td>
                          <td className="p-4 text-right font-bold text-blue-600">¥{user.total.toLocaleString()}</td>
                          <td className="p-4 text-right">{user.count}回</td>
                          <td className="p-4 text-xs text-slate-500 max-w-md">
                            <div className="flex flex-wrap gap-1">
                              {user.details.map((d: any) => (
                                <span key={d.id} className="bg-slate-100 px-1.5 py-0.5 rounded border">
                                  {d.date.slice(8)}日:{d.activity_type}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {viewMode === 'schedule' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-green-50 text-green-800 border-b border-green-100">
                    <tr>
                      <th className="p-3 font-bold sticky left-0 bg-green-50 z-10 border-r">氏名</th>
                      <th className="p-3 font-bold min-w-[150px]">勤務形態 (回数)</th>
                      <th className="p-3 font-bold text-center bg-yellow-50/50">年休 (日)</th>
                      {TIME_ITEMS.map(item => (
                        <th key={item.key} className="p-3 font-bold text-center border-l border-slate-100">{item.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aggregateSchedules().length === 0 ? (
                      <tr><td colSpan={20} className="p-6 text-center text-slate-400">データがありません</td></tr>
                    ) : (
                      aggregateSchedules().map((user: any, i) => (
                        <tr key={i} className="hover:bg-slate-50 text-slate-900">
                          <td className="p-3 font-bold sticky left-0 bg-white border-r z-10">{user.name}</td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              {Object.entries(user.patterns).map(([code, count]) => (
                                <span key={code} className="font-mono bg-slate-100 px-1.5 rounded text-xs border border-slate-200">
                                  <strong className={String(code).includes('休') ? 'text-red-500' : ''}>{code as string}</strong>:{count as number}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold bg-yellow-50/30">
                            {user.leave_annual_days > 0 ? user.leave_annual_days + '日' : '-'}
                          </td>
                          {TIME_ITEMS.map(item => (
                            <td key={item.key} className={`p-3 text-center border-l border-slate-100 ${user.time_totals[item.key] > 0 ? 'font-bold' : 'text-slate-300'}`}>
                              {formatMinutes(user.time_totals[item.key])}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
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