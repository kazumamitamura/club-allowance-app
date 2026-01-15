'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

// 型定義の更新
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      fetchData()
    }
    init()
  }, [])

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('allowances')
      .select('*')
      .order('date', { ascending: false })

    if (error) alert('Error: ' + error.message)
    else {
      setAllowances(data || [])
      const uniqueUsers = Array.from(new Set(data?.map(d => d.user_email).filter(Boolean) as string[]))
      setUsers(uniqueUsers)
    }
    setLoading(false)
  }

  const filteredData = selectedUser ? allowances.filter(a => a.user_email === selectedUser) : []
  const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0)

  // Excelダウンロード（詳細情報込み）
  const handleDownloadExcel = () => {
    if (!selectedUser || filteredData.length === 0) return

    const excelData = filteredData.map(item => ({
      日付: item.date,
      業務内容: item.activity_type,
      金額: item.amount,
      目的地区分: item.destination_type,
      目的地詳細: item.destination_detail,
      運転: item.is_driving ? 'あり' : '',
      宿泊: item.is_accommodation ? 'あり' : '',
      メールアドレス: item.user_email
    }))

    const worksheet = XLSX.utils.json_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "実績一覧")
    XLSX.writeFile(workbook, `${selectedUser}_特殊勤務手当実績.xlsx`)
  }

  if (loading) return <div className="p-10">読み込み中...</div>

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">事務担当者用 管理画面</h1>
          <div className="flex gap-2">
            <button onClick={() => router.push('/admin/calendar')} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 text-sm">
              📅 年間予定登録へ
            </button>
            <button onClick={() => router.push('/')} className="bg-white border px-4 py-2 rounded text-slate-600 hover:bg-slate-50 text-sm">
              ← 教員画面へ
            </button>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* 左：ユーザーリスト */}
          <div className="w-1/4 bg-white p-4 rounded-lg shadow">
            <h2 className="font-bold text-slate-600 mb-4 border-b pb-2">教員を選択</h2>
            <div className="space-y-2">
              {users.map(email => (
                <button
                  key={email}
                  onClick={() => setSelectedUser(email)}
                  className={`w-full text-left p-2 rounded text-sm transition ${selectedUser === email ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-100'}`}
                >
                  {email}
                </button>
              ))}
            </div>
          </div>

          {/* 右：詳細テーブル */}
          <div className="w-3/4 bg-white p-6 rounded-lg shadow">
            {selectedUser && (
              <>
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-sm text-slate-500">選択中: {selectedUser}</p>
                    <p className="font-bold text-3xl text-blue-600">¥{totalAmount.toLocaleString()}</p>
                  </div>
                  <button onClick={handleDownloadExcel} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded shadow flex gap-2 items-center">
                    <span>Excelダウンロード</span>
                  </button>
                </div>

                <div className="overflow-x-auto border rounded-lg max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm text-left text-slate-600">
                    <thead className="bg-slate-100 text-xs uppercase font-bold sticky top-0">
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
                      {filteredData.map((item) => (
                        <tr key={item.id} className="bg-white border-b hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{item.date}</td>
                          <td className="px-4 py-3 max-w-[200px] truncate">{item.activity_type}</td>
                          <td className="px-4 py-3">
                            <span className="block text-xs text-slate-400">{item.destination_type}</span>
                            {item.destination_detail}
                          </td>
                          <td className="px-4 py-3 text-center">{item.is_driving ? '〇' : '-'}</td>
                          <td className="px-4 py-3 text-center">{item.is_accommodation ? '〇' : '-'}</td>
                          <td className="px-4 py-3 text-right font-bold">¥{item.amount.toLocaleString()}</td>
                        </tr>
                      ))}
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