'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

// ★管理者のメールアドレスリスト（指定された2名を設定済み）
const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
]

type Allowance = {
  id: number
  user_email: string
  date: string
  activity_type: string
  amount: number
  destination_type: string
  destination_detail: string
  is_driving: boolean
  is_accommodation: boolean
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [allowances, setAllowances] = useState<Allowance[]>([])
  const [users, setUsers] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  
  // 月選択用の状態
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('') // "2026-04" のような形式

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      // 1. ログインしていない、または管理者リストにない場合はトップへ追放
      if (!user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
        alert('管理者権限がありません。トップページに戻ります。')
        router.push('/')
        return
      }
      
      fetchData()
    }
    checkAdmin()
  }, [])

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('allowances')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      alert('Error: ' + error.message)
    } else {
      const allData = data || []
      setAllowances(allData)

      // 教員リストを作成
      const uniqueUsers = Array.from(new Set(allData.map(d => d.user_email).filter(Boolean) as string[]))
      setUsers(uniqueUsers)

      // データの存在する「年月」のリストを作成（例: ["2026-04", "2026-03"]）
      const months = Array.from(new Set(allData.map(d => d.date.substring(0, 7))))
      months.sort((a, b) => b.localeCompare(a)) // 新しい順
      setAvailableMonths(months)
      
      // 最初は最新の月を選択状態にする
      if (months.length > 0) {
        setSelectedMonth(months[0])
      }
    }
    setLoading(false)
  }

  // フィルタリング（教員 AND 選択した月）
  const filteredData = allowances.filter(item => {
    const isUserMatch = selectedUser ? item.user_email === selectedUser : false
    const isMonthMatch = selectedMonth ? item.date.startsWith(selectedMonth) : false
    return isUserMatch && isMonthMatch
  })

  const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0)

  // Excelダウンロード
  const handleDownloadExcel = () => {
    if (!selectedUser || filteredData.length === 0) {
      alert('出力するデータがありません')
      return
    }

    const excelData = filteredData.map(item => ({
      日付: item.date,
      業務内容: item.activity_type,
      金額: item.amount,
      目的地区分: item.destination_type || '-',
      目的地詳細: item.destination_detail || '-',
      運転: item.is_driving ? 'あり' : '',
      宿泊: item.is_accommodation ? 'あり' : '',
      メールアドレス: item.user_email
    }))

    const worksheet = XLSX.utils.json_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "実績一覧")
    
    // ファイル名に月を入れる (例: mitamuraka..._2026-04_実績.xlsx)
    XLSX.writeFile(workbook, `${selectedUser}_${selectedMonth}_手当実績.xlsx`)
  }

  if (loading) return <div className="p-10 text-center text-slate-500">権限確認中 & データ読み込み中...</div>

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">事務担当者用 管理画面</h1>
          <div className="flex gap-2">
            <button onClick={() => router.push('/admin/calendar')} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 text-sm font-bold">
              📅 年間予定登録へ
            </button>
            <button onClick={() => router.push('/')} className="bg-white border px-4 py-2 rounded text-slate-600 hover:bg-slate-50 text-sm">
              ← 教員画面へ
            </button>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* 左：ユーザーリスト */}
          <div className="w-1/4 bg-white p-4 rounded-lg shadow space-y-6">
            
            {/* 月選択エリア */}
            <div>
              <h2 className="font-bold text-slate-600 mb-2 text-sm">① 対象月を選択</h2>
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full p-2 border rounded bg-slate-50 font-bold text-slate-700"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m.replace('-', '年 ')}月</option>
                ))}
              </select>
            </div>

            {/* 教員選択エリア */}
            <div>
              <h2 className="font-bold text-slate-600 mb-2 text-sm">② 教員を選択</h2>
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {users.length === 0 ? (
                    <p className="text-slate-400 text-xs">データなし</p>
                ) : (
                    users.map(email => (
                    <button
                        key={email}
                        onClick={() => setSelectedUser(email)}
                        className={`w-full text-left p-2 rounded text-sm transition ${selectedUser === email ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-100 text-slate-700'}`}
                    >
                        {email}
                    </button>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* 右：詳細テーブル */}
          <div className="w-3/4 bg-white p-6 rounded-lg shadow min-h-[500px]">
            {!selectedUser ? (
              <div className="text-center text-slate-400 py-20">
                左のリストから教員を選択してください
              </div>
            ) : (
              <>
                <div className="flex justify-between items-end mb-6 border-b pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">{selectedMonth}</span>
                        <p className="text-sm text-slate-500">の支給実績</p>
                    </div>
                    <p className="font-bold text-xl text-slate-800">{selectedUser}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <div>
                        <p className="text-xs text-slate-500">合計金額</p>
                        <p className="font-bold text-4xl text-blue-600">¥{totalAmount.toLocaleString()}</p>
                    </div>
                    <button onClick={handleDownloadExcel} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 px-4 rounded shadow flex gap-2 items-center transition">
                      📥 Excelダウンロード
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm text-left text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase font-bold sticky top-0 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 border-b">日付</th>
                        <th className="px-4 py-3 border-b">業務内容</th>
                        <th className="px-4 py-3 border-b">詳細</th>
                        <th className="px-4 py-3 border-b text-center">運転</th>
                        <th className="px-4 py-3 border-b text-center">宿泊</th>
                        <th className="px-4 py-3 border-b text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="text-center py-10 text-slate-400">
                                この月のデータはありません
                            </td>
                        </tr>
                      ) : (
                          filteredData.map((item) => (
                            <tr key={item.id} className="bg-white border-b hover:bg-slate-50 transition">
                              <td className="px-4 py-3 font-medium whitespace-nowrap text-slate-800">
                                {item.date.split('-')[1]}/{item.date.split('-')[2]}
                                <span className="text-slate-400 text-xs ml-1">
                                    ({new Date(item.date).toLocaleDateString('ja-JP', { weekday: 'short' })})
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-[180px] truncate" title={item.activity_type}>{item.activity_type}</td>
                              <td className="px-4 py-3 max-w-[150px] truncate">
                                <span className="block text-[10px] text-slate-400">{item.destination_type}</span>
                                <span title={item.destination_detail}>{item.destination_detail}</span>
                              </td>
                              <td className="px-4 py-3 text-center">{item.is_driving ? '🚗' : '-'}</td>
                              <td className="px-4 py-3 text-center">{item.is_accommodation ? '🏨' : '-'}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-700">¥{item.amount.toLocaleString()}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}