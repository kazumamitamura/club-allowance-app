'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { ACTIVITY_TYPES, DESTINATIONS, calculateAmount } from '@/utils/allowanceRules'

const ADMIN_EMAILS = ['mitamuraka@haguroko.ed.jp', 'tomonoem@haguroko.ed.jp'].map(e => e.toLowerCase())

const OVERTIME_ITEMS = [
  { key: 'overtime_weekday', label: '平日' },
  { key: 'overtime_weekday2', label: '平日2' },
  { key: 'overtime_late_night', label: '深夜' },
  { key: 'overtime_holiday', label: '休日' },
  { key: 'overtime_holiday_late', label: '休日深夜' },
  { key: 'lateness', label: '遅刻' },
  { key: 'early_leave', label: '早退' },
]

const LEAVE_ITEMS_TIME = [
  { key: 'leave_hourly', label: '時間年休' },
  { key: 'leave_childcare', label: '育児休暇' },
  { key: 'leave_nursing', label: '介護休暇' },
  { key: 'leave_special_paid', label: 'その他特休(有給)' },
  { key: 'leave_special_unpaid', label: 'その他特休(無給)' },
  { key: 'leave_duty_exemption', label: '義務免' },
  { key: 'leave_holiday_shift', label: '休振' },
  { key: 'leave_comp_day', label: '振休・代休' },
  { key: 'leave_admin', label: '管休' },
]

type Allowance = { id: number, user_id: string, date: string, activity_type: string, amount: number, destination_type: string, destination_detail: string, is_driving: boolean, is_accommodation: boolean }
type WorkPattern = { id: number, code: string, start_time: string, end_time: string, description: string }
type DailySchedule = { id: number, user_id: string, date: string, work_pattern_code: string | null, [key: string]: any }
type SchoolCalendar = { date: string, day_type: string }
type MasterSchedule = { date: string, work_pattern_code: string }

