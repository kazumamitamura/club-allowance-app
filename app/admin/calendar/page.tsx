'use client'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function CalendarUploadPage() {
  const supabase = createClient()
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMessage('読み込み中...')

    const reader = new FileReader()
    reader.onload = async (event) => {
      const csvText = event.target?.result as string
      const lines = csvText.split(/\r\n|\n/) // 改行コードの違いに対応
      
      let count = 0
      for (const line of lines) {
        // カンマ区切りで日付とタイプを取得 (例: 2026/04/01, 勤務日)
        const [rawDate, type] = line.split(',').map(s => s.trim())
        if (!rawDate || !type) continue

        // 日付を YYYY-MM-DD に変換 (Excelの日付形式によっては調整が必要)
        const date = rawDate.replace(/\//g, '-') 

        const { error } = await supabase.from('school_calendar').upsert({
          date: date,
          day_type: type
        }, { onConflict: 'date' })
        
        if (!error) count++
      }
      setMessage(`${count}件のスケジュールを登録しました！`)
      setLoading(false)
    }
    reader.readAsText(file)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">年間勤務予定の登録</h1>
          <button onClick={() => router.push('/')} className="text-sm text-slate-500 hover:underline">TOPへ戻る</button>
        </div>

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
            disabled={loading}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
        </div>
        
        {message && (
          <div className={`mt-6 p-4 rounded ${message.includes('登録') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}