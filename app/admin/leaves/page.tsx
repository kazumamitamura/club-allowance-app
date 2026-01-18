'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { checkAccess, canManageLeaves } from '@/utils/adminRoles'

export default function AdminLeavesPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [leaves, setLeaves] = useState<any[]>([])
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({})
  
  // フィルタ用
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('ログインが必要です')
        router.push('/login')
        return
      }

      const hasAccess = checkAccess(user.email || '', canManageLeaves)
      if (!hasAccess) {
        alert('休暇管理の権限がありません')
        router.push('/admin')
        return
      }

      setIsAuthorized(true)
      fetchData()
    }
    checkAuth()
  }, [filter]) // フィルタ変更時に再取得

  const fetchData = async () => {
    setLoading(true)
    
    // 1. 休暇申請を取得
    let query = supabase.from('leave_applications').select('*').order('date', { ascending: false })
    if (filter === 'pending') query = query.eq('status', 'pending')
    
    const { data: leaveData } = await query
    setLeaves(leaveData || [])

    // 2. 氏名マスタ取得
    const { data: userData } = await supabase.from('user_profiles').select('*')
    const pMap: Record<string, string> = {}
    userData?.forEach((u: any) => pMap[u.email] = u.full_name)
    
    setUserProfiles(pMap)
    setLoading(false)
  }

  const handleDecision = async (id: number, decision: 'approved' | 'rejected') => {
    if (!confirm(decision === 'approved' ? '承認してよろしいですか？' : '却下しますか？')) return
    
    const { error } = await supabase.from('leave_applications').update({ 
        status: decision,
        approver_id: (await supabase.auth.getUser()).data.user?.id,
        approved_at: new Date().toISOString()
    }).eq('id', id)

    if (error) alert('エラー: ' + error.message)
    else fetchData()
  }

  if (!isAuthorized) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ヘッダー */}
      <div className="bg-orange-600 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">📄</span> 休暇届管理
        </h1>
        <button onClick={() => router.push('/admin')} className="text-xs bg-orange-700 px-4 py-2 rounded hover:bg-orange-800 font-bold border border-orange-500">
            ← ダッシュボードへ
        </button>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        
        {/* フィルタ切り替え */}
        <div className="flex gap-2 mb-6">
            <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'pending' ? 'bg-orange-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>承認待ち</button>
            <button onClick={() => setFilter('approved')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'approved' ? 'bg-green-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>承認済み</button>
            <button onClick={() => setFilter('rejected')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'rejected' ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>却下済み</button>
        </div>

        {/* リスト表示 */}
        {loading ? (
            <div className="text-center py-20 text-slate-400">読み込み中...</div>
        ) : leaves.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                該当する申請はありません
            </div>
        ) : (
            <div className="space-y-3">
                {leaves.map((leave) => {
                    // user_idの先頭を表示
                    const displayName = "職員ID: " + leave.user_id.slice(0, 8) + "..." 

                    return (
                        <div key={leave.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-orange-300 transition">
                            
                            {/* 申請内容 */}
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="font-bold text-lg text-slate-800">{leave.date.replace('-', '/').replace('-', '/')}</span>
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                                        leave.leave_type.includes('有給') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                    }`}>
                                        {leave.leave_type}
                                    </span>
                                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">{leave.duration}</span>
                                </div>
                                <div className="text-sm font-bold text-slate-600 mb-1">
                                    申請者: <span className="text-black">{displayName}</span>
                                </div>
                                <div className="text-sm text-slate-500 bg-slate-50 p-2 rounded inline-block w-full md:w-auto">
                                    理由: {leave.reason || '(なし)'}
                                </div>
                            </div>

                            {/* 操作ボタン (承認待ちの時のみ表示) */}
                            {leave.status === 'pending' && (
                                <div className="flex gap-2 w-full md:w-auto">
                                    <button onClick={() => handleDecision(leave.id, 'approved')} className="flex-1 md:flex-none bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow hover:bg-green-700 active:scale-95 transition">
                                        承認
                                    </button>
                                    <button onClick={() => handleDecision(leave.id, 'rejected')} className="flex-1 md:flex-none bg-red-100 text-red-600 px-4 py-3 rounded-lg font-bold hover:bg-red-200 active:scale-95 transition">
                                        却下
                                    </button>
                                </div>
                            )}
                            
                            {leave.status === 'approved' && <div className="text-green-600 font-bold px-4">✅ 承認済</div>}
                            {leave.status === 'rejected' && <div className="text-slate-400 font-bold px-4">却下済</div>}
                        </div>
                    )
                })}
            </div>
        )}
      </div>
    </div>
  )
}