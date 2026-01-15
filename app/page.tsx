'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'

// データの型定義
type Allowance = {
  id: number
  user_id: string
  date: string
  activity_type: string
  amount: number
}

// 日付フォーマット関数
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
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [activityType, setActivityType] = useState('部活動指導')
  const [amount, setAmount] = useState('3600')

  // データ取得
  useEffect(() => {
    const getData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      fetchAllowances()
    }
    getData()
  }, [])

  const fetchAllowances = async () => {
    const { data, error } = await supabase
      .from('allowances')
      .select('*')
      .order('date', { ascending: false })

    if (error) console.error('Error:', error)
    else setAllowances(data || [])
    
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 登録処理
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const dateStr = formatDate(selectedDate)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('allowances').insert({
      user_id: user.id,
      date: dateStr,
      activity_type: activityType,
      amount: Number(amount),
    })

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      // 登録成功時の演出（アラートなしでリスト更新）
      fetchAllowances()
    }
  }

  // 削除処理（ゴミ箱ボタン）
  const handleDelete = async (id: number) => {
    if (!window.confirm('この記録を削除してもよろしいですか？')) return

    const { error } = await supabase
      .from('allowances')
      .delete()
      .eq('id', id)

    if (error) {
      alert('削除エラー: ' + error.message)
    } else {
      fetchAllowances()
    }
  }

  // 今月の合計金額を計算
  const calculateMonthTotal = () => {
    const targetMonth = selectedDate.getMonth()
    const targetYear = selectedDate.getFullYear()
    
    return allowances
      .filter(item => {
        const itemDate = new Date(item.date)
        return itemDate.getMonth() === targetMonth && itemDate.getFullYear() === targetYear
      })
      .reduce((sum, item) => sum + item.amount, 0)
  }

  // カレンダーのドット表示
  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const dateStr = formatDate(date)
    const hasData = allowances.some(item => item.date === dateStr)
    
    if (hasData) {
      return (
        <div className="flex justify-center mt-1">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-sm"></div>
        </div>
      )
    }
    return null
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* トップヘッダー（合計金額表示） */}
      <div className="bg-white px-6 pt-8 pb-6 rounded-b-3xl shadow-sm mb-6 sticky top-0 z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm text-slate-500 font-bold mb-1">
              {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月
            </p>
            <h1 className="text-3xl font-extrabold text-slate-800">
              ¥{calculateMonthTotal().toLocaleString()}
            </h1>
          </div>
          <button onClick={handleLogout} className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-2 rounded-full hover:bg-slate-200 transition">
            ログアウト
          </button>
        </div>
        <p className="text-xs text-slate-400 font-medium">
          今月の支給予定額（見込み）
        </p>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-6">
        {/* カレンダーカード */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
          <Calendar
            onChange={(value) => setSelectedDate(value as Date)}
            value={selectedDate}
            locale="ja-JP"
            tileContent={getTileContent}
            prev2Label={null}
            next2Label={null}
            className="w-full"
          />
        </div>

        {/* 入力フォームカード */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h2 className="text-center font-bold text-slate-700 mb-4 text-sm">
            {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 の実績を追加
          </h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="w-2/3">
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="w-full bg-slate-50 border-none p-4 rounded-xl text-slate-700 font-bold text-sm focus:ring-2 focus:ring-blue-100 outline-none appearance-none"
                >
                  <option value="部活動指導">部活動指導</option>
                  <option value="対外引率">対外引率</option>
                  <option value="その他">その他</option>
                </select>
              </div>
              <div className="w-1/3 relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-50 border-none p-4 rounded-xl text-slate-700 font-bold text-sm text-center focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <span className="absolute right-2 top-4 text-xs text-slate-400 font-bold">円</span>
              </div>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 active:scale-95 transition shadow-blue-200 shadow-lg">
              追加する
            </button>
          </form>
        </div>

        {/* 履歴リスト */}
        <div>
          <h3 className="font-bold text-slate-400 text-sm mb-3 px-2">最近の履歴</h3>
          <div className="space-y-3">
            {allowances.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">履歴なし</p>
            ) : (
              allowances.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-50 text-blue-600 font-bold text-xs p-3 rounded-xl flex flex-col items-center min-w-[50px]">
                      <span className="text-[10px] opacity-70">{item.date.split('-')[1]}月</span>
                      <span className="text-lg leading-none">{item.date.split('-')[2]}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-700 text-sm">{item.activity_type}</p>
                      <p className="text-xs text-slate-400">ID: {item.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-700">¥{item.amount.toLocaleString()}</span>
                    {/* 削除ボタン */}
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="text-slate-300 hover:text-red-500 p-2 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}