'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx' // Excel出力用ライブラリ

type Allowance = {
  id: number
  user_email: string
  date: string
  activity_type: string
  amount: number
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [allowances, setAllowances] = useState<Allowance[]>([])
  const [users, setUsers] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      fetchAllData()
    }
    checkAdmin()
  }, [])

  const fetchAllData = async () => {
    const { data, error } = await supabase
      .from('allowances')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      alert('データ取得エラー: ' + error.message)
    } else {
      setAllowances(data || [])
      const uniqueUsers = Array.from(new Set(data?.map(item => item.user_email).filter(Boolean) as string[]))
      setUsers(uniqueUsers)
    }
    setLoading(false)
  }

  const filteredData = selectedUser 
    ? allowances.filter(item => item.user_email === selectedUser)
    : []

  const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0)

  // Excelダウンロード機能
  const handleDownloadExcel = () => {
    if (!selectedUser || filteredData.length === 0) return

    // 1. ダウンロード用にデータを日本語に変換する
    const excelData = filteredData.map(item => ({
      日付: item.date,
      業務内容: item.activity_type,
      金額: item.amount,
      メールアドレス: item.user_email
    }))

    // 2. シートを作成
    const worksheet = XLSX.utils.json_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "実績一覧")

    // 3. ファイル名を決めてダウンロード実行
    // 例: mitamuraka@..._特殊勤務手当実績.xlsx
    XLSX.writeFile(workbook, `${selectedUser}_特殊勤務手当実績.xlsx`)
  }

  if (loading) return <div className="p-10">読み込み中...</div>

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">事務担当者用 管理画面</h1>
          <button onClick={() => router.push('/')} className="bg-white border px-4 py-2 rounded text-slate-600 hover:bg-slate-50">
            ← 教員画面へ戻る
          </button>
        </div>

        <div className="flex gap-6 items-start">
          <div className="w-1/3 bg-white p-4 rounded-lg shadow">
            <h2 className="font-bold text-slate-600 mb-4 border-b pb-2">教員を選択</h2>
            <div className="space-y-2">
              {users.length === 0 ? (
                 <p className="text-slate-400 text-sm">データが見つかりません</p>
              ) : (
                users.map(email => (
                  <button
                    key={email}
                    onClick={() => setSelectedUser(email)}
                    className={`w-full text-left p-3 rounded transition ${
                      selectedUser === email 
                        ? 'bg-blue-600 text-white font-bold' 
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {email}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="w-2/3 bg-white p-6 rounded-lg shadow">
            {!selectedUser ? (
              <div className="text-center text-slate-400 py-20">
                左のリストから教員を選択してください
              </div>
            ) : (
              <>
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-sm text-slate-500">選択中の教員</p>
                    <p className="font-bold text-xl">{selectedUser}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">支給合計額</p>
                    <p className="font-bold text-3xl text-blue-600">¥{totalAmount.toLocaleString()}</p>
                  </div>
                </div>

                {/* Excelダウンロードボタン（ここに追加！） */}
                <button 
                  onClick={handleDownloadExcel}
                  className="w-full mb-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow flex justify-center items-center gap-2 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Excelファイルをダウンロード
                </button>

                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left text-slate-600">
                    <thead className="bg-slate-100 text-xs uppercase font-bold">
                      <tr>
                        <th className="px-6 py-3 border-b">日付</th>
                        <th className="px-6 py-3 border-b">業務内容</th>
                        <th className="px-6 py-3 border-b text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.map((item) => (
                        <tr key={item.id} className="bg-white border-b hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium">{item.date}</td>
                          <td className="px-6 py-4">{item.activity_type}</td>
                          <td className="px-6 py-4 text-right">¥{item.amount.toLocaleString()}</td>
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