'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
// 作成した計算ロジックを読み込み
import { ACTIVITY_TYPES, DESTINATIONS, calculateAmount } from '@/utils/allowanceRules'

// 管理者リスト
const ADMIN_EMAILS = ['mitamuraka@haguroko.ed.jp'] 

// 型定義の拡張
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
  const [activityId, setActivityId] = useState<string>('A')
  const [destinationId, setDestinationId] = useState<string>('school')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [isDriving, setIsDriving] = useState(false)
  const [isAccommodation, setIsAccommodation] = useState(false)
  const [calculatedAmount, setCalculatedAmount] = useState(0)

  // ユーザー情報
  const [userEmail, setUserEmail] = useState('')

  // 初期ロード
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email || '')
      fetchAllowances()
    }
    init()
  }, [])

  // 日付が変わったら「勤務区分」をデータベースから取得
  useEffect(() => {
    const updateDayInfo = async () => {
      const dateStr = formatDate(selectedDate)
      
      // school_calendarテーブルから検索
      const { data } = await supabase
        .from('school_calendar')
        .select('day_type')
        .eq('date', dateStr)
        .single()
      
      // データがあればそれを表示、なければ「未登録」または曜日判定
      if (data) {
        setDayType(data.day_type)
      } else {
        // カレンダーデータがない場合の予備ロジック（土日判定）
        const day = selectedDate.getDay()
        setDayType(day === 0 || day === 6 ? '休日(仮)' : '勤務日(仮)')
      }
    }
    updateDayInfo()
  }, [selectedDate])

  // 入力値が変わるたびに金額を自動計算（utilsのロジックを使用）
  useEffect(() => {
    // "勤務日"という文字が含まれていれば勤務日扱いとする
    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業日')
    const amt = calculateAmount(activityId, isDriving, destinationId, isWorkDay)
    setCalculatedAmount(amt)
  }, [activityId, isDriving, destinationId, dayType])

  const fetchAllowances = async () => {
    const { data } = await supabase.from('allowances').select('*').order('date', { ascending: false })
    setAllowances(data || [])
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const dateStr = formatDate(selectedDate)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 保存処理
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

  // 今月の合計計算
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

      {/* ヘッダー */}
      <div className="bg-white px-6 py-6 rounded-b-3xl shadow-sm mb-6 sticky top-0 z-10">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-slate-500 font-bold">
              {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月
            </p>
            <h1 className="text-3xl font-extrabold text-slate-800">
              ¥{calculateMonthTotal().toLocaleString()}
            </h1>
          </div>
          <p className="text-xs text-slate-400 self-center">{dayType}</p>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-6">
        {/* カレンダー */}
        <div className="bg-white p-4 rounded-3xl shadow-sm">
          <Calendar
            onChange={(val) => setSelectedDate(val as Date)}
            value={selectedDate}
            locale="ja-JP"
            tileContent={getTileContent}
            className="w-full border-none"
          />
        </div>

        {/* 入力フォーム */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="font-bold text-slate-700 text-sm">
              {selectedDate.getMonth() + 1}/{selectedDate.getDate()} の実績登録
            </h2>
            <span className={`text-xs px-2 py-1 rounded font-bold ${dayType.includes('休日') || dayType.includes('週休') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              {dayType}
            </span>
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            
            {/* ① 業務内容 */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">業務内容</label>
              <select 
                value={activityId} 
                onChange={(e) => setActivityId(e.target.value)}
                className="w-full bg-slate-100 p-3 rounded-lg outline-none font-bold text-slate-700 text-sm"
              >
                {ACTIVITY_TYPES.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
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

            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-md">
              登録する
            </button>
          </form>
        </div>
        
        {/* 履歴リスト */}
        <div className="space-y-2">
            {allowances.filter(item => {
                const d = new Date(item.date);
                return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear();
            }).map((item) => (
              <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center">
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
                  <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500">🗑</button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}