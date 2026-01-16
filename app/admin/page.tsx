'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx' // Excel出力用

// ★管理者メールアドレス
const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

// 集計項目定義
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
  const [aggregatedData, setAggregatedData] = useState<any[]>([]) // 集計済みデータ
  
  const [viewMode, setViewMode] = useState<'summary' | 'details'>('summary') // モード変更

  // 初期化チェック
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

  // データ取得＆集計
  const fetchData = async (date: Date) => {
    setLoading(true)
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const endDate = `${y}-${String(m).padStart(2, '0')}-31`

    // 1. 全データを取得
    const { data: allowData } = await supabase.from('allowances').select('*').gte('date', startDate).lte('date', endDate).order('date')
    const { data: schedData } = await supabase.from('daily_schedules').select('*').gte('date', startDate).lte('date', endDate)
    
    setAllowances(allowData || [])
    setSchedules(schedData || [])

    // 2. ユーザーリストの統合（ここが重要：どちらかにデータがあればリストに載せる）
    const userMap = new Map<string, string>() // ID -> Email
    
    // 手当データからユーザー抽出
    allowData?.forEach((a: any) => { if(a.user_email) userMap.set(a.user_id, a.user_email) })
    // 勤務データからユーザー抽出（waw2716対策）
    schedData?.forEach((s: any) => { 
        if(s.user_email && !userMap.has(s.user_id)) {
            userMap.set(s.user_id, s.user_email)
        }
    })

    // 3. 集計処理
    const aggResult: any[] = []
    
    userMap.forEach((email, userId) => {
        // 個人のデータを抽出
        const myAllowances = allowData?.filter((a: any) => a.user_id === userId) || []
        const mySchedules = schedData?.filter((s: any) => s.user_id === userId) || []

        // 基本情報
        const row: any = {
            id: userId,
            name: email,
            total_amount: myAllowances.reduce((sum: number, a: any) => sum + a.amount, 0),
            allowance_count: myAllowances.length,
            // 勤務パターン集計
            patterns: {},
            // 年休計算 (初期値20日とする)
            annual_leave_start: 20,
            annual_leave_used: 0,
            annual_leave_remain: 20,
            // 時間集計
            time_totals: {}
        }

        // 時間項目の初期化
        TIME_ITEMS.forEach(t => row.time_totals[t.key] = 0)

        // スケジュール解析
        mySchedules.forEach((s: any) => {
            // パターンカウント
            if (s.work_pattern_code) {
                row.patterns[s.work_pattern_code] = (row.patterns[s.work_pattern_code] || 0) + 1
            }
            // 年休計算
            if (s.leave_annual === '1日') row.annual_leave_used += 1.0
            if (s.leave_annual === '半日') row.annual_leave_used += 0.5
            
            // 時間計算
            TIME_ITEMS.forEach(t => {
                if (s[t.key]) row.time_totals[t.key] = addTime(row.time_totals[t.key], s[t.key])
            })
        })

        // 残日数計算
        row.annual_leave_remain = row.annual_leave_start - row.annual_leave_used
        
        aggResult.push(row)
    })

    setAggregatedData(aggResult)
    setLoading(false)
  }

  // 時間足し算ヘルパー
  const addTime = (currentMinutes: number, timeStr: string | null) => {
    if (!timeStr || !timeStr.includes(':')) return currentMinutes
    const [h, m] = timeStr.split(':').map(Number)
    return currentMinutes + (h * 60) + m
  }
  
  // 分 -> 時間文字列
  const formatMinutes = (minutes: number) => {
    if (minutes === 0) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}:${String(m).padStart(2, '0')}`
  }

  // --- Excel出力機能 ---
  const downloadExcel = () => {
    const wb = XLSX.utils.book_new()
    const y = selectedMonth.getFullYear()
    const m = selectedMonth.getMonth() + 1

    // データ整形
    const excelData = aggregatedData.map(row => {
        // 動的なキー（時間項目）を展開
        const timeData: any = {}
        TIME_ITEMS.forEach(t => {
            timeData[t.label] = formatMinutes(row.time_totals[t.key]) || '-'
        })
        
        // 勤務パターン文字列化
        const patternStr = Object.entries(row.patterns)
            .map(([k, v]) => `${k}:${v}回`).join(' ')

        return {
            "氏名(Email)": row.name,
            "手当支給額": row.total_amount,
            "手当回数": row.allowance_count,
            "年休(付与)": row.annual_leave_start,
            "年休(使用)": row.annual_leave_used,
            "年休(残)": row.annual_leave_remain,
            "勤務内訳": patternStr,
            ...timeData
        }
    })

    const ws = XLSX.utils.json_to_sheet(excelData)
    
    // 列幅の調整
    const wscols = [
        { wch: 30 }, // Email
        { wch: 10 }, // 金額
        { wch: 8 },  // 回数
        { wch: 8 },  // 年休
        { wch: 8 },  // 年休
        { wch: 8 },  // 年休
        { wch: 20 }, // 勤務内訳
    ]
    ws['!cols'] = wscols

    XLSX.utils.book_append_sheet(wb, ws, `${m}月集計`)
    XLSX.writeFile(wb, `勤務手当集計_${y}年${m}月.xlsx`)
  }

  if (!isAdmin) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* ヘッダー */}
      <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <h1 className="font-bold text-lg">事務担当者用ダッシュボード</h1>
        <div className="flex gap-4 items-center">
            <span className="text-xs text-slate-300">ログイン中: {ADMIN_EMAILS.find(e => e === ADMIN_EMAILS[0]) ? '管理者' : ''}</span>
            <button onClick={() => router.push('/')} className="text-xs bg-slate-600 px-4 py-2 rounded hover:bg-slate-500 font-bold">アプリに戻る</button>
        </div>
      </div>

      <div className="max-w-[95%] mx-auto p-6">
        
        {/* コントロールパネル */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow border border-slate-200">
          
          <div className="flex items-center gap-4">
            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold text-slate-500">‹</button>
            <span className="text-2xl font-extrabold text-slate-800 w-40 text-center">{selectedMonth.getFullYear()}年 {selectedMonth.getMonth() + 1}月</span>
            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-slate-100 rounded text-xl font-bold text-slate-500">›</button>
          </div>

          <div className="flex gap-4">
             {/* モード切替は一旦廃止して、一画面で見せる形式に変更（見やすさ優先） */}
             <button onClick={downloadExcel} className="bg-green-600 text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-green-700 shadow flex items-center gap-2 transition-transform active:scale-95">
               📊 Excel出力 (.xlsx)
             </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500 font-bold animate-pulse">データを集計中...</div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden border border-slate-200">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="p-4 font-bold sticky left-0 bg-slate-800 z-10 border-r border-slate-600">氏名 (メールアドレス)</th>
                      <th className="p-4 font-bold text-center bg-blue-900 border-l border-slate-600">手当支給額</th>
                      
                      {/* 年休エリア */}
                      <th className="p-4 font-bold text-center bg-orange-900 border-l border-slate-600" colSpan={3}>年休管理 (20日基準)</th>
                      
                      <th className="p-4 font-bold text-left min-w-[150px] border-l border-slate-600">勤務パターン回数</th>
                      
                      {/* 時間集計エリア */}
                      {TIME_ITEMS.map(item => (
                        <th key={item.key} className="p-4 font-bold text-center border-l border-slate-600 min-w-[80px]">{item.label}</th>
                      ))}
                    </tr>
                    {/* サブヘッダー（年休の内訳用） */}
                    <tr className="bg-orange-800 text-xs text-orange-100">
                        <th className="sticky left-0 bg-slate-800 z-10 border-r border-slate-600"></th>
                        <th className="bg-blue-800 border-l border-slate-600"></th>
                        
                        <th className="p-1 text-center border-l border-orange-700">使用</th>
                        <th className="p-1 text-center border-l border-orange-700">残日数</th>
                        <th className="p-1 text-center border-l border-orange-700">時間休計</th>
                        
                        <th className="border-l border-slate-600"></th>
                        {TIME_ITEMS.map(i => <th key={i.key} className="border-l border-slate-600"></th>)}
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-slate-200">
                    {aggregatedData.length === 0 ? (
                      <tr><td colSpan={25} className="p-10 text-center text-slate-400 font-bold">この月のデータはありません</td></tr>
                    ) : (
                      aggregatedData.map((user, i) => (
                        <tr key={i} className="hover:bg-yellow-50 transition-colors text-slate-900">
                          
                          {/* 名前 */}
                          <td className="p-4 font-bold sticky left-0 bg-white border-r border-slate-200 z-10">
                            {user.name}
                          </td>
                          
                          {/* 金額 */}
                          <td className="p-4 text-right font-extrabold text-blue-700 border-l border-slate-100 bg-blue-50/30">
                            ¥{user.total_amount.toLocaleString()}
                          </td>

                          {/* 年休: 使用日数 */}
                          <td className="p-4 text-center font-bold text-orange-700 border-l border-slate-100 bg-orange-50/20">
                            {user.annual_leave_used > 0 ? `-${user.annual_leave_used}日` : '-'}
                          </td>
                          
                          {/* 年休: 残り日数 (わかりやすくバッジ表示) */}
                          <td className="p-4 text-center border-l border-slate-100 bg-orange-50/20">
                            <span className={`px-2 py-1 rounded font-bold ${user.annual_leave_remain < 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                                残 {user.annual_leave_remain}日
                            </span>
                          </td>

                          {/* 年休: 時間休の合計 */}
                          <td className="p-4 text-center font-bold text-slate-600 border-l border-slate-100 bg-orange-50/20">
                             {formatMinutes(user.time_totals['leave_hourly']) || '-'}
                          </td>

                          {/* 勤務パターン内訳 */}
                          <td className="p-4 text-xs border-l border-slate-100">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(user.patterns).map(([code, count]) => (
                                <span key={code} className={`px-1.5 py-0.5 rounded border ${String(code).includes('休') ? 'bg-red-50 border-red-200 text-red-600' : 'bg-slate-100 border-slate-200'}`}>
                                  <b>{code as string}</b>: {count as number}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* 各時間の詳細 */}
                          {TIME_ITEMS.map(item => (
                            <td key={item.key} className={`p-4 text-center border-l border-slate-100 ${user.time_totals[item.key] > 0 ? 'font-bold bg-yellow-50' : 'text-slate-300'}`}>
                              {formatMinutes(user.time_totals[item.key]) || '-'}
                            </td>
                          ))}

                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}