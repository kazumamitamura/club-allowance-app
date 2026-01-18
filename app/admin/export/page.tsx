'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

export default function ExportPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() || '')) {
        alert('管理者権限がありません')
        router.push('/')
        return
      }
      setIsAdmin(true)
      fetchUsers()
    }
    checkAdmin()
  }, [])

  const fetchUsers = async () => {
    const { data } = await supabase.from('user_profiles').select('*').order('full_name')
    setUsers(data || [])
  }

  // 個人月次レポート
  const exportIndividualMonthly = async () => {
    if (!selectedUser) {
      alert('職員を選択してください')
      return
    }

    setLoading(true)
    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    
    // データ取得
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .eq('user_id', selectedUser)
      .gte('date', `${yearMonth}-01`)
      .lte('date', `${yearMonth}-31`)
      .order('date')

    const user = users.find(u => u.email === selectedUser)
    
    // Excel用データ整形
    const excelData = allowances?.map(item => ({
      '日付': item.date,
      '業務内容': item.activity_type,
      '区分': item.destination_type,
      '詳細': item.destination_detail || '',
      '運転': item.is_driving ? '○' : '',
      '宿泊': item.is_accommodation ? '○' : '',
      '金額': item.amount
    })) || []

    // 合計行
    const total = allowances?.reduce((sum, item) => sum + item.amount, 0) || 0
    excelData.push({
      '日付': '合計',
      '業務内容': '',
      '区分': '',
      '詳細': '',
      '運転': '',
      '宿泊': '',
      '金額': total
    })

    // Excelファイル生成
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '手当明細')
    
    XLSX.writeFile(wb, `手当明細_${user?.full_name || selectedUser}_${yearMonth}.xlsx`)
    
    setLoading(false)
    alert('ダウンロードしました！')
  }

  // 個人年次レポート
  const exportIndividualYearly = async () => {
    if (!selectedUser) {
      alert('職員を選択してください')
      return
    }

    setLoading(true)
    
    // データ取得
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .eq('user_id', selectedUser)
      .gte('date', `${selectedYear}-01-01`)
      .lte('date', `${selectedYear}-12-31`)
      .order('date')

    const user = users.find(u => u.email === selectedUser)
    
    // 月別集計
    const monthlyTotals: Record<number, number> = {}
    allowances?.forEach(item => {
      const month = parseInt(item.date.split('-')[1])
      monthlyTotals[month] = (monthlyTotals[month] || 0) + item.amount
    })

    // Excel用データ整形
    const excelData = Array.from({ length: 12 }, (_, i) => ({
      '月': `${i + 1}月`,
      '件数': allowances?.filter(a => parseInt(a.date.split('-')[1]) === i + 1).length || 0,
      '金額': monthlyTotals[i + 1] || 0
    }))

    // 合計行
    const total = Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0)
    excelData.push({
      '月': '年間合計',
      '件数': allowances?.length || 0,
      '金額': total
    })

    // Excelファイル生成
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '年間集計')
    
    XLSX.writeFile(wb, `手当年間集計_${user?.full_name || selectedUser}_${selectedYear}.xlsx`)
    
    setLoading(false)
    alert('ダウンロードしました！')
  }

  // 全体月次レポート
  const exportAllMonthly = async () => {
    setLoading(true)
    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    
    // データ取得
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .gte('date', `${yearMonth}-01`)
      .lte('date', `${yearMonth}-31`)
      .order('user_email')

    // ユーザー別集計
    const userTotals: Record<string, { name: string, count: number, amount: number }> = {}
    allowances?.forEach(item => {
      if (!userTotals[item.user_email]) {
        const user = users.find(u => u.email === item.user_email)
        userTotals[item.user_email] = {
          name: user?.full_name || item.user_email,
          count: 0,
          amount: 0
        }
      }
      userTotals[item.user_email].count++
      userTotals[item.user_email].amount += item.amount
    })

    // Excel用データ整形
    const excelData = Object.entries(userTotals).map(([email, data]) => ({
      '職員名': data.name,
      'メールアドレス': email,
      '件数': data.count,
      '金額': data.amount
    }))

    // 合計行
    const totalCount = excelData.reduce((sum, row) => sum + row['件数'], 0)
    const totalAmount = excelData.reduce((sum, row) => sum + row['金額'], 0)
    excelData.push({
      '職員名': '合計',
      'メールアドレス': '',
      '件数': totalCount,
      '金額': totalAmount
    })

    // Excelファイル生成
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '全体集計')
    
    XLSX.writeFile(wb, `手当全体集計_${yearMonth}.xlsx`)
    
    setLoading(false)
    alert('ダウンロードしました！')
  }

  // 全体年次レポート
  const exportAllYearly = async () => {
    setLoading(true)
    
    // データ取得
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .gte('date', `${selectedYear}-01-01`)
      .lte('date', `${selectedYear}-12-31`)
      .order('user_email')

    // ユーザー別集計
    const userTotals: Record<string, { name: string, count: number, amount: number }> = {}
    allowances?.forEach(item => {
      if (!userTotals[item.user_email]) {
        const user = users.find(u => u.email === item.user_email)
        userTotals[item.user_email] = {
          name: user?.full_name || item.user_email,
          count: 0,
          amount: 0
        }
      }
      userTotals[item.user_email].count++
      userTotals[item.user_email].amount += item.amount
    })

    // Excel用データ整形
    const excelData = Object.entries(userTotals).map(([email, data]) => ({
      '職員名': data.name,
      'メールアドレス': email,
      '件数': data.count,
      '金額': data.amount
    }))

    // 合計行
    const totalCount = excelData.reduce((sum, row) => sum + row['件数'], 0)
    const totalAmount = excelData.reduce((sum, row) => sum + row['金額'], 0)
    excelData.push({
      '職員名': '合計',
      'メールアドレス': '',
      '件数': totalCount,
      '金額': totalAmount
    })

    // Excelファイル生成
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '年間全体集計')
    
    XLSX.writeFile(wb, `手当年間全体集計_${selectedYear}.xlsx`)
    
    setLoading(false)
    alert('ダウンロードしました！')
  }

  if (!isAdmin) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100">
      {/* ヘッダー */}
      <div className="bg-green-600 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">📊</span> Excel出力センター
        </h1>
        <button onClick={() => router.push('/admin')} className="text-xs bg-green-700 px-4 py-2 rounded hover:bg-green-800 font-bold border border-green-500">
            ← ダッシュボードへ
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        
        {/* 出力条件設定 */}
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">出力条件</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">職員（個人レポート用）</label>
              <select 
                value={selectedUser} 
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full p-3 border rounded-lg font-bold text-sm"
              >
                <option value="">選択してください</option>
                {users.map(user => (
                  <option key={user.email} value={user.email}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">年</label>
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full p-3 border rounded-lg font-bold text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">月</label>
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="w-full p-3 border rounded-lg font-bold text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                  <option key={month} value={month}>{month}月</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 出力ボタン */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 個人月次 */}
          <button 
            onClick={exportIndividualMonthly}
            disabled={loading || !selectedUser}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-5xl mb-4">👤</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition">
              個人月次レポート
            </h3>
            <p className="text-slate-500 text-sm mb-3">
              選択した職員の指定月の手当明細を出力
            </p>
            <div className="text-xs text-slate-400">
              {selectedUser ? users.find(u => u.email === selectedUser)?.full_name : '職員未選択'} / {selectedYear}年{selectedMonth}月
            </div>
          </button>

          {/* 個人年次 */}
          <button 
            onClick={exportIndividualYearly}
            disabled={loading || !selectedUser}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-5xl mb-4">📅</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-purple-600 transition">
              個人年次レポート
            </h3>
            <p className="text-slate-500 text-sm mb-3">
              選択した職員の年間手当を月別集計
            </p>
            <div className="text-xs text-slate-400">
              {selectedUser ? users.find(u => u.email === selectedUser)?.full_name : '職員未選択'} / {selectedYear}年
            </div>
          </button>

          {/* 全体月次 */}
          <button 
            onClick={exportAllMonthly}
            disabled={loading}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-green-500"
          >
            <div className="text-5xl mb-4">👥</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-green-600 transition">
              全体月次レポート
            </h3>
            <p className="text-slate-500 text-sm mb-3">
              全職員の指定月の手当を集計
            </p>
            <div className="text-xs text-slate-400">
              全職員 / {selectedYear}年{selectedMonth}月
            </div>
          </button>

          {/* 全体年次 */}
          <button 
            onClick={exportAllYearly}
            disabled={loading}
            className="bg-gradient-to-br from-green-500 to-green-600 p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group"
          >
            <div className="text-5xl mb-4 text-white">📈</div>
            <h3 className="text-2xl font-bold text-white mb-2">
              全体年次レポート
            </h3>
            <p className="text-green-50 text-sm mb-3">
              全職員の年間手当を集計
            </p>
            <div className="text-xs text-green-100">
              全職員 / {selectedYear}年
            </div>
          </button>

        </div>

        {loading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
              <div className="text-4xl mb-4">⏳</div>
              <div className="text-lg font-bold text-slate-800">処理中...</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
