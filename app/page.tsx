'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { ACTIVITY_TYPES, DESTINATIONS, calculateAmount } from '@/utils/allowanceRules'

// ★管理者のメールアドレスリスト
const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
]

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

const formatDate = (date: Date) => {
  const y = date.getFullYear()
  const m = ('00' + (date.getMonth() + 1)).slice(-2)
  const d = ('00' + date.getDate()).slice(-2)
  return `${y}-${m}-${d}`
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  const [allowances, setAllowances] = useState<Allowance[]>([])
  
  // 入力フォームの状態
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dayType, setDayType] = useState<string>('---') // 勤務形態
  const [activityId, setActivityId] = useState<string>('') // 初期値は空にする
  const [destinationId, setDestinationId] = useState<string>('school')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [isDriving, setIsDriving] = useState(false)
  const [isAccommodation, setIsAccommodation] = useState(false)
  const [calculatedAmount, setCalculatedAmount] = useState(0)

  // ユーザー情報
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email || '')
      fetchAllowances()
    }
    init()
  }, [])

  // 日付が変わったら「勤務区分」を取得
  useEffect(() => {
    const updateDayInfo = async () => {
      const dateStr = formatDate(selectedDate)
      const { data } = await supabase
        .from('school_calendar')
        .select('day_type')
        .eq('date', dateStr)
        .single()
      
      const type = data?.day_type || (selectedDate.getDay() % 6 === 0 ? '休日(仮)' : '勤務日(仮)')
      setDayType(type)
      
      // 日付が変わったら、不適切な選択肢をリセットする
      setActivityId('') 
    }
    updateDayInfo()
  }, [selectedDate])

  // 金額自動計算
  useEffect(() => {
    // "勤務日"や"授業"が含まれていれば勤務日扱い
    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
    
    // activityIdが空の場合は0円
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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activityId) {
      alert('業務内容を選択してください')
      return
    }
    
    const dateStr = formatDate(selectedDate)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('allowances').insert({
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

    if (error) alert('エラー: ' + error.message)
    else fetchAllowances()
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('削除しますか？')) return
    const { error } = await supabase.from('allowances').delete().eq('id', id)
    if (!error) fetchAllowances()
  }

  // ★重要: 勤務形態に応じて選択肢をフィルタリング
  const getFilteredActivities = () => {
    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
    
    return ACTIVITY_TYPES.filter(type => {
      // 勤務日の場合、休日用の業務（A, B）は除外
      if (isWorkDay) {
        if (type.id === 'A' || type.id === 'B') return false
      }
      return true
    })
  }

  // 表示月の変更操作
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

  // 表示中の月の合計
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

  // カレンダーのドット表示
  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const dateStr = formatDate(date)
    const hasData = allowances.some(item => item.date === dateStr)
    return hasData ? <div className="flex justify-center mt-1"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div></div> : null
  }

  const isAdmin = ADMIN_EMAILS.includes(userEmail)

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
       {isAdmin && (
        <div className="bg-slate-800 text-white text-center py-2 text-xs">
          <a href="/admin" className="underline">事務担当者ページ（管理画面）</a>
        </div>
      )}

      {/* スタイリッシュなヘッダー（月切り替え付き） */}
      <div className="bg-white px-6 py-4 rounded-b-3xl shadow-sm mb-6 sticky top-0 z-10">
        <div className="flex flex-col items-center">
          
          {/* 月切り替えコントロール */}
          <div className="flex items-center gap-4 mb-2">
            <button onClick={handlePrevMonth} className="text-slate-400 hover:text-blue-600 p-2 text-xl font-bold">
              ‹
            </button>
            <h2 className="text-sm text-slate-500 font-bold">
              {selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月
            </h2>
            <button onClick={handleNextMonth} className="text-slate-400 hover:text-blue-600 p-2 text-xl font-bold">
              ›
            </button>
          </div>

          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">
            ¥{calculateMonthTotal().toLocaleString()}
          </h1>
          <p className="text-xs text-slate-300 mt-1">{userEmail}</p>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-6">
        
        {/* カレンダー */}
        <div className="bg-white p-4 rounded-3xl shadow-sm">
          {/* カレンダー自体のナビゲーションは隠して、上のヘッダーで操作するスタイルでも良いが、
              機能維持のため標準表示のままにします。activeStartDateを制御すれば連動可能です */}
          <Calendar
            onChange={(val) => setSelectedDate(val as Date)}
            value={selectedDate}
            activeStartDate={selectedDate} // これでヘッダー操作とカレンダー表示が連動します
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
            
            {/* ① 業務内容（フィルタリング適用） */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">業務内容</label>
              <select 
                value={activityId} 
                onChange={(e) => setActivityId(e.target.value)}
                className="w-full bg-slate-100 p-3 rounded-lg outline-none font-bold text-slate-700 text-sm"
              >
                <option value="">選択してください</option>
                {getFilteredActivities().map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
              {/* 入力制限のメッセージ */}
              {dayType.includes('勤務日') && (
                <p className="text-[10px] text-orange-400 mt-1 text-right">※勤務日のため一部の項目は選択できません</p>
              )}
            </div>

            {/* ② 目的地 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">区分</label>
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

            {/* ③④ 運転・宿泊 */}
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

            {/* ⑤ 金額表示 */}
            <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center">
              <span className="text-xs font-medium">支給予定額</span>
              <span className="text-xl font-bold">¥{calculatedAmount.toLocaleString()}</span>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={!activityId}>
              登録する
            </button>
          </form>
        </div>
        
        {/* 履歴リスト（選択月のデータのみ表示） */}
        <div className="space-y-2 pb-10">
            <h3 className="font-bold text-slate-400 text-xs px-2">{selectedDate.getMonth() + 1}月の履歴</h3>
            {allowances.filter(item => {
                const d = new Date(item.date);
                return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear();
            }).length === 0 ? (
                <p className="text-center text-slate-300 text-sm py-4">履歴はありません</p>
            ) : (
                allowances
                .filter(item => {
                    const d = new Date(item.date);
                    return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear();
                })
                .map((item) => (
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
                ))
            )}
        </div>
      </div>
    </div>
  )
}