'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { ACTIVITY_TYPES, DESTINATIONS, calculateAmount } from '@/utils/allowanceRules'

// ★管理者のメールアドレス
const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

type Allowance = {
  id: number
  user_id: string
  user_email: string
  date: string
  activity_type: string
  amount: number
  destination_type: string
  destination_detail: string
  is_driving: boolean
  is_accommodation: boolean
}

type WorkPattern = {
  id: number
  code: string
  start_time: string
  end_time: string
  description: string
}

// 休暇の種類の定義
const LEAVE_TYPES = [
  { id: '', label: 'なし (通常勤務)' },
  { id: '年休(1日)', label: '年休 (1日)' },
  { id: '年休(半日)', label: '年休 (半日)' },
  { id: '年休(時間)', label: '年休 (時間)' },
  { id: '特休', label: '特休 (慶弔等)' },
  { id: '振休', label: '振替休日' },
  { id: '欠勤', label: '欠勤' },
  { id: '育児', label: '育児休暇' },
  { id: '介護', label: '介護休暇' },
]

const formatDate = (date: Date) => {
  const y = date.getFullYear()
  const m = ('00' + (date.getMonth() + 1)).slice(-2)
  const d = ('00' + date.getDate()).slice(-2)
  return `${y}-${m}-${d}`
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  
  const [userEmail, setUserEmail] = useState('')
  const [allowances, setAllowances] = useState<Allowance[]>([])
  const [workPatterns, setWorkPatterns] = useState<WorkPattern[]>([])
  
  // 入力フォームの状態
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dayType, setDayType] = useState<string>('---')
  
  // 勤務・休暇
  const [selectedPattern, setSelectedPattern] = useState('C')
  const [leaveType, setLeaveType] = useState('')
  const [leaveDuration, setLeaveDuration] = useState('')
  
  // 手当関連
  const [activityId, setActivityId] = useState<string>('')
  const [destinationId, setDestinationId] = useState<string>('school')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [isDriving, setIsDriving] = useState(false)
  const [isAccommodation, setIsAccommodation] = useState(false)
  const [calculatedAmount, setCalculatedAmount] = useState(0)

  // 既に登録済みかどうかのフラグ
  const [isRegistered, setIsRegistered] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email || '')
      fetchAllowances()
      const { data: patterns } = await supabase.from('work_patterns').select('*').order('code')
      if (patterns) setWorkPatterns(patterns)
    }
    init()
  }, [])

  useEffect(() => {
    const updateDayInfo = async () => {
      const dateStr = formatDate(selectedDate)
      
      // 1. 学校カレンダー取得
      const { data: calendarData } = await supabase
        .from('school_calendar')
        .select('day_type')
        .eq('date', dateStr)
        .single()
      
      const type = calendarData?.day_type || (selectedDate.getDay() % 6 === 0 ? '休日(仮)' : '勤務日(仮)')
      setDayType(type)
      
      // 2. 個人の勤務・休暇スケジュールの取得
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: scheduleData } = await supabase
          .from('daily_schedules')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .single()
        
        if (scheduleData) {
          setIsRegistered(true)
          setSelectedPattern(scheduleData.work_pattern_code || 'C')
          setLeaveType(scheduleData.leave_type || '')
          setLeaveDuration(scheduleData.leave_duration || '')
        } else {
          setIsRegistered(false)
          // 未登録時は、曜日等からデフォルト判定（本来はCSVマスタから取得）
          setSelectedPattern('C') 
          setLeaveType('')
          setLeaveDuration('')
        }
      }

      // 3. 手当情報の取得（既存があればセット）
      const allowance = allowances.find(a => a.date === dateStr)
      if (allowance) {
        setActivityId(allowance.activity_type === allowance.activity_type ? 
          (ACTIVITY_TYPES.find(t => t.label === allowance.activity_type)?.id || allowance.activity_type) : '')
        setDestinationId(DESTINATIONS.find(d => d.label === allowance.destination_type)?.id || 'school')
        setDestinationDetail(allowance.destination_detail || '')
        setIsDriving(allowance.is_driving)
        setIsAccommodation(allowance.is_accommodation)
      } else {
        // リセット
        setActivityId('')
        setDestinationId('school')
        setDestinationDetail('')
        setIsDriving(false)
        setIsAccommodation(false)
      }
    }
    updateDayInfo()
  }, [selectedDate, allowances])

  useEffect(() => {
    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
    if (!activityId) {
      setCalculatedAmount(0)
      return
    }
    const amt = calculateAmount(activityId, isDriving, destinationId, isWorkDay)
    setCalculatedAmount(amt)
  }, [activityId, isDriving, destinationId, dayType])

  const fetchAllowances = async () => {
    const { data } = await supabase.from('allowances').select('*').order('date', { ascending: false })
    setAllowances(data || [])
  }

  // --- 保存処理 ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const dateStr = formatDate(selectedDate)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. 勤務・休暇の保存
    const { error: scheduleError } = await supabase
      .from('daily_schedules')
      .upsert({
        user_id: user.id,
        date: dateStr,
        work_pattern_code: selectedPattern,
        leave_type: leaveType,
        leave_duration: leaveDuration ? parseFloat(leaveDuration) : null
      }, { onConflict: 'user_id, date' })

    if (scheduleError) console.error(scheduleError)

    // 2. 部活動手当の保存（業務内容が選択されている場合のみ）
    if (activityId) {
      const { error: allowanceError } = await supabase.from('allowances').upsert({
        user_id: user.id,
        user_email: user.email,
        date: dateStr,
        activity_type: ACTIVITY_TYPES.find(a => a.id === activityId)?.label || activityId,
        destination_type: DESTINATIONS.find(d => d.id === destinationId)?.label,
        destination_detail: destinationDetail,
        is_driving: isDriving,
        is_accommodation: isAccommodation,
        amount: calculatedAmount,
      }, { onConflict: 'user_id, date' } as any) // dateとuser_idで重複チェックしたいが、allowancesテーブルの制約による。一旦Insert/Update運用
      
      // 注: allowancesテーブルにunique制約がない場合、delete -> insertの方が安全だが、
      // 簡易的にInsertし、重複は運用でカバー、または既存IDがあればUpdateするロジックが必要。
      // ここでは既存IDがあれば削除して入れ直す方式をとる（シンプル化）
      
      // 既存の手当を削除
      await supabase.from('allowances').delete().eq('user_id', user.id).eq('date', dateStr)
      
      // 新規追加
      await supabase.from('allowances').insert({
        user_id: user.id,
        user_email: user.email,
        date: dateStr,
        activity_type: ACTIVITY_TYPES.find(a => a.id === activityId)?.label || activityId,
        destination_type: DESTINATIONS.find(d => d.id === destinationId)?.label,
        destination_detail: destinationDetail,
        is_driving: isDriving,
        is_accommodation: isAccommodation,
        amount: calculatedAmount,
      })

      fetchAllowances()
    } else {
        // 業務内容が空なら手当データは削除（休暇のみ登録のケース）
        await supabase.from('allowances').delete().eq('user_id', user.id).eq('date', dateStr)
        fetchAllowances()
    }
    
    setIsRegistered(true)
    alert('保存しました')
  }

  // --- 一括登録機能（Excelのコピペ代わり） ---
  const handleBulkRegister = async () => {
    if (!confirm(`${selectedDate.getMonth()+1}月の未入力日を、すべて「デフォルト勤務（C）」として一括登録しますか？\n（すでに入力済みの日は上書きされません）`)) return
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()
    const lastDay = new Date(year, month + 1, 0).getDate()
    
    const updates = []
    
    for (let d = 1; d <= lastDay; d++) {
        const current = new Date(year, month, d)
        const dateStr = formatDate(current)
        
        // 既に登録があるかチェックしたいが、一括でupsert(ignore duplicates)するのが早い
        // ここでは「未登録の日だけ」というロジックをSQLのON CONFLICT DO NOTHINGで実現する
        updates.push({
            user_id: user.id,
            date: dateStr,
            work_pattern_code: 'C', // ※本来はCSVマスタからその日の予定を取得する
            leave_type: '',
            leave_duration: null
        })
    }

    const { error } = await supabase
        .from('daily_schedules')
        .upsert(updates, { onConflict: 'user_id, date', ignoreDuplicates: true })

    if (error) alert('エラー: ' + error.message)
    else {
        alert('一括登録が完了しました！')
        router.refresh()
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('削除しますか？')) return
    const { error } = await supabase.from('allowances').delete().eq('id', id)
    if (!error) fetchAllowances()
  }
  
  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }
  const handlePrevMonth = () => { const d = new Date(selectedDate); d.setMonth(d.getMonth() - 1); setSelectedDate(d) }
  const handleNextMonth = () => { const d = new Date(selectedDate); d.setMonth(d.getMonth() + 1); setSelectedDate(d) }
  const calculateMonthTotal = () => {
    const m = selectedDate.getMonth(), y = selectedDate.getFullYear()
    return allowances.filter(i => { const d = new Date(i.date); return d.getMonth() === m && d.getFullYear() === y }).reduce((s, i) => s + i.amount, 0)
  }
  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const dateStr = formatDate(date)
    const hasData = allowances.some(i => i.date === dateStr)
    return hasData ? <div className="flex justify-center mt-1"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div></div> : null
  }
  const isAdmin = ADMIN_EMAILS.includes(userEmail.toLowerCase())
  const currentPatternDetail = workPatterns.find(p => p.code === selectedPattern)

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
       {isAdmin && (
        <div className="bg-slate-800 text-white text-center py-3 text-sm font-bold shadow-md">
          <a href="/admin" className="underline hover:text-blue-300 transition">事務担当者ページへ</a>
        </div>
      )}

      {/* ヘッダー */}
      <div className="bg-white px-6 py-4 rounded-b-3xl shadow-sm mb-6 sticky top-0 z-10">
        <button onClick={handleLogout} className="absolute right-4 top-4 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-2 rounded-full">ログアウト</button>
        <div className="flex flex-col items-center mt-2">
          <div className="flex items-center gap-4 mb-2">
            <button onClick={handlePrevMonth} className="text-slate-400 p-2 text-xl font-bold">‹</button>
            <h2 className="text-sm text-slate-500 font-bold">{selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月</h2>
            <button onClick={handleNextMonth} className="text-slate-400 p-2 text-xl font-bold">›</button>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-800">¥{calculateMonthTotal().toLocaleString()}</h1>
          
          {/* 一括登録ボタン */}
          <button 
            onClick={handleBulkRegister}
            className="mt-3 text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full border border-blue-200 hover:bg-blue-100 shadow-sm"
          >
            📋 今月の予定を一括登録 (コピペ)
          </button>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-6">
        <div className="bg-white p-4 rounded-3xl shadow-sm">
          <Calendar onChange={(val) => setSelectedDate(val as Date)} value={selectedDate} activeStartDate={selectedDate} onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setSelectedDate(activeStartDate)} locale="ja-JP" tileContent={getTileContent} className="w-full border-none" />
        </div>

        <div className={`p-6 rounded-3xl shadow-sm border ${isRegistered ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="font-bold text-slate-700 text-sm">{selectedDate.getMonth() + 1}/{selectedDate.getDate()} の勤務・手当</h2>
            <span className={`text-xs px-2 py-1 rounded font-bold ${isRegistered ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-500'}`}>
              {isRegistered ? '登録済' : '未登録'}
            </span>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            
            {/* 勤務パターン */}
            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-500 mb-1">勤務パターン</label>
              <div className="flex items-center gap-2">
                <select 
                  value={selectedPattern} 
                  onChange={(e) => setSelectedPattern(e.target.value)}
                  className="flex-1 bg-white p-2 rounded border border-slate-300 font-bold text-slate-900"
                >
                  {workPatterns.map(p => (
                    <option key={p.id} value={p.code}>{p.code} ({p.start_time.slice(0,5)}-{p.end_time.slice(0,5)})</option>
                  ))}
                </select>
                <div className="text-xs text-slate-500 w-1/3 text-right">{currentPatternDetail?.description}</div>
              </div>

              {/* 休暇・変更 */}
              <label className="block text-xs font-bold text-slate-500 mt-3 mb-1">休暇・変更 (任意)</label>
              <div className="flex gap-2">
                <select 
                   value={leaveType}
                   onChange={(e) => setLeaveType(e.target.value)}
                   className="flex-1 bg-white p-2 rounded border border-slate-300 text-slate-900 text-xs font-bold"
                >
                    {LEAVE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {leaveType === '年休(時間)' && (
                    <input 
                        type="number" 
                        placeholder="時間"
                        value={leaveDuration}
                        onChange={(e) => setLeaveDuration(e.target.value)}
                        className="w-20 p-2 rounded border border-slate-300 text-slate-900 text-xs"
                    />
                )}
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 部活動手当入力エリア */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">部活動 業務内容</label>
              <select 
                value={activityId} 
                onChange={(e) => setActivityId(e.target.value)}
                className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 font-bold text-slate-900 text-sm"
              >
                <option value="">なし (部活なし)</option>
                {ACTIVITY_TYPES.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>

            {activityId && (
            <>
                <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">区分</label>
                    <select 
                    value={destinationId} 
                    onChange={(e) => setDestinationId(e.target.value)}
                    className="w-full bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-900 font-bold"
                    >
                    {DESTINATIONS.map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">詳細 (会場名等)</label>
                    <input 
                    type="text" 
                    placeholder="例: 県体育館"
                    value={destinationDetail}
                    onChange={(e) => setDestinationDetail(e.target.value)}
                    className="w-full bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                    />
                </div>
                </div>

                <div className="flex gap-3">
                <label className={`flex-1 p-3 rounded-lg cursor-pointer border text-center text-xs font-bold ${isDriving ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                    <input type="checkbox" checked={isDriving} onChange={e => setIsDriving(e.target.checked)} className="hidden" />
                    🚗 運転あり
                </label>
                <label className={`flex-1 p-3 rounded-lg cursor-pointer border text-center text-xs font-bold ${isAccommodation ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                    <input type="checkbox" checked={isAccommodation} onChange={e => setIsAccommodation(e.target.checked)} className="hidden" />
                    🏨 宿泊あり
                </label>
                </div>
                
                <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center">
                    <span className="text-xs font-medium">支給予定額</span>
                    <span className="text-xl font-bold">¥{calculatedAmount.toLocaleString()}</span>
                </div>
            </>
            )}

            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-md">
              この内容で保存する
            </button>
          </form>
        </div>

        {/* 履歴リスト */}
        <div className="space-y-2 pb-10">
            <h3 className="font-bold text-slate-400 text-xs px-2">{selectedDate.getMonth() + 1}月の手当履歴</h3>
            {allowances.filter(i => {
                 const d = new Date(i.date); return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear()
            }).map((item) => (
            <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border border-slate-100">
                <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-700 text-sm">{item.date.split('-')[2]}日</span>
                    <span className="text-xs text-slate-500">{item.activity_type}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 text-sm">¥{item.amount.toLocaleString()}</span>
                    <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500">🗑</button>
                </div>
            </div>
            ))}
        </div>
      </div>
    </div>
  )
}