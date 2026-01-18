'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

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

export default function AllowanceApprovalsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [applications, setApplications] = useState<MonthlyApplication[]>([])
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({})
  const [allowanceDetails, setAllowanceDetails] = useState<Record<string, Allowance[]>>({})
  const [expandedApp, setExpandedApp] = useState<number | null>(null)
  
  // フィルタ用
  const [filter, setFilter] = useState<'submitted' | 'approved' | 'rejected'>('submitted')

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() || '')) {
        alert('管理者権限がありません')
        router.push('/')
        return
      }
      setIsAdmin(true)
      fetchData()
    }
    checkAdmin()
  }, [filter])

  const fetchData = async () => {
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
        const [year, month] = app.year_month.split('-')
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
      fetchData()
    }
  }

  const calculateTotal = (userId: string, yearMonth: string) => {
    const details = allowanceDetails[`${userId}_${yearMonth}`] || []
    return details.reduce((sum, item) => sum + item.amount, 0)
  }

  if (!isAdmin) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">💰</span> 手当承認センター
        </h1>
        <button onClick={() => router.push('/admin')} className="text-xs bg-blue-700 px-4 py-2 rounded hover:bg-blue-800 font-bold border border-blue-500">
            ← ダッシュボードへ
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        
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
                                {/* 申請内容 */}
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

                                {/* 操作ボタン */}
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
    </div>
  )
}