const formatDate = (date: Date) => {
  const y = date.getFullYear()
  const m = ('00' + (date.getMonth() + 1)).slice(-2)
  const d = ('00' + date.getDate()).slice(-2)
  return `${y}-${m}-${d}`
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  
  const [userEmail, setUserEmail] = useState('')
  const [allowances, setAllowances] = useState<Allowance[]>([])
  const [schedules, setSchedules] = useState<DailySchedule[]>([])
  const [schoolCalendar, setSchoolCalendar] = useState<SchoolCalendar[]>([])
  const [masterSchedules, setMasterSchedules] = useState<MasterSchedule[]>([])
  const [workPatterns, setWorkPatterns] = useState<WorkPattern[]>([])
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dayType, setDayType] = useState<string>('---')
  const [isRegistered, setIsRegistered] = useState(false)
  const [selectedPattern, setSelectedPattern] = useState('C')
  const [details, setDetails] = useState<any>({})
  const [openCategory, setOpenCategory] = useState<'overtime' | 'leave' | null>(null)

  const [activityId, setActivityId] = useState('')
  const [destinationId, setDestinationId] = useState('school')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [isDriving, setIsDriving] = useState(false)
  const [isAccommodation, setIsAccommodation] = useState(false)
  const [calculatedAmount, setCalculatedAmount] = useState(0)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email || '')
      
      fetchAllowances()
      fetchSchedules() 
      fetchSchoolCalendar()
      fetchMasterSchedules()
      
      const { data } = await supabase.from('work_patterns').select('*').order('code')
      if (data) setWorkPatterns(data)
    }
    init()
  }, [])

  useEffect(() => {
    const updateDayInfo = async () => {
      const dateStr = formatDate(selectedDate)
      
      const calData = schoolCalendar.find(c => c.date === dateStr)
      const type = calData?.day_type || (selectedDate.getDay() % 6 === 0 ? '休日(仮)' : '勤務日(仮)')
      setDayType(type)
      
      const masterSchedule = masterSchedules.find(m => m.date === dateStr)
      const defaultPattern = masterSchedule?.work_pattern_code || (type.includes('休日') || type.includes('週休') ? '' : 'C')

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: scheduleData } = await supabase.from('daily_schedules').select('*').eq('user_id', user.id).eq('date', dateStr).single()
        if (scheduleData) {
          setIsRegistered(true)
          setSelectedPattern(scheduleData.work_pattern_code || defaultPattern) 
          
          const newDetails: any = {}
          OVERTIME_ITEMS.forEach(i => { if (scheduleData[i.key]) newDetails[i.key] = scheduleData[i.key] })
          if (scheduleData.leave_annual) newDetails['leave_annual'] = scheduleData.leave_annual
          LEAVE_ITEMS_TIME.forEach(i => { if (scheduleData[i.key]) newDetails[i.key] = scheduleData[i.key] })
          setDetails(newDetails)
        } else {
          setIsRegistered(false)
          setSelectedPattern(defaultPattern) 
          setDetails({})
        }
      }

      const allowance = allowances.find(a => a.date === dateStr)
      if (allowance) {
        setActivityId(allowance.activity_type === allowance.activity_type ? (ACTIVITY_TYPES.find(t => t.label === allowance.activity_type)?.id || allowance.activity_type) : '')
        setDestinationId(DESTINATIONS.find(d => d.label === allowance.destination_type)?.id || 'school')
        setDestinationDetail(allowance.destination_detail || '')
        setIsDriving(allowance.is_driving)
        setIsAccommodation(allowance.is_accommodation)
      } else {
        setActivityId('')
        setDestinationId('school')
        setDestinationDetail('')
        setIsDriving(false)
        setIsAccommodation(false)
      }
    }
    updateDayInfo()
  }, [selectedDate, allowances, schoolCalendar, masterSchedules])

  useEffect(() => {
    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
    if (!activityId) { setCalculatedAmount(0); return }
    const amt = calculateAmount(activityId, isDriving, destinationId, isWorkDay)
    setCalculatedAmount(amt)
  }, [activityId, isDriving, destinationId, dayType])

  const fetchAllowances = async () => {
    const { data } = await supabase.from('allowances').select('*').order('date', { ascending: false })
    setAllowances(data || [])
  }
  const fetchSchedules = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('daily_schedules').select('*').eq('user_id', user.id)
    setSchedules(data || [])
  }
  const fetchSchoolCalendar = async () => {
    const { data } = await supabase.from('school_calendar').select('*')
    setSchoolCalendar(data || [])
  }
  const fetchMasterSchedules = async () => {
    const { data } = await supabase.from('master_schedules').select('*')
    setMasterSchedules(data || [])
  }

  const updateDetail = (key: string, value: string) => {
    setDetails((prev: any) => { const next = { ...prev }; if (value === '') delete next[key]; else next[key] = value; return next })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const dateStr = formatDate(selectedDate)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // ★修正: user_email も保存する
    const scheduleData: any = { 
        user_id: user.id, 
        user_email: user.email, // 追加
        date: dateStr, 
        work_pattern_code: selectedPattern, 
        leave_annual: details['leave_annual'] || null 
    };
    [...OVERTIME_ITEMS, ...LEAVE_ITEMS_TIME].forEach(item => { scheduleData[item.key] = details[item.key] || null })

    const { error: sErr } = await supabase.from('daily_schedules').upsert(scheduleData, { onConflict: 'user_id, date' })
    if (sErr) { alert('エラー: ' + sErr.message); return }

    if (activityId) {
      await supabase.from('allowances').delete().eq('user_id', user.id).eq('date', dateStr)
      await supabase.from('allowances').insert({ user_id: user.id, user_email: user.email, date: dateStr, activity_type: ACTIVITY_TYPES.find(a => a.id === activityId)?.label || activityId, destination_type: DESTINATIONS.find(d => d.id === destinationId)?.label, destination_detail: destinationDetail, is_driving: isDriving, is_accommodation: isAccommodation, amount: calculatedAmount })
      fetchAllowances()
    } else {
      await supabase.from('allowances').delete().eq('user_id', user.id).eq('date', dateStr)
      fetchAllowances()
    }
    setIsRegistered(true); setOpenCategory(null); fetchSchedules(); alert('保存しました')
  }

  const handleBulkRegister = async () => {
    if (!confirm(`${selectedDate.getMonth()+1}月の未入力日を、すべて「デフォルト勤務（C）」として一括登録しますか？`)) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const year = selectedDate.getFullYear(), month = selectedDate.getMonth(), lastDay = new Date(year, month + 1, 0).getDate()
    const updates = []
    
    for (let d = 1; d <= lastDay; d++) {
        const dateStr = formatDate(new Date(year, month, d))
        const master = masterSchedules.find(m => m.date === dateStr)
        const pattern = master?.work_pattern_code || 'C'
        
        // ★修正: user_email も保存する
        updates.push({ 
            user_id: user.id, 
            user_email: user.email, // 追加
            date: dateStr, 
            work_pattern_code: pattern 
        }) 
    }
    const { error } = await supabase.from('daily_schedules').upsert(updates, { onConflict: 'user_id, date', ignoreDuplicates: true })
    if (error) alert('エラー: ' + error.message); else { alert('完了しました！'); fetchSchedules(); router.refresh() }
  }

  const handleDelete = async (id: number) => { if (!window.confirm('削除しますか？')) return; const { error } = await supabase.from('allowances').delete().eq('id', id); if (!error) fetchAllowances() }
  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }
  const handlePrevMonth = () => { const d = new Date(selectedDate); d.setMonth(d.getMonth() - 1); setSelectedDate(d) }
  const handleNextMonth = () => { const d = new Date(selectedDate); d.setMonth(d.getMonth() + 1); setSelectedDate(d) }
  const calculateMonthTotal = () => { const m = selectedDate.getMonth(), y = selectedDate.getFullYear(); return allowances.filter(i => { const d = new Date(i.date); return d.getMonth() === m && d.getFullYear() === y }).reduce((s, i) => s + i.amount, 0) }

  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const dateStr = formatDate(date)
    const schedule = schedules.find(s => s.date === dateStr)
    const master = masterSchedules.find(m => m.date === dateStr)
    const calData = schoolCalendar.find(c => c.date === dateStr)
    const allowance = allowances.find(i => i.date === dateStr)

    let label = ''; let labelColor = 'text-black'
    if (schedule?.work_pattern_code) {
        label = schedule.work_pattern_code
        if (label.includes('休')) labelColor = 'text-red-600'
    } else if (master?.work_pattern_code) {
        label = master.work_pattern_code
    } else {
        if (calData?.day_type?.includes('休')) { label = '休'; labelColor = 'text-red-600' }
    }

    return (
      <div className="flex flex-col items-center justify-start h-8">
        {label && <span className={`text-[10px] font-extrabold leading-none ${labelColor}`}>{label}</span>}
        {allowance && <span className="text-[9px] font-bold text-black leading-tight -mt-0.5">¥{allowance.amount.toLocaleString()}</span>}
      </div>
    )
  }
  
  const isAdmin = ADMIN_EMAILS.includes(userEmail.toLowerCase())
  const currentPatternDetail = workPatterns.find(p => p.code === selectedPattern)
  const hasOvertime = OVERTIME_ITEMS.some(i => details[i.key])
  const hasLeave = details['leave_annual'] || LEAVE_ITEMS_TIME.some(i => details[i.key])

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
       {isAdmin && <div className="bg-slate-800 text-white text-center py-3 text-sm font-bold shadow-md"><a href="/admin" className="underline hover:text-blue-300 transition">事務担当者ページへ</a></div>}

      <div className="bg-white px-6 py-4 rounded-b-3xl shadow-sm mb-6 sticky top-0 z-10">
        <button onClick={handleLogout} className="absolute right-4 top-4 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-2 rounded-full">ログアウト</button>
        <div className="flex flex-col items-center mt-2">
          <div className="flex items-center gap-4 mb-2">
            <button onClick={handlePrevMonth} className="text-slate-400 p-2 text-xl font-bold">‹</button>
            <h2 className="text-sm text-slate-500 font-bold">{selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月</h2>
            <button onClick={handleNextMonth} className="text-slate-400 p-2 text-xl font-bold">›</button>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-800">¥{calculateMonthTotal().toLocaleString()}</h1>
          <button onClick={handleBulkRegister} className="mt-3 text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full border border-blue-200 hover:bg-blue-100 shadow-sm">📋 今月の予定を一括登録 (コピペ)</button>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-6">
        <div className="bg-white p-4 rounded-3xl shadow-sm">
          <Calendar onChange={(val) => setSelectedDate(val as Date)} value={selectedDate} activeStartDate={selectedDate} onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setSelectedDate(activeStartDate)} locale="ja-JP" tileContent={getTileContent} className="w-full border-none" />
        </div>

        <div className={`p-6 rounded-3xl shadow-sm border ${isRegistered ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="font-bold text-slate-700 text-sm">{selectedDate.getMonth() + 1}/{selectedDate.getDate()} の勤務・手当</h2>
            <span className={`text-xs px-2 py-1 rounded font-bold ${isRegistered ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-500'}`}>{isRegistered ? '登録済' : '未登録'}</span>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-black mb-1">勤務パターン</label>
              <div className="flex items-center gap-2">
                <select value={selectedPattern} onChange={(e) => setSelectedPattern(e.target.value)} className="flex-1 bg-white p-2 rounded border border-slate-300 font-bold text-black">
                  <option value="">(未設定)</option>
                  {workPatterns.map(p => <option key={p.id} value={p.code}>{p.code} ({p.start_time.slice(0,5)}-{p.end_time.slice(0,5)})</option>)}
                </select>
                <div className="text-xs text-black font-bold w-1/3 text-right">{currentPatternDetail?.description}</div>
              </div>
            </div>

            <div className={`bg-white rounded-xl border transition-all ${openCategory === 'overtime' ? 'border-orange-400 ring-2 ring-orange-100' : hasOvertime ? 'border-orange-300' : 'border-slate-200'}`}>
              <button type="button" onClick={() => setOpenCategory(openCategory === 'overtime' ? null : 'overtime')} className="w-full flex justify-between items-center p-3 text-left">
                <div className="flex items-center gap-2"><span className="text-lg">⏰</span><span className={`text-xs font-bold ${hasOvertime ? 'text-orange-600' : 'text-black'}`}>超過勤務・遅刻早退</span></div>
                <span className="text-slate-400 text-xs">{openCategory === 'overtime' ? '▲ 閉じる' : hasOvertime ? '詳細あり ▼' : '追加する +'}</span>
              </button>
              {(openCategory === 'overtime' || hasOvertime) && (
                <div className="p-3 pt-0 border-t border-slate-100 bg-orange-50/30 rounded-b-xl space-y-3">
                   {openCategory === 'overtime' && (<div className="mb-2"><p className="text-[10px] text-slate-500 mb-1">項目を選択:</p><div className="flex flex-wrap gap-2">{OVERTIME_ITEMS.map(item => (<button key={item.key} type="button" onClick={() => updateDetail(item.key, details[item.key] ? '' : '00:00')} className={`text-xs px-2 py-1 rounded border font-bold ${details[item.key] ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-black border-slate-300'}`}>{item.label}</button>))}</div></div>)}
                   {OVERTIME_ITEMS.filter(i => details[i.key] !== undefined).map(item => (<div key={item.key} className="flex items-center gap-2 animate-fadeIn"><label className="text-xs font-bold text-black w-20">{item.label}</label><input type="text" placeholder="1:00" value={details[item.key] || ''} onChange={(e) => updateDetail(item.key, e.target.value)} className="flex-1 p-2 rounded border border-slate-300 text-sm text-black font-bold" /><button type="button" onClick={() => updateDetail(item.key, '')} className="text-slate-400 hover:text-red-500">×</button></div>))}
                </div>
              )}
            </div>

            <div className={`bg-white rounded-xl border transition-all ${openCategory === 'leave' ? 'border-green-400 ring-2 ring-green-100' : hasLeave ? 'border-green-300' : 'border-slate-200'}`}>
              <button type="button" onClick={() => setOpenCategory(openCategory === 'leave' ? null : 'leave')} className="w-full flex justify-between items-center p-3 text-left">
                 <div className="flex items-center gap-2"><span className="text-lg">🌴</span><span className={`text-xs font-bold ${hasLeave ? 'text-green-600' : 'text-black'}`}>休暇・欠勤</span></div>
                <span className="text-slate-400 text-xs">{openCategory === 'leave' ? '▲ 閉じる' : hasLeave ? '詳細あり ▼' : '追加する +'}</span>
              </button>
              {(openCategory === 'leave' || hasLeave) && (
                <div className="p-3 pt-0 border-t border-slate-100 bg-green-50/30 rounded-b-xl space-y-3">
                   {openCategory === 'leave' && (<div className="mb-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => updateDetail('leave_annual', details['leave_annual'] ? '' : '1日')} className={`text-xs px-2 py-1 rounded border font-bold ${details['leave_annual'] ? 'bg-green-500 text-white border-green-600' : 'bg-white text-black border-slate-300'}`}>年休(1日/半日)</button>{LEAVE_ITEMS_TIME.map(item => (<button key={item.key} type="button" onClick={() => updateDetail(item.key, details[item.key] ? '' : '00:00')} className={`text-xs px-2 py-1 rounded border font-bold ${details[item.key] ? 'bg-green-500 text-white border-green-600' : 'bg-white text-black border-slate-300'}`}>{item.label}</button>))}</div></div>)}
                   {details['leave_annual'] !== undefined && (<div className="flex items-center gap-2 animate-fadeIn bg-white p-2 rounded border border-green-200"><span className="text-xs font-bold text-green-700 w-12">年休</span><div className="flex gap-2"><label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={details['leave_annual'] === '1日'} onChange={() => updateDetail('leave_annual', '1日')} className="accent-green-600" /><span className="text-xs text-black font-bold">1日</span></label><label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={details['leave_annual'] === '半日'} onChange={() => updateDetail('leave_annual', '半日')} className="accent-green-600" /><span className="text-xs text-black font-bold">半日</span></label></div><button type="button" onClick={() => updateDetail('leave_annual', '')} className="ml-auto text-slate-400 hover:text-red-500">×</button></div>)}
                   {LEAVE_ITEMS_TIME.filter(i => details[i.key] !== undefined).map(item => (<div key={item.key} className="flex items-center gap-2 animate-fadeIn"><label className="text-xs font-bold text-black w-24 truncate">{item.label}</label><input type="text" placeholder="時間" value={details[item.key] || ''} onChange={(e) => updateDetail(item.key, e.target.value)} className="flex-1 p-2 rounded border border-slate-300 text-sm text-black font-bold" /><button type="button" onClick={() => updateDetail(item.key, '')} className="text-slate-400 hover:text-red-500">×</button></div>))}
                </div>
              )}
            </div>

            <hr className="border-slate-100" />
            <div>
              <label className="block text-xs font-bold text-black mb-1">部活動 業務内容</label>
              <select value={activityId} onChange={(e) => setActivityId(e.target.value)} className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 font-bold text-black text-sm">
                <option value="">なし (部活なし)</option>
                {ACTIVITY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </div>
            {activityId && (
            <>
                <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs font-bold text-black mb-1">区分</label><select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="w-full bg-white p-3 rounded-lg border border-slate-200 text-xs text-black font-bold">{DESTINATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-black mb-1">詳細 (会場名等)</label><input type="text" placeholder="例: 県体育館" value={destinationDetail} onChange={(e) => setDestinationDetail(e.target.value)} className="w-full bg-white p-3 rounded-lg border border-slate-200 text-xs text-black font-bold" /></div>
                </div>
                <div className="flex gap-3">
                <label className={`flex-1 p-3 rounded-lg cursor-pointer border text-center text-xs font-bold ${isDriving ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}><input type="checkbox" checked={isDriving} onChange={e => setIsDriving(e.target.checked)} className="hidden" />🚗 運転あり</label>
                <label className={`flex-1 p-3 rounded-lg cursor-pointer border text-center text-xs font-bold ${isAccommodation ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}><input type="checkbox" checked={isAccommodation} onChange={e => setIsAccommodation(e.target.checked)} className="hidden" />🏨 宿泊あり</label>
                </div>
                <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center"><span className="text-xs font-medium">支給予定額</span><span className="text-xl font-bold">¥{calculatedAmount.toLocaleString()}</span></div>
            </>
            )}
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-md">この内容で保存する</button>
          </form>
        </div>

        <div className="space-y-2 pb-10">
            <h3 className="font-bold text-slate-400 text-xs px-2">{selectedDate.getMonth() + 1}月の手当履歴</h3>
            {allowances.filter(i => { const d = new Date(i.date); return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear() }).map((item) => (
            <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border border-slate-100">
                <div className="flex items-center gap-3"><span className="font-bold text-slate-700 text-sm">{item.date.split('-')[2]}日</span><span className="text-xs text-slate-500">{item.activity_type}</span></div>
                <div className="flex items-center gap-2"><span className="font-bold text-slate-700 text-sm">¥{item.amount.toLocaleString()}</span><button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500">🗑</button></div>
            </div>
            ))}
        </div>
      </div>
    </div>
  )
}