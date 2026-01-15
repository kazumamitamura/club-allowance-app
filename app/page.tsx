'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
// カレンダー部品のインポート
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css' // カレンダーの見た目（CSS）

// データの型定義
type Allowance = {
  id: number
  user_id: string
  date: string
  activity_type: string
  amount: number
}

// 日付を「YYYY-MM-DD」形式の文字に変換する便利関数
const formatDate = (date: Date) => {
  const y = date.getFullYear()
  const m = ('00' + (date.getMonth() + 1)).slice(-2)
  const d = ('00' + date.getDate()).slice(-2)
  return `${y}-${m}-${d}`
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()

  // データの入れ物
  const [allowances, setAllowances] = useState<Allowance[]>([])
  const [loading, setLoading] = useState(true)

  // 入力フォームの入れ物
  // 初期値は「今日」にします
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [activityType, setActivityType] = useState('部活動指導')
  const [amount, setAmount] = useState('3600')

  // 画面が開いたときに実行される処理
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

  // データを読み込む関数
  const fetchAllowances = async () => {
    const { data, error } = await supabase
      .from('allowances')
      .select('*')
      .order('date', { ascending: false })

    if (error) console.error('Error:', error)
    else setAllowances(data || [])
    
    setLoading(false)
  }

  // ログアウト処理
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 登録ボタンを押したときの処理
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // カレンダーで選んでいる日付を文字に変換（例: 2026-01-15）
    const dateStr = formatDate(selectedDate)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('allowances').insert({
      user_id: user.id,
      date: dateStr, // 選んだ日付で保存
      activity_type: activityType,
      amount: Number(amount),
    })

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert(`${dateStr} のデータを登録しました！`)
      fetchAllowances()
    }
  }

  // その日にすでに登録済みかチェックする関数（カレンダーのドット表示用）
  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const dateStr = formatDate(date)
    // その日のデータがあるか探す
    const hasData = allowances.some(item => item.date === dateStr)
    
    if (hasData) {
      return <div className="flex justify-center mt-1"><div className="w-2 h-2 bg-blue-500 rounded-full"></div></div>
    }
    return null
  }

  if (loading) return <div className="p-10 text-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-slate-800">特殊勤務手当管理</h1>
          <button onClick={handleLogout} className="text-xs text-red-500 border border-red-500 px-3 py-1 rounded hover:bg-red-50">
            ログアウト
          </button>
        </div>

        {/* カレンダー＆入力エリア */}
        <div className="bg-white p-4 rounded-xl shadow-sm mb-6">
          <h2 className="text-center font-bold text-slate-700 mb-4">
            日付を選択して登録
          </h2>
          
          {/* カレンダー本体 */}
          <div className="mb-6 flex justify-center">
            <Calendar
              onChange={(value) => setSelectedDate(value as Date)}
              value={selectedDate}
              locale="ja-JP" // 日本語対応
              tileContent={getTileContent} // 登録済みの日にマークをつける
              className="rounded-lg border-none shadow-sm text-sm"
            />
          </div>

          {/* 選択中の日付表示 */}
          <div className="text-center mb-4 text-blue-600 font-bold text-lg border-b pb-2">
            {selectedDate.getFullYear()}年
            {selectedDate.getMonth() + 1}月
            {selectedDate.getDate()}日
            <span className="text-sm text-slate-500 ml-2">の登録</span>
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">業務内容</label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full bg-slate-100 p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="部活動指導">部活動指導（3,600円）</option>
                <option value="対外引率">対外引率（4時間以上）</option>
                <option value="その他">その他</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">金額</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-100 p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition shadow-md active:scale-95 transform">
              この内容で登録する
            </button>
          </form>
        </div>

        {/* 履歴リスト */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-100 font-bold text-slate-700 text-sm flex justify-between items-center">
            <span>最近の履歴</span>
            <span className="bg-white px-2 py-1 rounded text-xs text-slate-500 border">{allowances.length}件</span>
          </div>
          {allowances.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">データがありません</div>
          ) : (
            <div>
              {allowances.map((item) => (
                <div key={item.id} className="flex justify-between items-center p-4 border-b last:border-0 hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-700">{item.date}</div>
                    <div className="text-xs text-slate-500">{item.activity_type}</div>
                  </div>
                  <div className="font-bold text-slate-700">¥{item.amount.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}