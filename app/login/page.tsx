'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null)
  
  // ★メール送信完了状態かどうか
  const [isEmailSent, setIsEmailSent] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      if (isSignUp) {
        // 新規登録
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback`,
          },
        })
        if (error) throw error
        
        // ★成功したら画面を切り替える
        setIsEmailSent(true)
        setMessage({ text: '確認メールを送信しました！', type: 'success' })
      } else {
        // ログイン
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/')
      }
    } catch (error: any) {
      setMessage({ text: error.message, type: 'error' })
      setLoading(false)
    }
  }

  // ★送信完了画面（Gmailボタン付き）
  if (isEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📩</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">確認メールを送信しました</h2>
          <p className="text-sm text-slate-600 mb-6">
            <strong>{email}</strong> 宛にメールを送りました。<br/>
            メール内のリンクをタップして登録を完了してください。
          </p>

          {/* Gmailを開くボタン */}
          <a 
            href="https://mail.google.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block w-full bg-red-500 text-white font-bold py-3 rounded-lg hover:bg-red-600 transition mb-3 shadow"
          >
            📬 Gmailを開く
          </a>
          
          {/* その他のメーラー用 */}
          <a 
            href="mailto:" 
            className="block w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-lg hover:bg-slate-200 transition text-sm"
          >
            その他のメールアプリを開く
          </a>

          <button 
            onClick={() => setIsEmailSent(false)}
            className="mt-6 text-xs text-slate-400 underline"
          >
            戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-6">
          {isSignUp ? '新規アカウント作成' : '部活動手当管理'}
        </h1>
        
        {message && (
          <div className={`p-3 rounded text-sm mb-4 ${message.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 mt-2"
          >
            {loading ? '処理中...' : (isSignUp ? '登録メールを送信' : 'ログイン')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setMessage(null)
            }}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントをお持ちでない方はこちら'}
          </button>
        </div>
      </div>
    </div>
  )
}