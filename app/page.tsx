'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

// データの型定義
type Allowance = {
  id: number
  user_id: string
  date: string
  activity_type: string
  amount: number
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()

  // データの入れ物
  const [allowances, setAllowances] = useState<Allowance[]>([])
  const [loading, setLoading] = useState(true)

  // 入力フォームの入れ物
  const [date, setDate] = useState('')
  const [activityType, setActivityType] = useState('部活動指導')
  const [amount, setAmount] = useState('3600') // ←ここを文字列に修正しました！

  // 画面が開いたときに実行される処理
  useEffect(() => {
    const getData = async () => {
      // 1. ログインしているかチェック
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // 2. データを取得
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

    if (error) {
      console.error('Error:', error)
    } else {
      setAllowances(data || [])
    }
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
    if (!date) return alert('日付を入力してください')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // データベースに保存
    const { error } = await supabase.from('allowances').insert({
      user_id: user.id,
      date: date,
      activity_type: activityType,
      amount: Number(amount), // ここで数値に変換して保存します
    })

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert('登録しました！')
      fetchAllowances()
    }
  }

  if (loading) return <div className="p-10 text-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">特殊勤務手当管理</h1>
          <button onClick={handleLogout} className="text-sm text-red-500 hover:text-red-700 font-bold">
            ログアウト
          </button>
        </div>

        {/* 入力フォーム */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
          <h2 className="font-bold mb-4 text-slate-700">実績の登録</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">日付</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">金額</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-slate-600 mb-1">業務内容</label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="部活動指導">部活動指導（3,600円）</option>
                <option value="対外引率">対外引率（4時間以上）</option>
                <option value="その他">その他</option>
              </select>
            </div>

            <button type="submit" className="bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 transition shadow-sm">
              登録する
            </button>
          </form>
        </div>

        {/* データ一覧 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-100 font-bold text-slate-700 flex justify-between items-center">
            <span>登録履歴</span>
            <span className="text-sm font-normal text-slate-500">{allowances.length}件</span>
          </div>
          
          {allowances.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              まだデータがありません。<br/>上のフォームから登録してみましょう！
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr className="text-sm text-slate-500 border-b">
                  <th className="p-4 font-medium">日付</th>
                  <th className="p-4 font-medium">内容</th>
                  <th className="p-4 font-medium text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {allowances.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50 transition">
                    <td className="p-4">{item.date}</td>
                    <td className="p-4">{item.activity_type}</td>
                    <td className="p-4 text-right font-bold text-slate-700">¥{item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}