'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { checkAccess, canManageAllowances } from '@/utils/adminRoles'
import * as XLSX from 'xlsx'

type MonthlyApplication = {
  id: number
  user_id: string
  user_email: string
  year_month: string
  application_type: string
  status: string
  submitted_at: string
}

type Allowance = {
  date: string
  activity_type: string
  amount: number
  destination_type: string
  destination_detail: string
}

export default function AllowanceManagementPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  
  // タブ管理
  const [activeTab, setActiveTab] = useState<'approval' | 'export' | 'settings'>('approval')
  
  // 承認タブ用
  const [applications, setApplications] = useState<MonthlyApplication[]>([])
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({})
  const [allowanceDetails, setAllowanceDetails] = useState<Record<string, Allowance[]>>({})
  const [expandedApp, setExpandedApp] = useState<number | null>(null)
  const [filter, setFilter] = useState<'submitted' | 'approved' | 'rejected'>('submitted')

  // Excel出力タブ用
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [exporting, setExporting] = useState(false)

  // 設定タブ用 - 将来的に手当項目の設定が必要な場合
  const [allowanceSettings, setAllowanceSettings] = useState<any[]>([])

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('ログインが必要です')
        router.push('/login')
        return
      }

      const hasAccess = checkAccess(user.email || '', canManageAllowances)
      if (!hasAccess) {
        alert('手当管理の権限がありません')
        router.push('/admin')
        return
      }

      setUserEmail(user.email || '')
      setIsAuthorized(true)
      fetchApprovalData()
      fetchUsers()
    }
    checkAuth()
  }, [filter])

  const fetchApprovalData = async () => {
    setLoading(true)
    
    // 1. 申請データを取得
    let query = supabase
      .from('monthly_applications')
      .select('*')
      .eq('application_type', 'allowance')
      .order('year_month', { ascending: false })
    
    if (filter === 'submitted') query = query.eq('status', 'submitted')
    else if (filter === 'approved') query = query.eq('status', 'approved')
    else if (filter === 'rejected') query = query.eq('status', 'rejected')
    
    const { data: appData } = await query
    setApplications(appData || [])

    // 2. 氏名マスタ取得
    const { data: userData } = await supabase.from('user_profiles').select('*')
    const pMap: Record<string, string> = {}
    userData?.forEach((u: any) => pMap[u.email] = u.full_name)
    setUserProfiles(pMap)

    // 3. 各申請の詳細データを取得
    if (appData) {
      const detailsMap: Record<string, Allowance[]> = {}
      for (const app of appData) {
        const { data: allowData } = await supabase
          .from('allowances')
          .select('date, activity_type, amount, destination_type, destination_detail')
          .eq('user_id', app.user_id)
          .gte('date', `${app.year_month}-01`)
          .lte('date', `${app.year_month}-31`)
          .order('date')
        
        detailsMap[`${app.user_id}_${app.year_month}`] = allowData || []
      }
      setAllowanceDetails(detailsMap)
    }
    
    setLoading(false)
  }

  const fetchUsers = async () => {
    const { data } = await supabase.from('user_profiles').select('*').order('full_name')
    setUsers(data || [])
  }

  const handleDecision = async (app: MonthlyApplication, decision: 'approved' | 'rejected') => {
    const label = decision === 'approved' ? '承認' : '却下'
    if (!confirm(`${app.year_month} の手当申請を${label}しますか？`)) return
    
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error } = await supabase
      .from('monthly_applications')
      .update({ 
        status: decision,
        approver_id: user?.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', app.id)

    if (error) alert('エラー: ' + error.message)
    else {
      alert(`${label}しました！`)
      fetchApprovalData()
    }
  }

  const calculateTotal = (userId: string, yearMonth: string) => {
    const details = allowanceDetails[`${userId}_${yearMonth}`] || []
    return details.reduce((sum, item) => sum + item.amount, 0)
  }

  // Excel出力機能
  const exportIndividualMonthly = async () => {
    if (!selectedUser) {
      alert('職員を選択してください')
      return
    }

    setExporting(true)
    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .eq('user_email', selectedUser)
      .gte('date', `${yearMonth}-01`)
      .lte('date', `${yearMonth}-31`)
      .order('date')

    const user = users.find(u => u.email === selectedUser)
    
    const excelData = allowances?.map(item => ({
      '日付': item.date,
      '業務内容': item.activity_type,
      '区分': item.destination_type,
      '詳細': item.destination_detail || '',
      '運転': item.is_driving ? '○' : '',
      '宿泊': item.is_accommodation ? '○' : '',
      '金額': item.amount
    })) || []

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

    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '手当明細')
    
    XLSX.writeFile(wb, `手当明細_${user?.full_name || selectedUser}_${yearMonth}.xlsx`)
    
    setExporting(false)
    alert('ダウンロードしました！')
  }

  const exportIndividualYearly = async () => {
    if (!selectedUser) {
      alert('職員を選択してください')
      return
    }

    setExporting(true)
    
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .eq('user_email', selectedUser)
      .gte('date', `${selectedYear}-01-01`)
      .lte('date', `${selectedYear}-12-31`)
      .order('date')

    const user = users.find(u => u.email === selectedUser)
    
    const monthlyTotals: Record<number, number> = {}
    allowances?.forEach(item => {
      const month = parseInt(item.date.split('-')[1])
      monthlyTotals[month] = (monthlyTotals[month] || 0) + item.amount
    })

    const excelData = Array.from({ length: 12 }, (_, i) => ({
      '月': `${i + 1}月`,
      '件数': allowances?.filter(a => parseInt(a.date.split('-')[1]) === i + 1).length || 0,
      '金額': monthlyTotals[i + 1] || 0
    }))

    const total = Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0)
    excelData.push({
      '月': '年間合計',
      '件数': allowances?.length || 0,
      '金額': total
    })

    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '年間集計')
    
    XLSX.writeFile(wb, `手当年間集計_${user?.full_name || selectedUser}_${selectedYear}.xlsx`)
    
    setExporting(false)
    alert('ダウンロードしました！')
  }

  const exportAllMonthly = async () => {
    setExporting(true)
    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .gte('date', `${yearMonth}-01`)
      .lte('date', `${yearMonth}-31`)
      .order('user_email')

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

    const excelData = Object.entries(userTotals).map(([email, data]) => ({
      '職員名': data.name,
      'メールアドレス': email,
      '件数': data.count,
      '金額': data.amount
    }))

    const totalCount = excelData.reduce((sum, row) => sum + row['件数'], 0)
    const totalAmount = excelData.reduce((sum, row) => sum + row['金額'], 0)
    excelData.push({
      '職員名': '合計',
      'メールアドレス': '',
      '件数': totalCount,
      '金額': totalAmount
    })

    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '全体集計')
    
    XLSX.writeFile(wb, `手当全体集計_${yearMonth}.xlsx`)
    
    setExporting(false)
    alert('ダウンロードしました！')
  }

  const exportAllYearly = async () => {
    setExporting(true)
    
    const { data: allowances } = await supabase
      .from('allowances')
      .select('*')
      .gte('date', `${selectedYear}-01-01`)
      .lte('date', `${selectedYear}-12-31`)
      .order('user_email')

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

    const excelData = Object.entries(userTotals).map(([email, data]) => ({
      '職員名': data.name,
      'メールアドレス': email,
      '件数': data.count,
      '金額': data.amount
    }))

    const totalCount = excelData.reduce((sum, row) => sum + row['件数'], 0)
    const totalAmount = excelData.reduce((sum, row) => sum + row['金額'], 0)
    excelData.push({
      '職員名': '合計',
      'メールアドレス': '',
      '件数': totalCount,
      '金額': totalAmount
    })

    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '年間全体集計')
    
    XLSX.writeFile(wb, `手当年間全体集計_${selectedYear}.xlsx`)
    
    setExporting(false)
    alert('ダウンロードしました！')
  }

  if (!isAuthorized) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">💰</span> 手当管理（担当：友野・武田事務長）
          </h1>
          <button onClick={() => router.push('/admin')} className="text-xs bg-blue-700 px-4 py-2 rounded hover:bg-blue-800 font-bold border border-blue-500">
            ← ダッシュボードへ
          </button>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="bg-white border-b border-slate-200 sticky top-[60px] z-10">
        <div className="max-w-7xl mx-auto flex gap-1 px-6">
          <button 
            onClick={() => setActiveTab('approval')}
            className={`px-6 py-3 font-bold text-sm transition ${activeTab === 'approval' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            承認管理
          </button>
          <button 
            onClick={() => setActiveTab('export')}
            className={`px-6 py-3 font-bold text-sm transition ${activeTab === 'export' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Excel出力
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 font-bold text-sm transition ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            設定
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        
        {/* 承認管理タブ */}
        {activeTab === 'approval' && (
          <div>
            {/* フィルタ切り替え */}
            <div className="flex gap-2 mb-6">
              <button onClick={() => setFilter('submitted')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'submitted' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>承認待ち</button>
              <button onClick={() => setFilter('approved')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'approved' ? 'bg-green-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>承認済み</button>
              <button onClick={() => setFilter('rejected')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'rejected' ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>却下済み</button>
            </div>

            {/* リスト表示 */}
            {loading ? (
              <div className="text-center py-20 text-slate-400">読み込み中...</div>
            ) : applications.length === 0 ? (
              <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                  該当する申請はありません
              </div>
            ) : (
              <div className="space-y-3">
                  {applications.map((app) => {
                      const displayName = userProfiles[app.user_email] || app.user_email
                      const total = calculateTotal(app.user_id, app.year_month)
                      const details = allowanceDetails[`${app.user_id}_${app.year_month}`] || []
                      const isExpanded = expandedApp === app.id

                      return (
                          <div key={app.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:border-blue-300 transition">
                              
                              {/* サマリー */}
                              <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                  <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                          <span className="font-bold text-xl text-slate-800">{app.year_month.replace('-', '年')}月</span>
                                          <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                              {displayName}
                                          </span>
                                      </div>
                                      <div className="text-sm text-slate-500">
                                          申請日: {new Date(app.submitted_at).toLocaleDateString('ja-JP')}
                                      </div>
                                      <div className="text-2xl font-bold text-blue-600 mt-2">
                                          ¥{total.toLocaleString()}
                                          <span className="text-xs text-slate-400 ml-2">({details.length}件)</span>
                                      </div>
                                  </div>

                                  <div className="flex flex-col gap-2 w-full md:w-auto">
                                      <button 
                                          onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                                          className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 transition"
                                      >
                                          {isExpanded ? '▲ 詳細を閉じる' : '▼ 詳細を見る'}
                                      </button>
                                      
                                      {app.status === 'submitted' && (
                                          <div className="flex gap-2">
                                              <button 
                                                  onClick={() => handleDecision(app, 'approved')}
                                                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow hover:bg-green-700 active:scale-95 transition"
                                              >
                                                  承認
                                              </button>
                                              <button 
                                                  onClick={() => handleDecision(app, 'rejected')}
                                                  className="flex-1 bg-red-100 text-red-600 px-4 py-3 rounded-lg font-bold hover:bg-red-200 active:scale-95 transition"
                                              >
                                                  却下
                                              </button>
                                          </div>
                                      )}
                                      
                                      {app.status === 'approved' && <div className="text-green-600 font-bold text-center py-2">✅ 承認済</div>}
                                      {app.status === 'rejected' && <div className="text-slate-400 font-bold text-center py-2">却下済</div>}
                                  </div>
                              </div>

                              {/* 詳細 */}
                              {isExpanded && (
                                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                                      <h4 className="font-bold text-slate-700 mb-3 text-sm">手当明細</h4>
                                      {details.length === 0 ? (
                                          <div className="text-slate-400 text-sm">手当データがありません</div>
                                      ) : (
                                          <div className="space-y-2">
                                              {details.map((item, idx) => (
                                                  <div key={idx} className="bg-white p-3 rounded-lg flex justify-between items-center text-sm border border-slate-200">
                                                      <div className="flex items-center gap-3">
                                                          <span className="font-bold text-slate-700">{item.date.split('-')[2]}日</span>
                                                          <span className="text-slate-600">{item.activity_type}</span>
                                                          <span className="text-xs text-slate-400">
                                                              {item.destination_type}
                                                              {item.destination_detail && ` - ${item.destination_detail}`}
                                                          </span>
                                                      </div>
                                                      <span className="font-bold text-slate-700">¥{item.amount.toLocaleString()}</span>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>
                      )
                  })}
              </div>
            )}
          </div>
        )}

        {/* Excel出力タブ */}
        {activeTab === 'export' && (
          <div>
            {/* 出力条件設定 */}
            <div className="bg-white p-6 rounded-2xl shadow-md mb-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">出力条件</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">職員（個人レポート用）</label>
                  <select 
                    value={selectedUser} 
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="w-full p-3 border rounded-lg font-bold text-sm text-black"
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
                    className="w-full p-3 border rounded-lg font-bold text-sm text-black"
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
                    className="w-full p-3 border rounded-lg font-bold text-sm text-black"
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
              <button 
                onClick={exportIndividualMonthly}
                disabled={exporting || !selectedUser}
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

              <button 
                onClick={exportIndividualYearly}
                disabled={exporting || !selectedUser}
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

              <button 
                onClick={exportAllMonthly}
                disabled={exporting}
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

              <button 
                onClick={exportAllYearly}
                disabled={exporting}
                className="bg-gradient-to-br from-blue-500 to-blue-600 p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group"
              >
                <div className="text-5xl mb-4 text-white">📈</div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  全体年次レポート
                </h3>
                <p className="text-blue-50 text-sm mb-3">
                  全職員の年間手当を集計
                </p>
                <div className="text-xs text-blue-100">
                  全職員 / {selectedYear}年
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 設定タブ */}
        {activeTab === 'settings' && (
          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-xl font-bold text-slate-800 mb-4">手当項目・金額設定</h2>
            <div className="text-slate-500 text-sm">
              <p>現在、手当項目と金額は <code className="bg-slate-100 px-2 py-1 rounded">utils/allowanceRules.ts</code> で管理されています。</p>
              <p className="mt-2">将来的には、この画面からGUIで編集できるようにする予定です。</p>
            </div>
            <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-2">現在の手当設定</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• A:休日部活(1日) → 3,400円</li>
                <li>• B:休日部活(半日) → 1,700円</li>
                <li>• C:指定大会 → 3,400円</li>
                <li>• D:指定外大会 → 2,400円</li>
                <li>• E:遠征 → 3,000円</li>
                <li>• F:合宿 → 5,000円</li>
                <li>• G:引率 → 2,400円</li>
                <li>• H:宿泊指導 → 6,000円</li>
                <li>• 県外マイクロバス運転 → 15,000円</li>
                <li>• 県内長距離運転 → 7,500円</li>
              </ul>
            </div>
          </div>
        )}

        {/* ローディングオーバーレイ */}
        {(loading || exporting) && (
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
