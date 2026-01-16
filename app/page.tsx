'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { ACTIVITY_TYPES, DESTINATIONS, calculateAmount } from '@/utils/allowanceRules'

// ★管理者のメールアドレスリスト（すべて小文字で入力）
const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

// --- 型定義 ---
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
  code: string        // A, B, C...
  start_time: string
  end_time: string
  description: string
}

// 日付を YYYY-MM-DD 形式に変換
const formatDate = (date: Date) => {
  const y = date.getFullYear()
  const m = ('00' + (date.getMonth() + 1)).slice(-2)
  const d = ('00' + date.getDate()).slice(-2)
  return `${y}-${m}-${d}`
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  
  // --- State管理 ---
  const [userEmail, setUserEmail] = useState('')
  const [allowances, setAllowances] = useState<Allowance[]>([])
  
  // 勤務パターン関連
  const [workPatterns, setWorkPatterns] = useState<WorkPattern[]>([])
  const [selectedPattern, setSelectedPattern] = useState('C') // デフォルトC(定時)

  // 入力フォームの状態
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dayType, setDayType] = useState<string>('---')
  const [activityId, setActivityId] = useState<string>('')
  const [destinationId, setDestinationId] = useState<string>('school')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [isDriving, setIsDriving] = useState(false)
  const [isAccommodation, setIsAccommodation] = useState(false)
  const [calculatedAmount, setCalculatedAmount] = useState(0)

  // --- 初期化処理 ---
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email || '')
      
      // 手当履歴の取得
      fetchAllowances()
      
      // 勤務パターンマスタ(A,B,C...)の取得
      const { data: patterns } = await supabase
        .from('work_patterns')
        .select('*')
        .order('code')
      if (patterns) setWorkPatterns(patterns)
    }
    init()
  }, [])

  // --- 日付変更時の処理（勤務情報と予定の取得） ---
  useEffect(() => {
    const updateDayInfo = async () => {
      const dateStr = formatDate(selectedDate)
      
      // 1. 学校カレンダー（休日判定）の取得
      const { data: calendarData } = await supabase
        .from('school_calendar')
        .select('day_type')
        .eq('date', dateStr)
        .single()
      
      const type = calendarData?.day_type || (selectedDate.getDay() % 6 === 0 ? '休日(仮)' : '勤務日(仮)')
      setDayType(type)
      
      // 2. その日の個人の勤務スケジュールを取得
      // （管理者がCSVで入れたデータや、過去に自分で保存したデータがあれば反映）
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: scheduleData } = await supabase
          .from('daily_schedules')
          .select('work_pattern_code')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .single()
        
        if (scheduleData) {
          // 登録済みならそのパターンを表示
          setSelectedPattern(scheduleData.work_pattern_code)
        } else {
          // 未登録ならデフォルト（C:定時）またはカレンダーから推測
          setSelectedPattern('C')
        }
      }

      // フォームのリセット
      setActivityId('') 
    }
    updateDayInfo()
  }, [selectedDate])

  // --- 金額の自動計算 ---
  useEffect(() => {
    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
    if (!activityId) {
      setCalculatedAmount(0)
      return
    }
    const amt = calculateAmount(activityId, isDriving, destinationId, isWorkDay)
    setCalculatedAmount(amt)
  }, [activityId, isDriving, destinationId, dayType])

  // --- データの読み込み ---
  const fetchAllowances = async () => {
    const { data } = await supabase.from('allowances').select('*').order('date', { ascending: false })
    setAllowances(data || [])
  }

  // --- 登録処理（勤務パターン + 手当） ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 業務内容が未選択でも、勤務パターンだけ保存したい場合もあるためチェックを緩和しても良いが、
    // 現状は「手当登録ついでに勤務も登録」というフローにする
    if (!activityId) {
      alert('業務内容を選択してください\n（勤務パターンのみ変更する場合は、開発者に相談してください）')
      return
    }
    
    const dateStr = formatDate(selectedDate)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. 勤務パターンの保存 (daily_schedulesへUpsert)
    // これにより、管理者が入れた予定を自分で上書き調整できる
    const { error: scheduleError } = await supabase
      .from('daily_schedules')
      .upsert({
        user_id: user.id,
        date: dateStr,
        work_pattern_code: selectedPattern
      }, { onConflict: 'user_id, date' })

    if (scheduleError) {
      console.error('勤務パターンの保存失敗:', scheduleError)
    }

    // 2. 手当の保存 (allowancesへInsert)
    const { error: allowanceError } = await supabase.from('allowances').insert({
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

    if (allowanceError) {
      alert('手当の保存エラー: ' + allowanceError.message)
    } else {
      fetchAllowances() // 履歴リストを更新
      alert('登録しました！\n（勤務パターンも更新されました）')
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('削除しますか？')) return
    const { error } = await supabase.from('allowances').delete().eq('id', id)
    if (!error) fetchAllowances()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 月の切り替え
  const handlePrevMonth = () => {
    const newDate = new Date(selectedDate)
    newDate.setMonth(selectedDate.getMonth() - 1)
    setSelectedDate(newDate)
  }
  const handleNextMonth = () => {
    const newDate = new Date(selectedDate)
    newDate.setMonth(selectedDate.getMonth() + 1)
    setSelectedDate(newDate)
  }

  // 合計金額計算
  const calculateMonthTotal = () => {
    const targetMonth = selectedDate.getMonth()
    const targetYear = selectedDate.getFullYear()
    return allowances
      .filter(item => {
        const d = new Date(item.date)
        return d.getMonth() === targetMonth && d.getFullYear() === targetYear
      })
      .reduce((sum, item) => sum + item.amount, 0)
  }

  // カレンダーの「・」マーク表示
  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const dateStr = formatDate(date)
    const hasData = allowances.some(item => item.date === dateStr)
    return hasData ? <div className="flex justify-center mt-1"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div></div> : null
  }

  // 管理者判定
  const isAdmin = ADMIN_EMAILS.includes(userEmail.toLowerCase())
  const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')

  // 選択中の勤務パターンの詳細を取得
  const currentPatternDetail = workPatterns.find(p => p.code === selectedPattern)

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
       {/* 管理者バー */}
       {isAdmin && (
        <div className="bg-slate-800 text-white text-center py-3 text-sm font-bold shadow-md">
          <a href="/admin" className="underline hover:text-blue-300 transition">
            事務担当者ページ（管理画面）へ移動
          </a>
        </div>
      )}

      {/* ヘッダー */}
      <div className="bg-white px-6 py-4 rounded-b-3xl shadow-sm mb-6 sticky top-0 z-10 relative">
        <button 
          onClick={handleLogout} 
          className="absolute right-4 top-4 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-2 rounded-full hover:bg-slate-200"
        >
          ログアウト
        </button>

        <div className="flex flex-col items-center mt-2">
          <div className="flex items-center gap-4 mb-2">
            <button onClick={handlePrevMonth} className="text-slate-400 hover:text-blue-600 p-2 text-xl font-bold">‹</button>
            <h2 className="text-sm text-slate-500 font-bold">
              {selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月
            </h2>
            <button onClick={handleNextMonth} className="text-slate-400 hover:text-blue-600 p-2 text-xl font-bold">›</button>
          </div>

          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">
            ¥{calculateMonthTotal().toLocaleString()}
          </h1>
          <p className="text-xs text-slate-300 mt-1">{userEmail}</p>
          
          <div className="mt-3">
             <a href="/records" className="text-xs font-bold text-blue-500 bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100">
               🏆 大会記録システムへ
             </a>
          </div>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-6">
        
        {/* カレンダー */}
        <div className="bg-white p-4 rounded-3xl shadow-sm">
          <Calendar
            onChange={(val) => setSelectedDate(val as Date)}
            value={selectedDate}
            activeStartDate={selectedDate}
            onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setSelectedDate(activeStartDate)}
            locale="ja-JP"
            tileContent={getTileContent}
            className="w-full border-none"
          />
        </div>

        {/* 入力フォーム */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="font-bold text-slate-700 text-sm">
              {selectedDate.getMonth() + 1}/{selectedDate.getDate()} 実績登録
            </h2>
            <span className={`text-xs px-2 py-1 rounded font-bold ${dayType.includes('休日') || dayType.includes('週休') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              {dayType}
            </span>
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            
            {/* ★ここに追加：勤務パターンの選択 */}
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <label className="block text-xs font-bold text-blue-600 mb-1">本日の勤務パターン</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select 
                    value={selectedPattern} 
                    onChange={(e) => setSelectedPattern(e.target.value)}
                    className="w-full bg-white p-2 pl-3 pr-8 rounded-lg border border-blue-200 font-bold text-slate-700 appearance-none focus:ring-2 focus:ring-blue-400 outline-none"
                  >
                    {workPatterns.map(p => (
                      <option key={p.id} value={p.code}>
                        {p.code} 勤務
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-3 pointer-events-none text-slate-400">▼</div>
                </div>
                
                {/* 勤務時間の表示 */}
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-700">
                    {currentPatternDetail?.start_time.slice(0,5)} - {currentPatternDetail?.end_time.slice(0,5)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {currentPatternDetail?.description}
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 業務内容 */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">部活動業務内容</label>
              <select 
                value={activityId} 
                onChange={(e) => setActivityId(e.target.value)}
                className="w-full bg-slate-100 p-3 rounded-lg outline-none font-bold text-slate-700 text-sm"
              >
                <option value="">選択してください</option>
                {ACTIVITY_TYPES.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
              {isWorkDay && (activityId === 'A' || activityId === 'B') && (
                <p className="text-[10px] text-orange-400 mt-1 text-right">
                  ⚠️ 勤務日ですが、休日手当を選択中です
                </p>
              )}
            </div>

            {/* 目的地 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">区分（運転加算）</label>
                <select 
                  value={destinationId} 
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full bg-slate-100 p-3 rounded-lg outline-none text-xs"
                >
                  {DESTINATIONS.map(d => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">詳細（任意）</label>
                <input 
                  type="text" 
                  placeholder="会場名など"
                  value={destinationDetail}
                  onChange={(e) => setDestinationDetail(e.target.value)}
                  className="w-full bg-slate-100 p-3 rounded-lg outline-none text-xs"
                />
              </div>
            </div>

            {/* 運転・宿泊 */}
            <div className="flex gap-3">
              <label className={`flex-1 p-3 rounded-lg cursor-pointer border transition text-center text-xs font-bold ${isDriving ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                <input type="checkbox" checked={isDriving} onChange={e => setIsDriving(e.target.checked)} className="hidden" />
                🚗 運転あり
              </label>
              <label className={`flex-1 p-3 rounded-lg cursor-pointer border transition text-center text-xs font-bold ${isAccommodation ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                <input type="checkbox" checked={isAccommodation} onChange={e => setIsAccommodation(e.target.checked)} className="hidden" />
                🏨 宿泊あり
              </label>
            </div>

            {/* 金額 */}
            <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center">
              <span className="text-xs font-medium">支給予定額</span>
              <span className="text-xl font-bold">¥{calculatedAmount.toLocaleString()}</span>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={!activityId}>
              登録する
            </button>
            <p className="text-[10px] text-center text-slate-400">
              ※登録ボタンを押すと、勤務パターンも同時に保存されます
            </p>
          </form>
        </div>
        
        {/* 履歴 */}
        <div className="space-y-2 pb-10">
            <h3 className="font-bold text-slate-400 text-xs px-2">{selectedDate.getMonth() + 1}月の履歴</h3>
            {allowances.filter(item => {
                const d = new Date(item.date);
                return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear();
            }).map((item) => (
            <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border border-slate-100">
                <div className="flex items-center gap-3">
                <div className="text-center min-w-[40px]">
                    <span className="block text-xs text-slate-400">{item.date.split('-')[1]}/</span>
                    <span className="block font-bold text-slate-700">{item.date.split('-')[2]}</span>
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-700 line-clamp-1">{item.activity_type}</p>
                    <p className="text-[10px] text-slate-400">
                    {item.destination_type} {item.is_driving ? '🚗' : ''} {item.is_accommodation ? '🏨' : ''}
                    </p>
                </div>
                </div>
                <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 text-sm">¥{item.amount.toLocaleString()}</span>
                <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 p-2">🗑</button>
                </div>
            </div>
            ))}
        </div>
      </div>
    </div>
  )
}