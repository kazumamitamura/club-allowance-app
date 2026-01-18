'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const ADMIN_EMAILS = ['mitamuraka@haguroko.ed.jp', 'tomonoem@haguroko.ed.jp'].map(e => e.toLowerCase())

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    pendingAllowances: 0,
    pendingSchedules: 0,
    pendingLeaves: 0
  })

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() || '')) {
        alert('管理者権限がありません')
        router.push('/')
        return
      }
      setIsAdmin(true)
      fetchStats()
    }
    checkAdmin()
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

  if (!isAdmin) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <div className="bg-slate-800 text-white p-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-1">管理者ダッシュボード</h1>
            <p className="text-slate-300 text-sm">学校法人 勤務・手当・休暇管理システム</p>
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

        {/* メニューカード */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 手当承認 */}
          <button 
            onClick={() => router.push('/admin/allowances')}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">💰</div>
              {stats.pendingAllowances > 0 && (
                <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                  {stats.pendingAllowances}件
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition">
              手当承認
            </h3>
            <p className="text-slate-500 text-sm">
              部活動手当の申請を確認・承認します
            </p>
          </button>

          {/* 勤務表承認 */}
          <button 
            onClick={() => router.push('/admin/schedules')}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-green-500"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">⏰</div>
              {stats.pendingSchedules > 0 && (
                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                  {stats.pendingSchedules}件
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-green-600 transition">
              勤務表承認
            </h3>
            <p className="text-slate-500 text-sm">
              月次の勤務パターンを確認・承認します
            </p>
          </button>

          {/* 休暇承認 */}
          <button 
            onClick={() => router.push('/admin/leaves')}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-orange-500"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">📄</div>
              {stats.pendingLeaves > 0 && (
                <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                  {stats.pendingLeaves}件
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-orange-600 transition">
              休暇承認
            </h3>
            <p className="text-slate-500 text-sm">
              年休・特休等の申請を確認・承認します
            </p>
          </button>

          {/* カレンダー読込 */}
          <button 
            onClick={() => router.push('/admin/calendar')}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-purple-500"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">📅</div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-purple-600 transition">
              カレンダー管理
            </h3>
            <p className="text-slate-500 text-sm">
              年間勤務予定をCSVで登録
            </p>
          </button>

          {/* 設定 */}
          <button 
            onClick={() => router.push('/admin/settings')}
            className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group border-2 border-transparent hover:border-slate-500"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">⚙️</div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-slate-600 transition">
              システム設定
            </h3>
            <p className="text-slate-500 text-sm">
              手当項目・金額・勤務パターン設定
            </p>
          </button>

          {/* Excel出力 */}
          <button 
            onClick={() => router.push('/admin/export')}
            className="bg-gradient-to-br from-green-500 to-green-600 p-8 rounded-2xl shadow-md hover:shadow-xl transition-all text-left group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">📊</div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Excel出力
            </h3>
            <p className="text-green-50 text-sm">
              個人・全体の月次・年次レポート
            </p>
          </button>
        </div>

        {/* クイックアクセス */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h3 className="text-lg font-bold text-slate-800 mb-4">クイックアクセス</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button className="p-3 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-bold text-slate-600 transition">
              職員一覧
            </button>
            <button className="p-3 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-bold text-slate-600 transition">
              集計レポート
            </button>
            <button className="p-3 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-bold text-slate-600 transition">
              承認履歴
            </button>
            <button className="p-3 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-bold text-slate-600 transition">
              ヘルプ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
