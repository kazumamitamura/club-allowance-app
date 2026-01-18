'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { checkAccess, canManageSchedules } from '@/utils/adminRoles'

type MonthlyApplication = {
  id: number
  user_id: string
  user_email: string
  year_month: string
  application_type: string
  status: string
  submitted_at: string
}

type DailySchedule = {
  date: string
  work_pattern_code: string
  leave_annual?: string
  leave_hourly?: string
  leave_childcare?: string
  leave_nursing?: string
}

type WorkPattern = {
  id: number
  code: string
  start_time: string
  end_time: string
  description: string
}

export default function ScheduleManagementPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  
  // タブ管理
  const [activeTab, setActiveTab] = useState<'approval' | 'calendar' | 'patterns'>('approval')
  
  // 承認タブ用
  const [applications, setApplications] = useState<MonthlyApplication[]>([])
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({})
  const [scheduleDetails, setScheduleDetails] = useState<Record<string, DailySchedule[]>>({})
  const [expandedApp, setExpandedApp] = useState<number | null>(null)
  const [filter, setFilter] = useState<'submitted' | 'approved' | 'rejected'>('submitted')

  // カレンダー管理タブ用
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)

  // 勤務パターンタブ用
  const [workPatterns, setWorkPatterns] = useState<WorkPattern[]>([])
  const [editingPattern, setEditingPattern] = useState<WorkPattern | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newStartTime, setNewStartTime] = useState('08:15')
  const [newEndTime, setNewEndTime] = useState('17:00')
  const [newDescription, setNewDescription] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('ログインが必要です')
        router.push('/login')
        return
      }

      const hasAccess = checkAccess(user.email || '', canManageSchedules)
      if (!hasAccess) {
        alert('勤務表管理の権限がありません')
        router.push('/admin')
        return
      }

      setUserEmail(user.email || '')
      setIsAuthorized(true)
      fetchApprovalData()
      fetchWorkPatterns()
    }
    checkAuth()
  }, [filter])

  const fetchApprovalData = async () => {
    setLoading(true)
    
    let query = supabase
      .from('monthly_applications')
      .select('*')
      .eq('application_type', 'schedule')
      .order('year_month', { ascending: false })
    
    if (filter === 'submitted') query = query.eq('status', 'submitted')
    else if (filter === 'approved') query = query.eq('status', 'approved')
    else if (filter === 'rejected') query = query.eq('status', 'rejected')
    
    const { data: appData } = await query
    setApplications(appData || [])

    const { data: userData } = await supabase.from('user_profiles').select('*')
    const pMap: Record<string, string> = {}
    userData?.forEach((u: any) => pMap[u.email] = u.full_name)
    setUserProfiles(pMap)

    if (appData) {
      const detailsMap: Record<string, DailySchedule[]> = {}
      for (const app of appData) {
        const { data: schedData } = await supabase
          .from('daily_schedules')
          .select('date, work_pattern_code, leave_annual, leave_hourly, leave_childcare, leave_nursing')
          .eq('user_id', app.user_id)
          .gte('date', `${app.year_month}-01`)
          .lte('date', `${app.year_month}-31`)
          .order('date')
        
        detailsMap[`${app.user_id}_${app.year_month}`] = schedData || []
      }
      setScheduleDetails(detailsMap)
    }
    
    setLoading(false)
  }

  const fetchWorkPatterns = async () => {
    const { data } = await supabase.from('work_patterns').select('*').order('code')
    setWorkPatterns(data || [])
  }

  const handleDecision = async (app: MonthlyApplication, decision: 'approved' | 'rejected') => {
    const label = decision === 'approved' ? '承認' : '却下'
    if (!confirm(`${app.year_month} の勤務表を${label}しますか？`)) return
    
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

  const countWorkDays = (userId: string, yearMonth: string) => {
    const details = scheduleDetails[`${userId}_${yearMonth}`] || []
    return details.filter(d => d.work_pattern_code && !d.work_pattern_code.includes('休')).length
  }

  // カレンダーCSVアップロード
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage('読み込み中...')

    const reader = new FileReader()
    reader.onload = async (event) => {
      const csvText = event.target?.result as string
      const lines = csvText.split(/\r\n|\n/)
      
      let count = 0
      for (const line of lines) {
        const [rawDate, type] = line.split(',').map(s => s.trim())
        if (!rawDate || !type) continue

        const date = rawDate.replace(/\//g, '-')

        const { error } = await supabase.from('school_calendar').upsert({
          date: date,
          day_type: type
        }, { onConflict: 'date' })
        
        if (!error) count++
      }
      setMessage(`${count}件のスケジュールを登録しました！`)
      setUploading(false)
    }
    reader.readAsText(file)
  }

  // 勤務パターン追加
  const handleAddPattern = async () => {
    if (!newCode || !newStartTime || !newEndTime) {
      alert('すべての項目を入力してください')
      return
    }

    const { error } = await supabase.from('work_patterns').insert({
      code: newCode,
      start_time: newStartTime,
      end_time: newEndTime,
      description: newDescription
    })

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert('追加しました！')
      setIsAddingNew(false)
      setNewCode('')
      setNewStartTime('08:15')
      setNewEndTime('17:00')
      setNewDescription('')
      fetchWorkPatterns()
    }
  }

  // 勤務パターン更新
  const handleUpdatePattern = async (pattern: WorkPattern) => {
    const { error } = await supabase
      .from('work_patterns')
      .update({
        start_time: pattern.start_time,
        end_time: pattern.end_time,
        description: pattern.description
      })
      .eq('id', pattern.id)

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert('更新しました！')
      setEditingPattern(null)
      fetchWorkPatterns()
    }
  }

  // 勤務パターン削除
  const handleDeletePattern = async (id: number) => {
    if (!confirm('この勤務パターンを削除しますか？\n※既に使用されているデータには影響しません。')) return

    const { error } = await supabase.from('work_patterns').delete().eq('id', id)

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert('削除しました！')
      fetchWorkPatterns()
    }
  }

  if (!isAuthorized) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <div className="bg-green-600 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">⏰</span> 勤務表管理（担当：小松・武田事務長）
          </h1>
          <button onClick={() => router.push('/admin')} className="text-xs bg-green-700 px-4 py-2 rounded hover:bg-green-800 font-bold border border-green-500">
            ← ダッシュボードへ
          </button>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="bg-white border-b border-slate-200 sticky top-[60px] z-10">
        <div className="max-w-7xl mx-auto flex gap-1 px-6">
          <button 
            onClick={() => setActiveTab('approval')}
            className={`px-6 py-3 font-bold text-sm transition ${activeTab === 'approval' ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            承認管理
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`px-6 py-3 font-bold text-sm transition ${activeTab === 'calendar' ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            カレンダー登録
          </button>
          <button 
            onClick={() => setActiveTab('patterns')}
            className={`px-6 py-3 font-bold text-sm transition ${activeTab === 'patterns' ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            勤務パターン設定
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        
        {/* 承認管理タブ */}
        {activeTab === 'approval' && (
          <div>
            <div className="flex gap-2 mb-6">
              <button onClick={() => setFilter('submitted')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'submitted' ? 'bg-green-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>承認待ち</button>
              <button onClick={() => setFilter('approved')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'approved' ? 'bg-green-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>承認済み</button>
              <button onClick={() => setFilter('rejected')} className={`px-4 py-2 rounded-full font-bold text-sm ${filter === 'rejected' ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-500 border'}`}>却下済み</button>
            </div>

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
                      const workDays = countWorkDays(app.user_id, app.year_month)
                      const details = scheduleDetails[`${app.user_id}_${app.year_month}`] || []
                      const isExpanded = expandedApp === app.id

                      return (
                          <div key={app.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:border-green-300 transition">
                              
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
                                      <div className="text-lg font-bold text-green-600 mt-2">
                                          勤務日数: {workDays}日
                                          <span className="text-xs text-slate-400 ml-2">({details.length}日分登録)</span>
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

                              {isExpanded && (
                                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                                      <h4 className="font-bold text-slate-700 mb-3 text-sm">勤務表明細</h4>
                                      {details.length === 0 ? (
                                          <div className="text-slate-400 text-sm">勤務データがありません</div>
                                      ) : (
                                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                              {details.map((item, idx) => (
                                                  <div key={idx} className="bg-white p-2 rounded-lg text-xs border border-slate-200">
                                                      <div className="flex justify-between items-center">
                                                          <span className="font-bold text-slate-700">{item.date.split('-')[2]}日</span>
                                                          <span className={`font-bold ${item.work_pattern_code?.includes('休') ? 'text-red-600' : 'text-green-600'}`}>
                                                              {item.work_pattern_code || '未設定'}
                                                          </span>
                                                      </div>
                                                      {(item.leave_annual || item.leave_hourly) && (
                                                          <div className="text-xs text-orange-600 mt-1">
                                                              {item.leave_annual && `年休: ${item.leave_annual}`}
                                                              {item.leave_hourly && `時間休: ${item.leave_hourly}`}
                                                          </div>
                                                      )}
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

        {/* カレンダー登録タブ */}
        {activeTab === 'calendar' && (
          <div className="bg-white p-8 rounded-2xl shadow-md">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">年間勤務予定の登録</h2>

            <div className="p-6 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
              <p className="mb-4 text-slate-600 font-bold">CSVファイルをアップロード</p>
              <p className="mb-4 text-xs text-slate-400 text-left">
                ※Excelから「名前を付けて保存」→「CSV (カンマ区切り)」で保存したファイルを使います。<br/>
                ※A列に日付（yyyy/mm/dd）、B列に区分（勤務日/休日など）が入っている必要があります。
              </p>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload} 
                disabled={uploading}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
              />
            </div>
            
            {message && (
              <div className={`mt-6 p-4 rounded ${message.includes('登録') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                {message}
              </div>
            )}
          </div>
        )}

        {/* 勤務パターン設定タブ */}
        {activeTab === 'patterns' && (
          <div className="bg-white p-6 rounded-2xl shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800">勤務パターン設定</h2>
              <button 
                onClick={() => setIsAddingNew(!isAddingNew)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-700 transition"
              >
                {isAddingNew ? 'キャンセル' : '+ 新規追加'}
              </button>
            </div>

            {isAddingNew && (
              <div className="bg-green-50 p-4 rounded-lg mb-4 border-2 border-green-200">
                <h3 className="font-bold text-slate-700 mb-3">新しい勤務パターン</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">コード</label>
                    <input 
                      type="text" 
                      value={newCode} 
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="例: A"
                      className="w-full p-2 border rounded text-sm font-bold text-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">開始時刻</label>
                    <input 
                      type="time" 
                      value={newStartTime} 
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="w-full p-2 border rounded text-sm font-bold text-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">終了時刻</label>
                    <input 
                      type="time" 
                      value={newEndTime} 
                      onChange={(e) => setNewEndTime(e.target.value)}
                      className="w-full p-2 border rounded text-sm font-bold text-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">説明</label>
                    <input 
                      type="text" 
                      value={newDescription} 
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="例: 通常勤務"
                      className="w-full p-2 border rounded text-sm font-bold text-black"
                    />
                  </div>
                </div>
                <button 
                  onClick={handleAddPattern}
                  className="mt-3 bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition"
                >
                  追加する
                </button>
              </div>
            )}

            {loading ? (
              <div className="text-center py-10 text-slate-400">読み込み中...</div>
            ) : (
              <div className="space-y-2">
                {workPatterns.map((pattern) => (
                  <div key={pattern.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    {editingPattern?.id === pattern.id ? (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">コード</label>
                          <input 
                            type="text" 
                            value={editingPattern.code} 
                            disabled
                            className="w-full p-2 border rounded text-sm font-bold bg-gray-100 text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">開始時刻</label>
                          <input 
                            type="time" 
                            value={editingPattern.start_time} 
                            onChange={(e) => setEditingPattern({...editingPattern, start_time: e.target.value})}
                            className="w-full p-2 border rounded text-sm font-bold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">終了時刻</label>
                          <input 
                            type="time" 
                            value={editingPattern.end_time} 
                            onChange={(e) => setEditingPattern({...editingPattern, end_time: e.target.value})}
                            className="w-full p-2 border rounded text-sm font-bold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">説明</label>
                          <input 
                            type="text" 
                            value={editingPattern.description} 
                            onChange={(e) => setEditingPattern({...editingPattern, description: e.target.value})}
                            className="w-full p-2 border rounded text-sm font-bold text-black"
                          />
                        </div>
                        <div className="col-span-full flex gap-2">
                          <button 
                            onClick={() => handleUpdatePattern(editingPattern)}
                            className="bg-green-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-green-700"
                          >
                            保存
                          </button>
                          <button 
                            onClick={() => setEditingPattern(null)}
                            className="bg-slate-300 text-slate-700 px-4 py-2 rounded font-bold text-sm hover:bg-slate-400"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-lg text-slate-800 w-12">{pattern.code}</span>
                          <span className="text-sm text-slate-600">
                            {pattern.start_time.slice(0, 5)} - {pattern.end_time.slice(0, 5)}
                          </span>
                          <span className="text-sm text-slate-500">{pattern.description}</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setEditingPattern(pattern)}
                            className="bg-green-100 text-green-600 px-3 py-1 rounded font-bold text-xs hover:bg-green-200"
                          >
                            編集
                          </button>
                          <button 
                            onClick={() => handleDeletePattern(pattern.id)}
                            className="bg-red-100 text-red-600 px-3 py-1 rounded font-bold text-xs hover:bg-red-200"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ローディングオーバーレイ */}
        {(loading || uploading) && (
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
