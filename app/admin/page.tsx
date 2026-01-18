'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { isAdmin as checkIsAdmin, getUserRoles } from '@/utils/adminRoles'

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userRoles, setUserRoles] = useState<string[]>([])
  const [stats, setStats] = useState({
    pendingAllowances: 0,
    pendingSchedules: 0,
    pendingLeaves: 0
  })

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('ログインが必要です')
        router.push('/login')
        return
      }

      if (!checkIsAdmin(user.email || '')) {
        alert('管理者権限がありません')
        router.push('/')
        return
      }

      setIsAuthorized(true)
      setUserRoles(getUserRoles(user.email || ''))
      fetchStats()
    }
    checkAuth()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    
    // 承認待ちの数を取得
    const { data: allowanceData } = await supabase
      .from('monthly_applications')
      .select('*')
      .eq('application_type', 'allowance')
      .eq('status', 'submitted')
    
    const { data: scheduleData } = await supabase
      .from('monthly_applications')
      .select('*')
      .eq('application_type', 'schedule')
      .eq('status', 'submitted')
    
    const { data: leaveData } = await supabase
      .from('leave_applications')
      .select('*')
      .eq('status', 'pending')

    setStats({
      pendingAllowances: allowanceData?.length || 0,
      pendingSchedules: scheduleData?.length || 0,
      pendingLeaves: leaveData?.length || 0
    })
    
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!isAuthorized) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <div className="bg-slate-800 text-white p-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-1">管理者ダッシュボード</h1>
            <p className="text-slate-300 text-sm">学校法人 勤務・手当・休暇管理システム</p>
            {userRoles.length > 0 && (
              <div className="mt-2 flex gap-2">
                {userRoles.map(role => (
                  <span key={role} className="bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs font-bold">
                    {role}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push('/')} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg font-bold text-sm transition">
              一般画面へ
            </button>
            <button onClick={handleLogout} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg font-bold text-sm transition">
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-8">
        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500">
            <div className="text-sm font-bold text-slate-500 mb-1">手当申請（承認待ち）</div>
            <div className="text-4xl font-extrabold text-blue-600">{stats.pendingAllowances}</div>
            <div className="text-xs text-slate-400 mt-1">件</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-md border-l-4 border-green-500">
            <div className="text-sm font-bold text-slate-500 mb-1">勤務表申請（承認待ち）</div>
            <div className="text-4xl font-extrabold text-green-600">{stats.pendingSchedules}</div>
            <div className="text-xs text-slate-400 mt-1">件</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-md border-l-4 border-orange-500">
            <div className="text-sm font-bold text-slate-500 mb-1">休暇届（承認待ち）</div>
            <div className="text-4xl font-extrabold text-orange-600">{stats.pendingLeaves}</div>
            <div className="text-xs text-slate-400 mt-1">件</div>
          </div>
        </div>

        {/* メインメニューカード（3分割） */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* 手当管理 */}
          <button 
            onClick={() => router.push('/admin/allowances')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all text-left group transform hover:scale-105"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="text-6xl">💰</div>
              {stats.pendingAllowances > 0 && (
                <span className="bg-white text-blue-600 px-4 py-2 rounded-full text-sm font-bold shadow-lg">
                  {stats.pendingAllowances}件
                </span>
              )}
            </div>
            <h3 className="text-3xl font-extrabold text-white mb-3">
              手当管理
            </h3>
            <p className="text-blue-100 text-sm mb-4">
              部活動手当の承認・集計・CSV出力・設定
            </p>
            <div className="text-xs text-blue-200 bg-blue-700/30 px-3 py-2 rounded-lg inline-block">
              担当：友野・武田事務長
            </div>
          </button>

          {/* 勤務表管理 */}
          <button 
            onClick={() => router.push('/admin/schedules')}
            className="bg-gradient-to-br from-green-500 to-green-600 p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all text-left group transform hover:scale-105"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="text-6xl">⏰</div>
              {stats.pendingSchedules > 0 && (
                <span className="bg-white text-green-600 px-4 py-2 rounded-full text-sm font-bold shadow-lg">
                  {stats.pendingSchedules}件
                </span>
              )}
            </div>
            <h3 className="text-3xl font-extrabold text-white mb-3">
              勤務表管理
            </h3>
            <p className="text-green-100 text-sm mb-4">
              勤務パターンの承認・カレンダー設定・集計
            </p>
            <div className="text-xs text-green-200 bg-green-700/30 px-3 py-2 rounded-lg inline-block">
              担当：小松・武田事務長
            </div>
          </button>

          {/* 休暇管理 */}
          <button 
            onClick={() => router.push('/admin/leaves')}
            className="bg-gradient-to-br from-orange-500 to-orange-600 p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all text-left group transform hover:scale-105"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="text-6xl">📄</div>
              {stats.pendingLeaves > 0 && (
                <span className="bg-white text-orange-600 px-4 py-2 rounded-full text-sm font-bold shadow-lg">
                  {stats.pendingLeaves}件
                </span>
              )}
            </div>
            <h3 className="text-3xl font-extrabold text-white mb-3">
              休暇届管理
            </h3>
            <p className="text-orange-100 text-sm mb-4">
              年休・特休等の申請確認・承認
            </p>
            <div className="text-xs text-orange-200 bg-orange-700/30 px-3 py-2 rounded-lg inline-block">
              全管理者
            </div>
          </button>
        </div>

        {/* システム情報 */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h3 className="text-lg font-bold text-slate-800 mb-4">システム情報</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">承認待ち（合計）</div>
              <div className="text-3xl font-bold text-slate-800">
                {stats.pendingAllowances + stats.pendingSchedules + stats.pendingLeaves}件
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">アクセス権限</div>
              <div className="text-lg font-bold text-slate-800">
                {userRoles.length}個の管理権限
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">システムバージョン</div>
              <div className="text-lg font-bold text-slate-800">
                v2.0
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
