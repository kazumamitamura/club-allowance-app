'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const ADMIN_EMAILS = [
  'mitamuraka@haguroko.ed.jp',
  'tomonoem@haguroko.ed.jp'
].map(email => email.toLowerCase())

type WorkPattern = {
  id: number
  code: string
  start_time: string
  end_time: string
  description: string
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [workPatterns, setWorkPatterns] = useState<WorkPattern[]>([])
  const [editingPattern, setEditingPattern] = useState<WorkPattern | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)

  // 新規追加用
  const [newCode, setNewCode] = useState('')
  const [newStartTime, setNewStartTime] = useState('08:15')
  const [newEndTime, setNewEndTime] = useState('17:00')
  const [newDescription, setNewDescription] = useState('')

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
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase.from('work_patterns').select('*').order('code')
    setWorkPatterns(data || [])
    setLoading(false)
  }

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
      fetchData()
    }
  }

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
      fetchData()
    }
  }

  const handleDeletePattern = async (id: number) => {
    if (!confirm('この勤務パターンを削除しますか？\n※既に使用されているデータには影響しません。')) return

    const { error } = await supabase.from('work_patterns').delete().eq('id', id)

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert('削除しました！')
      fetchData()
    }
  }

  if (!isAdmin) return <div className="p-10 text-center">確認中...</div>

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">⚙️</span> システム設定
        </h1>
        <button onClick={() => router.push('/admin')} className="text-xs bg-slate-700 px-4 py-2 rounded hover:bg-slate-600 font-bold border border-slate-600">
            ← ダッシュボードへ
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        
        {/* 勤務パターン設定 */}
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">勤務パターン設定</h2>
            <button 
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition"
            >
              {isAddingNew ? 'キャンセル' : '+ 新規追加'}
            </button>
          </div>

          {/* 新規追加フォーム */}
          {isAddingNew && (
            <div className="bg-blue-50 p-4 rounded-lg mb-4 border-2 border-blue-200">
              <h3 className="font-bold text-slate-700 mb-3">新しい勤務パターン</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">コード</label>
                  <input 
                    type="text" 
                    value={newCode} 
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="例: A"
                    className="w-full p-2 border rounded text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">開始時刻</label>
                  <input 
                    type="time" 
                    value={newStartTime} 
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full p-2 border rounded text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">終了時刻</label>
                  <input 
                    type="time" 
                    value={newEndTime} 
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full p-2 border rounded text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">説明</label>
                  <input 
                    type="text" 
                    value={newDescription} 
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="例: 通常勤務"
                    className="w-full p-2 border rounded text-sm font-bold"
                  />
                </div>
              </div>
              <button 
                onClick={handleAddPattern}
                className="mt-3 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition"
              >
                追加する
              </button>
            </div>
          )}

          {/* 既存パターン一覧 */}
          {loading ? (
            <div className="text-center py-10 text-slate-400">読み込み中...</div>
          ) : (
            <div className="space-y-2">
              {workPatterns.map((pattern) => (
                <div key={pattern.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  {editingPattern?.id === pattern.id ? (
                    // 編集モード
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">コード</label>
                        <input 
                          type="text" 
                          value={editingPattern.code} 
                          disabled
                          className="w-full p-2 border rounded text-sm font-bold bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">開始時刻</label>
                        <input 
                          type="time" 
                          value={editingPattern.start_time} 
                          onChange={(e) => setEditingPattern({...editingPattern, start_time: e.target.value})}
                          className="w-full p-2 border rounded text-sm font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">終了時刻</label>
                        <input 
                          type="time" 
                          value={editingPattern.end_time} 
                          onChange={(e) => setEditingPattern({...editingPattern, end_time: e.target.value})}
                          className="w-full p-2 border rounded text-sm font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">説明</label>
                        <input 
                          type="text" 
                          value={editingPattern.description} 
                          onChange={(e) => setEditingPattern({...editingPattern, description: e.target.value})}
                          className="w-full p-2 border rounded text-sm font-bold"
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
                    // 表示モード
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
                          className="bg-blue-100 text-blue-600 px-3 py-1 rounded font-bold text-xs hover:bg-blue-200"
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

        {/* 手当項目設定（将来拡張用） */}
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
      </div>
    </div>
  )
}
