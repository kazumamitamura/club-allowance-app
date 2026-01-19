'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { ACTIVITY_TYPES, DESTINATIONS, calculateAmount, canSelectActivity } from '@/utils/allowanceRules'
import { durationToHours, hoursToDisplayFormat, calculateLeaveBalance, daysToHours } from '@/utils/leaveCalculations'

const ADMIN_EMAILS = ['mitamuraka@haguroko.ed.jp', 'tomonoem@haguroko.ed.jp'].map(e => e.toLowerCase())

const LEAVE_TYPES = ['年次有給休暇', '夏季休暇', '慶弔休暇', '病気休暇', '産前産後休暇', '育児休暇', '介護休暇', '職免']
const LEAVE_DURATIONS = ['1日', '半日(午前)', '半日(午後)', '時間休']

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
type LeaveApplication = { 
  id: number
  user_id: string
  date: string
  leave_type: string
  duration_type: string  // 必須：期間タイプ
  hours_used: number     // 必須：消費時間（整数）
  reason: string
  status: string
  duration?: string      // 旧カラム（後方互換性のため残す）
}

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
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('') // 表示名
  const [isAdmin, setIsAdmin] = useState(false)

  const [allowances, setAllowances] = useState<Allowance[]>([])
  const [schedules, setSchedules] = useState<DailySchedule[]>([])
  const [schoolCalendar, setSchoolCalendar] = useState<SchoolCalendar[]>([])
  const [masterSchedules, setMasterSchedules] = useState<MasterSchedule[]>([]) 
  const [workPatterns, setWorkPatterns] = useState<WorkPattern[]>([])
  const [leaveApps, setLeaveApps] = useState<LeaveApplication[]>([])
  const [leaveBalance, setLeaveBalance] = useState<any>(null)
  
  const [allowanceStatus, setAllowanceStatus] = useState<'draft' | 'submitted' | 'approved'>('draft')
  const [scheduleStatus, setScheduleStatus] = useState<'draft' | 'submitted' | 'approved'>('draft')
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dayType, setDayType] = useState<string>('---')
  const [isRegistered, setIsRegistered] = useState(false)
  const [selectedPattern, setSelectedPattern] = useState('C')
  const [details, setDetails] = useState<any>({})
  
  const [openCategory, setOpenCategory] = useState<'leave' | 'application' | null>(null)

  // 氏名登録モーダル用
  const [showProfileModal, setShowProfileModal] = useState(false)
  
  // 入力フォームモーダル用
  const [showInputModal, setShowInputModal] = useState(false)
  const [inputLastName, setInputLastName] = useState('')
  const [inputFirstName, setInputFirstName] = useState('')

  // 休暇申請入力用
  const [leaveType, setLeaveType] = useState('年次有給休暇')
  const [leaveDuration, setLeaveDuration] = useState('1日')
  const [leaveHours, setLeaveHours] = useState(1) // 時間休の時間数
  const [leaveReason, setLeaveReason] = useState('')
  const [currentLeaveApp, setCurrentLeaveApp] = useState<LeaveApplication | null>(null)

  const [activityId, setActivityId] = useState('')
  const [destinationId, setDestinationId] = useState('inside_short')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [isDriving, setIsDriving] = useState(false)
  const [isAccommodation, setIsAccommodation] = useState(false)
  const [calculatedAmount, setCalculatedAmount] = useState(0)

  const getLockStatus = (targetDate: Date) => {
    if (isAdmin) return { schedule: false, allowance: false }
    const now = new Date()
    const deadline = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 6, 0, 0, 0)
    const isPastDeadline = now >= deadline
    const currentViewMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`
    const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
    const isTargetMonth = currentViewMonth === targetMonth
    return {
        schedule: isPastDeadline || (isTargetMonth && scheduleStatus !== 'draft'),
        allowance: isPastDeadline || (isTargetMonth && allowanceStatus !== 'draft')
    }
  }

  const { schedule: isSchedLocked, allowance: isAllowLocked } = getLockStatus(selectedDate)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email || '')
      setUserId(user.id)
      if (ADMIN_EMAILS.includes(user.email?.toLowerCase() || '')) setIsAdmin(true)
      
      // プロフィール取得
      fetchProfile(user.email || '')

      fetchData(user.id)
      fetchSchoolCalendar()
      fetchMasterSchedules()
      fetchApplicationStatus(user.id, selectedDate)
      fetchLeaveBalance(user.id)
      const { data } = await supabase.from('work_patterns').select('*').order('code')
      if (data) setWorkPatterns(data)
    }
    init()
  }, [])

  // ★氏名取得
  const fetchProfile = async (email: string) => {
      const { data } = await supabase.from('user_profiles').select('full_name').eq('email', email).single()
      if (data?.full_name) {
          setUserName(data.full_name)
      } else {
          // 名前未登録ならモーダルを出す（任意）
          // setShowProfileModal(true) 
      }
  }

  // ★氏名保存処理
  const handleSaveProfile = async () => {
      if (!inputLastName || !inputFirstName) {
          alert('姓と名の両方を入力してください')
          return
      }
      // 半角スペースで結合
      const fullName = `${inputLastName.trim()} ${inputFirstName.trim()}`
      
      const { error } = await supabase.from('user_profiles').upsert({
          email: userEmail,
          full_name: fullName
      })

      if (error) {
          alert('エラーが発生しました: ' + error.message)
      } else {
          setUserName(fullName)
          setShowProfileModal(false)
          alert('氏名を登録しました！')
      }
  }

  useEffect(() => { if (userId) fetchApplicationStatus(userId, selectedDate) }, [selectedDate, userId])

  const fetchData = async (uid: string) => {
    const { data: allowData } = await supabase.from('allowances').select('*').eq('user_id', uid).order('date', { ascending: false })
    setAllowances(allowData || [])
    const { data: schedData } = await supabase.from('daily_schedules').select('*').eq('user_id', uid)
    setSchedules(schedData || [])
    // 休暇申請データ取得
    const { data: leaveData } = await supabase.from('leave_applications').select('*').eq('user_id', uid)
    setLeaveApps(leaveData || [])
  }

  const fetchLeaveBalance = async (uid: string) => {
    const { data } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('user_id', uid)
      .single()
    
    if (data) {
      setLeaveBalance(data)
    } else {
      // デフォルト値（年休20日 = 160時間）
      setLeaveBalance({
        user_id: uid,
        annual_leave_total: daysToHours(20),
        annual_leave_used: 0
      })
    }
  }

  const fetchSchoolCalendar = async () => {
    const { data } = await supabase.from('school_calendar').select('*'); setSchoolCalendar(data || [])
  }
  const fetchMasterSchedules = async () => {
    const { data } = await supabase.from('master_schedules').select('*'); setMasterSchedules(data || [])
  }

  const fetchApplicationStatus = async (uid: string, date: Date) => {
    const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const { data } = await supabase.from('monthly_applications').select('application_type, status').eq('user_id', uid).eq('year_month', ym)
    const allow = data?.find(d => d.application_type === 'allowance')
    const sched = data?.find(d => d.application_type === 'schedule')
    setAllowanceStatus(allow?.status || 'draft')
    setScheduleStatus(sched?.status || 'draft')
  }

  useEffect(() => {
    const updateDayInfo = async () => {
      const dateStr = formatDate(selectedDate)
      const calData = schoolCalendar.find(c => c.date === dateStr)
      const type = calData?.day_type || (selectedDate.getDay() % 6 === 0 ? '休日(仮)' : '勤務日(仮)')
      setDayType(type)
      
      const masterSchedule = masterSchedules.find(m => m.date === dateStr)
      const defaultPattern = masterSchedule?.work_pattern_code || (type.includes('休日') || type.includes('週休') ? '' : 'C')
      const scheduleData = schedules.find(s => s.date === dateStr)
      
      if (scheduleData) {
        setIsRegistered(true)
        setSelectedPattern(scheduleData.work_pattern_code || defaultPattern)
        const newDetails: any = {}
        if (scheduleData.leave_annual) newDetails['leave_annual'] = scheduleData.leave_annual
        LEAVE_ITEMS_TIME.forEach(i => { if (scheduleData[i.key]) newDetails[i.key] = scheduleData[i.key] })
        setDetails(newDetails)
      } else {
        setIsRegistered(false); setSelectedPattern(defaultPattern); setDetails({})
      }

      // 休暇申請データの反映
      const leaveApp = leaveApps.find(l => l.date === dateStr)
      setCurrentLeaveApp(leaveApp || null)
      if (leaveApp) {
          setLeaveType(leaveApp.leave_type)
          const durationType = leaveApp.duration_type || leaveApp.duration || '1日'
          setLeaveDuration(durationType)
          // 時間休の場合は hours_used から時間数を復元
          if (durationType === '時間休' && leaveApp.hours_used) {
              setLeaveHours(leaveApp.hours_used)
          } else {
              setLeaveHours(1)
          }
          setLeaveReason(leaveApp.reason || '')
      } else {
          setLeaveType('年次有給休暇')
          setLeaveDuration('1日')
          setLeaveHours(1)
          setLeaveReason('')
      }

      const allowance = allowances.find(a => a.date === dateStr)
      if (allowance) {
        setActivityId(allowance.activity_type === allowance.activity_type ? (ACTIVITY_TYPES.find(t => t.label === allowance.activity_type)?.id || allowance.activity_type) : '')
        
        // 古いIDを新しいIDにマッピング（後方互換性）
        let mappedDestinationId = DESTINATIONS.find(d => d.label === allowance.destination_type)?.id || 'inside_short'
        // 旧IDから新IDへの変換
        const idMapping: Record<string, string> = {
          'kannai': 'inside_short',
          'kennai_short': 'inside_short',
          'kennai_long': 'inside_long',
          'kengai': 'outside'
        }
        if (idMapping[mappedDestinationId]) {
          mappedDestinationId = idMapping[mappedDestinationId]
        }
        
        setDestinationId(mappedDestinationId)
        setDestinationDetail(allowance.destination_detail || '')
        setIsDriving(allowance.is_driving); setIsAccommodation(allowance.is_accommodation)
      } else {
        setActivityId(''); setDestinationId('inside_short'); setDestinationDetail(''); setIsDriving(false); setIsAccommodation(false)
      }
    }
    updateDayInfo()
  }, [selectedDate, allowances, schedules, schoolCalendar, masterSchedules, leaveApps])

  useEffect(() => {
    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
    if (!activityId) { setCalculatedAmount(0); return }
    
    // 勤務日判定
    const validation = canSelectActivity(activityId, isWorkDay)
    if (!validation.allowed) {
      // 警告を表示（選択は可能だが警告）
      console.warn(validation.message)
    }
    
    // 半日判定（指定大会用）- 将来的に半日フラグを追加する場合
    const isHalfDay = false
    
    const amt = calculateAmount(activityId, isDriving, destinationId, isWorkDay, isAccommodation, isHalfDay)
    setCalculatedAmount(amt)
  }, [activityId, isDriving, destinationId, dayType, isAccommodation])

  const updateDetail = (key: string, value: string) => {
    setDetails((prev: any) => { const next = { ...prev }; if (value === '') delete next[key]; else next[key] = value; return next })
  }

  // 休暇申請の送信（Upsert）
  const handleLeaveApply = async () => {
      const dateStr = formatDate(selectedDate)
      
      // バリデーション：時間休の場合は時間数が必須
      if (leaveDuration === '時間休' && (!leaveHours || leaveHours < 1 || leaveHours > 8)) {
          alert('時間休を選択した場合は、1〜8時間の範囲で時間数を入力してください。')
          return
      }
      
      // 時間単位で計算（時間休の場合は入力値、それ以外は自動計算）
      let hoursUsed = 0
      if (leaveDuration === '時間休') {
          hoursUsed = leaveHours
      } else if (leaveDuration === '1日') {
          hoursUsed = 8
      } else if (leaveDuration === '半日(午前)' || leaveDuration === '半日(午後)') {
          hoursUsed = 4
      }
      
      // デバッグ用ログ（本番環境では削除推奨）
      console.log('休暇申請データ:', {
          user_id: userId,
          date: dateStr,
          leave_type: leaveType,
          duration_type: leaveDuration,
          hours_used: hoursUsed,
          reason: leaveReason,
          status: 'pending'
      })
      
      const { data, error } = await supabase.from('leave_applications').upsert({
          user_id: userId,
          date: dateStr,
          leave_type: leaveType,
          duration_type: leaveDuration,
          hours_used: hoursUsed,
          reason: leaveReason,
          status: 'pending'
      }, { onConflict: 'user_id, date' })

      if (error) {
          console.error('休暇申請エラー:', error)
          alert('エラー: ' + error.message + '\n\nDBテーブルに duration_type と hours_used カラムが存在することを確認してください。')
      } else {
          alert(currentLeaveApp ? '申請内容を修正しました！' : '休暇届を申請しました！\n（管理者の承認待ち状態です）')
          fetchData(userId)
          fetchLeaveBalance(userId)
          setOpenCategory(null)
          setShowInputModal(false)
      }
  }

  // 休暇申請の取り下げ
  const handleLeaveCancel = async () => {
      if (!currentLeaveApp) return
      if (!confirm('この申請を取り下げますか？\n（管理者の画面からも削除されます）')) return
      
      const { error } = await supabase.from('leave_applications').delete().eq('id', currentLeaveApp.id)
      
      if (error) alert('エラー: ' + error.message)
      else {
          alert('申請を取り下げました。')
          fetchData(userId)
          setOpenCategory(null)
      }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSchedLocked && isAllowLocked) { alert('勤務表・手当ともに申請済みのため、編集できません。'); return }
    const dateStr = formatDate(selectedDate)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (!isSchedLocked) {
        const scheduleData: any = { user_id: user.id, user_email: user.email, date: dateStr, work_pattern_code: selectedPattern, leave_annual: details['leave_annual'] || null };
        LEAVE_ITEMS_TIME.forEach(item => { scheduleData[item.key] = details[item.key] || null })
        const { error: sErr } = await supabase.from('daily_schedules').upsert(scheduleData, { onConflict: 'user_id, date' })
        if (sErr) { alert('勤務表保存エラー: ' + sErr.message); return }
    }
    if (!isAllowLocked) {
        if (activityId) {
            await supabase.from('allowances').delete().eq('user_id', user.id).eq('date', dateStr)
            await supabase.from('allowances').insert({ user_id: user.id, user_email: user.email, date: dateStr, activity_type: ACTIVITY_TYPES.find(a => a.id === activityId)?.label || activityId, destination_type: DESTINATIONS.find(d => d.id === destinationId)?.label, destination_detail: destinationDetail, is_driving: isDriving, is_accommodation: isAccommodation, amount: calculatedAmount })
        } else {
            await supabase.from('allowances').delete().eq('user_id', user.id).eq('date', dateStr)
        }
    }
    fetchData(user.id); setIsRegistered(true); setOpenCategory(null); setShowInputModal(false)
    if (isSchedLocked) alert('手当のみ保存しました (勤務表は申請済)')
    else if (isAllowLocked) alert('勤務表のみ保存しました (手当は申請済)')
    else alert('保存しました')
  }

  const handleBulkRegister = async () => {
    if (getLockStatus(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)).schedule) { alert('勤務表が申請済みのため、一括登録はできません。'); return }
    if (!confirm(`${selectedDate.getMonth()+1}月の未入力日を、すべて「デフォルト勤務」として一括登録しますか？`)) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const year = selectedDate.getFullYear(), month = selectedDate.getMonth(), lastDay = new Date(year, month + 1, 0).getDate()
    const updates = []
    for (let d = 1; d <= lastDay; d++) {
        const dateStr = formatDate(new Date(year, month, d))
        const master = masterSchedules.find(m => m.date === dateStr)
        const pattern = master?.work_pattern_code || 'C'
        updates.push({ user_id: user.id, user_email: user.email, date: dateStr, work_pattern_code: pattern }) 
    }
    const { error } = await supabase.from('daily_schedules').upsert(updates, { onConflict: 'user_id, date', ignoreDuplicates: true })
    if (error) alert('エラー: ' + error.message); else { alert('完了しました！'); fetchData(user.id); router.refresh() }
  }

  const handleDelete = async (id: number, dateStr: string) => { 
    if (getLockStatus(new Date(dateStr)).allowance) { alert('手当が申請済みのため削除できません'); return }
    if (!window.confirm('削除しますか？')) return; 
    const { error } = await supabase.from('allowances').delete().eq('id', id)
    if (!error) fetchData(userId)
  }
  
  const handleSubmit = async (type: 'allowance' | 'schedule') => {
    const label = type === 'allowance' ? '手当' : '勤務表'
    if (!confirm(`${selectedDate.getMonth()+1}月分の【${label}】を確定して申請しますか？\n※申請すると、承認されるまで${label}項目の修正ができなくなります。`)) return
    const ym = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`
    const { error } = await supabase.from('monthly_applications').upsert({ user_id: userId, year_month: ym, application_type: type, status: 'submitted', submitted_at: new Date().toISOString() })
    if (error) alert('申請エラー: ' + error.message)
    else { alert(`${label}を申請しました！`); if (type === 'allowance') setAllowanceStatus('submitted'); else setScheduleStatus('submitted') }
  }

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }
  const handlePrevMonth = () => { const d = new Date(selectedDate); d.setMonth(d.getMonth() - 1); setSelectedDate(d) }
  const handleNextMonth = () => { const d = new Date(selectedDate); d.setMonth(d.getMonth() + 1); setSelectedDate(d) }
  const calculateMonthTotal = () => { const m = selectedDate.getMonth(), y = selectedDate.getFullYear(); return allowances.filter(i => { const d = new Date(i.date); return d.getMonth() === m && d.getFullYear() === y }).reduce((s, i) => s + i.amount, 0) }
  
  // カレンダー日付クリック時の処理
  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setShowInputModal(true)
  }

  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const dateStr = formatDate(date)
    const schedule = schedules.find(s => s.date === dateStr)
    const master = masterSchedules.find(m => m.date === dateStr)
    const calData = schoolCalendar.find(c => c.date === dateStr)
    const allowance = allowances.find(i => i.date === dateStr)
    const leave = leaveApps.find(l => l.date === dateStr)

    let scheduleLabel = ''
    let scheduleLabelColor = 'text-gray-400'
    let bgColor = ''
    
    // 優先度1: 休暇申請 (pending=黄色背景, approved=緑背景)
    if (leave) {
        const shortName = leave.leave_type.replace('年次有給休暇', '年休').replace('休暇', '')
        if (leave.status === 'pending') {
            scheduleLabel = `${shortName}(仮)`
            scheduleLabelColor = 'text-yellow-800 font-bold'
            bgColor = 'bg-yellow-50'
        } else if (leave.status === 'approved') {
            scheduleLabel = shortName
            scheduleLabelColor = 'text-green-700 font-bold'
            bgColor = 'bg-green-50'
        } else if (leave.status === 'rejected') {
            scheduleLabel = `${shortName}(否)`
            scheduleLabelColor = 'text-gray-400'
        }
    } 
    // 優先度2: ユーザー変更の勤務パターン（黒字）
    else if (schedule?.work_pattern_code) { 
        scheduleLabel = schedule.work_pattern_code
        scheduleLabelColor = 'text-slate-700 font-bold'
        if (scheduleLabel.includes('休')) scheduleLabelColor = 'text-red-600 font-bold'
    } 
    // 優先度3: マスタ勤務パターン（灰色）
    else if (master?.work_pattern_code) { 
        scheduleLabel = master.work_pattern_code
        scheduleLabelColor = 'text-gray-400 text-xs'
        if (scheduleLabel.includes('休')) scheduleLabelColor = 'text-red-300'
    } 
    // 優先度4: 休日カレンダー
    else { 
        if (calData?.day_type?.includes('休')) { 
            scheduleLabel = '休'
            scheduleLabelColor = 'text-red-500 font-bold'
            bgColor = 'bg-red-50'
        } 
    }

    return ( 
        <div className={`flex flex-col items-start justify-start w-full h-full p-1 ${bgColor} rounded-lg`}>
            {/* 勤務パターン/休暇 */}
            {scheduleLabel && (
                <div className={`px-2 py-0.5 rounded-md ${leave ? (leave.status === 'approved' ? 'bg-green-200' : 'bg-yellow-200') : ''}`}>
                    <span className={`text-xs ${scheduleLabelColor}`}>{scheduleLabel}</span>
                </div>
            )}
            
            {/* 手当金額 */}
            {allowance && (
                <div className="mt-1 px-2 py-0.5 bg-blue-100 rounded-md">
                    <span className="text-xs font-bold text-blue-700">¥{allowance.amount.toLocaleString()}</span>
                </div>
            )}
            
            {/* 登録済みマーク */}
            {(schedule || allowance || leave) && (
                <div className="absolute bottom-1 right-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                </div>
            )}
        </div> 
    )
  }
  
  const currentPatternDetail = workPatterns.find(p => p.code === selectedPattern)
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
       {isAdmin && <div className="bg-slate-800 text-white text-center py-3 text-sm font-bold shadow-md"><a href="/admin" className="underline hover:text-blue-300 transition">事務担当者ページへ</a></div>}

      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <button onClick={handlePrevMonth} className="text-slate-400 hover:text-slate-600 p-2 text-2xl font-bold transition">‹</button>
                <h2 className="text-xl font-bold text-slate-800">{selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月</h2>
                <button onClick={handleNextMonth} className="text-slate-400 hover:text-slate-600 p-2 text-2xl font-bold transition">›</button>
              </div>
              <div className="text-3xl font-extrabold text-blue-600">¥{calculateMonthTotal().toLocaleString()}</div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* 申請ステータス */}
              <div className="flex items-center gap-2">
                  {allowanceStatus === 'approved' && <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">💰 承認済</span>}
                  {allowanceStatus === 'submitted' && <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold">💰 申請中</span>}
                  {allowanceStatus === 'draft' && !isAllowLocked && <button onClick={() => handleSubmit('allowance')} className="text-xs font-bold text-white bg-blue-600 px-4 py-2 rounded-full hover:bg-blue-700 shadow-sm transition">💰 申請</button>}
              </div>
              <div className="flex items-center gap-2">
                  {scheduleStatus === 'approved' && <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">⏰ 承認済</span>}
                  {scheduleStatus === 'submitted' && <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold">⏰ 申請中</span>}
                  {scheduleStatus === 'draft' && !isSchedLocked && <button onClick={() => handleSubmit('schedule')} className="text-xs font-bold text-white bg-green-600 px-4 py-2 rounded-full hover:bg-green-700 shadow-sm transition">⏰ 申請</button>}
              </div>
              <button onClick={() => setShowProfileModal(true)} className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-full border border-slate-200 hover:bg-slate-200 transition">
                  {userName ? `👤 ${userName}` : '⚙️ 氏名登録'}
              </button>
              <button onClick={handleLogout} className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-2 rounded-full border border-slate-200 hover:bg-slate-200 transition">ログアウト</button>
            </div>
          </div>
          {!isSchedLocked && <button onClick={handleBulkRegister} className="mt-2 text-xs text-slate-400 underline hover:text-slate-600 transition">一括登録はこちら</button>}
        </div>
      </div>

      {/* メインカレンダー表示 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <Calendar 
            onChange={(val) => handleDateClick(val as Date)} 
            value={selectedDate} 
            activeStartDate={selectedDate} 
            onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setSelectedDate(activeStartDate)} 
            locale="ja-JP" 
            tileContent={getTileContent} 
            className="w-full border-none calendar-large" 
          />
        </div>
        
        {/* 月次サマリー */}
        <div className="mt-8 bg-white rounded-2xl shadow-lg p-6">
          <h3 className="font-bold text-slate-700 text-lg mb-4">{selectedDate.getMonth() + 1}月の手当履歴</h3>
          <div className="space-y-2">
            {allowances.filter(i => { const d = new Date(i.date); return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear() }).map((item) => (
              <div key={item.id} className="bg-slate-50 p-4 rounded-xl flex justify-between items-center border border-slate-100 hover:border-slate-300 transition">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-slate-700 text-lg">{item.date.split('-')[2]}日</span>
                  <span className="text-sm text-slate-500">{item.activity_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-700 text-lg">¥{item.amount.toLocaleString()}</span>
                  {!isAllowLocked && <button onClick={() => handleDelete(item.id, item.date)} className="text-slate-300 hover:text-red-500 transition text-xl">🗑</button>}
                </div>
              </div>
            ))}
            {allowances.filter(i => { const d = new Date(i.date); return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear() }).length === 0 && (
              <div className="text-center py-8 text-slate-400">まだ手当の登録がありません</div>
            )}
          </div>
        </div>
      </div>

      {/* 入力フォームモーダル */}
      {showInputModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInputModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* モーダルヘッダー */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h2 className="font-bold text-slate-800 text-lg">{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 ({['日', '月', '火', '水', '木', '金', '土'][selectedDate.getDay()]}) の入力</h2>
                <div className="flex gap-2 mt-2">
                  {isSchedLocked && <span className="text-xs px-2 py-1 rounded font-bold bg-gray-100 text-gray-500">⏰ ロック</span>}
                  {isAllowLocked && <span className="text-xs px-2 py-1 rounded font-bold bg-gray-100 text-gray-500">💰 ロック</span>}
                  <span className={`text-xs px-2 py-1 rounded font-bold ${isRegistered ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-500'}`}>{isRegistered ? '登録済' : '未登録'}</span>
                </div>
              </div>
              <button onClick={() => setShowInputModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            </div>

            {/* モーダルコンテンツ */}
            <div className="p-6">
              <form onSubmit={handleSave} className={`flex flex-col gap-4 ${isSchedLocked && isAllowLocked ? 'opacity-60 pointer-events-none' : ''}`}>
            {/* 勤務表エリア */}
            <div className={`bg-white p-3 rounded-xl border ${isSchedLocked ? 'border-gray-200 opacity-60 pointer-events-none bg-gray-50' : 'border-slate-200'}`}>
              <label className="block text-xs font-bold text-black mb-1">勤務パターン {isSchedLocked && '(編集不可)'}</label>
              <div className="flex items-center gap-2">
                <select disabled={isSchedLocked} value={selectedPattern} onChange={(e) => setSelectedPattern(e.target.value)} className="flex-1 bg-white p-2 rounded border border-slate-300 font-bold text-black">
                  <option value="">(未設定)</option>
                  {workPatterns.map(p => <option key={p.id} value={p.code}>{p.code} ({p.start_time.slice(0,5)}-{p.end_time.slice(0,5)})</option>)}
                </select>
                <div className="text-xs text-black font-bold w-1/3 text-right">{currentPatternDetail?.description}</div>
              </div>
            </div>

            {/* 休暇申請エリア */}
            <div className={`bg-white rounded-xl border transition-all ${openCategory === 'application' ? 'border-orange-400 ring-2 ring-orange-100' : currentLeaveApp ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}>
              <button disabled={isSchedLocked} type="button" onClick={() => setOpenCategory(openCategory === 'application' ? null : 'application')} className="w-full flex justify-between items-center p-3 text-left">
                 <div className="flex items-center gap-2">
                     <span className="text-lg">📄</span>
                     <span className={`text-xs font-bold ${currentLeaveApp ? 'text-orange-600' : 'text-black'}`}>休暇・欠勤届 {currentLeaveApp && '(申請有)'}</span>
                 </div>
                <span className="text-slate-400 text-xs">{openCategory === 'application' ? '▲ 閉じる' : '申請する +'}</span>
              </button>
              {(openCategory === 'application' || currentLeaveApp) && (
                <div className="p-3 pt-0 border-t border-slate-100 bg-orange-50/30 rounded-b-xl space-y-3">
                   {currentLeaveApp && <div className="text-xs text-orange-600 font-bold bg-white p-2 rounded border border-orange-200 mb-2">ステータス: {currentLeaveApp.status === 'pending' ? '⏳ 申請中 (管理職承認待ち)' : currentLeaveApp.status === 'approved' ? '🈴 承認済み' : '却下'}</div>}
                   
                   {/* 年休残高表示 */}
                   {leaveBalance && leaveType === '年次有給休暇' && (
                       <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                           <div className="text-xs font-bold text-blue-700 mb-1">年休残高</div>
                           <div className="text-sm font-bold text-blue-900">
                               残り: {hoursToDisplayFormat(leaveBalance.annual_leave_total - leaveBalance.annual_leave_used)}
                           </div>
                           {openCategory === 'application' && (
                               <div className="text-xs text-blue-600 mt-2 border-t border-blue-200 pt-2">
                                   申請後: {(() => {
                                       let hoursToUse = 0
                                       if (leaveDuration === '時間休') {
                                           hoursToUse = leaveHours
                                       } else if (leaveDuration === '1日') {
                                           hoursToUse = 8
                                       } else if (leaveDuration === '半日(午前)' || leaveDuration === '半日(午後)') {
                                           hoursToUse = 4
                                       }
                                       return hoursToDisplayFormat(leaveBalance.annual_leave_total - leaveBalance.annual_leave_used - hoursToUse)
                                   })()}
                               </div>
                           )}
                       </div>
                   )}
                   
                   {!isSchedLocked ? (
                       <div className="space-y-2">
                           <div>
                               <label className="block text-xs font-bold text-slate-500 mb-1">種類</label>
                               <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full p-2 text-sm border rounded bg-white font-bold text-black">{LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                           </div>
                           <div>
                               <label className="block text-xs font-bold text-slate-500 mb-1">期間</label>
                               <select value={leaveDuration} onChange={(e) => setLeaveDuration(e.target.value)} className="w-full p-2 text-sm border rounded bg-white font-bold text-black">{LEAVE_DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}</select>
                           </div>
                           {/* 時間休の場合のみ時間数入力を表示 */}
                           {leaveDuration === '時間休' && (
                               <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                   <label className="block text-xs font-bold text-slate-700 mb-2">時間数（1〜8時間）</label>
                                   <div className="flex items-center gap-2">
                                       <input 
                                           type="number" 
                                           min="1" 
                                           max="8" 
                                           value={leaveHours} 
                                           onChange={(e) => setLeaveHours(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                                           className="w-20 p-2 text-sm border rounded bg-white text-black font-bold text-center"
                                       />
                                       <span className="text-sm text-slate-600">時間</span>
                                       <div className="flex-1 flex gap-1">
                                           {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                                               <button
                                                   key={h}
                                                   type="button"
                                                   onClick={() => setLeaveHours(h)}
                                                   className={`flex-1 px-2 py-1 text-xs rounded font-bold transition ${
                                                       leaveHours === h 
                                                           ? 'bg-yellow-500 text-white' 
                                                           : 'bg-white text-slate-600 border border-slate-300 hover:bg-yellow-100'
                                                   }`}
                                               >
                                                   {h}
                                               </button>
                                           ))}
                                       </div>
                                   </div>
                               </div>
                           )}
                           <div>
                               <label className="block text-xs font-bold text-slate-500 mb-1">事由</label>
                               <input type="text" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="例: 私用のため" className="w-full p-2 text-sm border rounded bg-white text-black" />
                           </div>
                           <div className="flex gap-2 pt-2">
                               <button type="button" onClick={handleLeaveApply} className="flex-1 bg-orange-500 text-white font-bold py-2 rounded shadow text-xs">
                                   {currentLeaveApp ? '内容を修正して再申請' : '届出を送信'}
                               </button>
                               {currentLeaveApp && <button type="button" onClick={handleLeaveCancel} className="bg-slate-200 text-slate-500 font-bold py-2 px-4 rounded shadow text-xs">取下</button>}
                           </div>
                       </div>
                   ) : (
                       <div className="text-xs text-slate-400">※ロック中のため編集できません</div>
                   )}
                </div>
              )}
            </div>

            <hr className="border-slate-100" />
            
            {/* 手当エリア */}
            <div className={`${isAllowLocked ? 'opacity-60 pointer-events-none grayscale' : ''}`}>
                <div>
                <label className="block text-xs font-bold text-black mb-1">部活動 業務内容 {isAllowLocked && '(編集不可)'}</label>
                <select 
                    disabled={isAllowLocked} 
                    value={activityId} 
                    onChange={(e) => {
                        const newActivityId = e.target.value
                        const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
                        const validation = canSelectActivity(newActivityId, isWorkDay)
                        if (!validation.allowed) {
                            alert(validation.message)
                            return
                        }
                        setActivityId(newActivityId)
                        // デフォルトの行き先をリセット
                        setDestinationId('inside_short')
                    }} 
                    className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 font-bold text-black text-sm"
                >
                    <option value="">なし (部活なし)</option>
                    {ACTIVITY_TYPES.map(type => {
                        const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
                        const validation = canSelectActivity(type.id, isWorkDay)
                        return (
                            <option 
                                key={type.id} 
                                value={type.id}
                                disabled={!validation.allowed}
                            >
                                {type.label} {!validation.allowed ? '(勤務日不可)' : ''}
                            </option>
                        )
                    })}
                </select>
                {activityId && (() => {
                    const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
                    const validation = canSelectActivity(activityId, isWorkDay)
                    if (!validation.allowed) {
                        return <div className="text-xs text-red-600 mt-1 font-bold">⚠️ {validation.message}</div>
                    }
                    return null
                })()}
                </div>
                {activityId && (
                <>
                    {/* 「その他」選択時は内容入力欄を全幅で表示 */}
                    {activityId === 'OTHER' ? (
                        <div className="mt-2">
                            <label className="block text-xs font-bold text-red-600 mb-1">具体的な内容（必須）</label>
                            <input 
                                disabled={isAllowLocked} 
                                type="text" 
                                placeholder="例: 非常災害による緊急対応" 
                                value={destinationDetail} 
                                onChange={(e) => setDestinationDetail(e.target.value)} 
                                className="w-full bg-white p-3 rounded-lg border border-red-200 text-xs text-black font-bold" 
                                required
                            />
                            <div className="text-xs text-slate-500 mt-1">※「その他」を選択した場合は、具体的な業務内容を必ず記入してください。</div>
                        </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label className="block text-xs font-bold text-black mb-1">行き先（区分）</label>
                                <select 
                                    disabled={isAllowLocked} 
                                    value={destinationId} 
                                    onChange={(e) => setDestinationId(e.target.value)} 
                                    className="w-full bg-white p-3 rounded-lg border border-slate-200 text-xs text-black font-bold"
                                >
                                    {DESTINATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-black mb-1">詳細</label>
                                <input 
                                    disabled={isAllowLocked} 
                                    type="text" 
                                    placeholder="例: 県体育館" 
                                    value={destinationDetail} 
                                    onChange={(e) => setDestinationDetail(e.target.value)} 
                                    className="w-full bg-white p-3 rounded-lg border border-slate-200 text-xs text-black font-bold" 
                                />
                            </div>
                    </div>
                    )}
                    
                    {/* 運転・宿泊フラグ */}
                    <div className="flex gap-3 mt-2">
                        <label className={`flex-1 p-3 rounded-lg cursor-pointer border text-center text-xs font-bold ${isDriving ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                            <input 
                                disabled={isAllowLocked} 
                                type="checkbox" 
                                checked={isDriving} 
                                onChange={e => setIsDriving(e.target.checked)} 
                                className="hidden" 
                            />
                            🚗 運転あり
                        </label>
                        <label className={`flex-1 p-3 rounded-lg cursor-pointer border text-center text-xs font-bold ${isAccommodation ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                            <input 
                                disabled={isAllowLocked} 
                                type="checkbox" 
                                checked={isAccommodation} 
                                onChange={e => setIsAccommodation(e.target.checked)} 
                                className="hidden" 
                            />
                            🏨 宿泊あり
                        </label>
                    </div>
                    
                    {/* 計算ロジック説明 */}
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mt-2">
                        <div className="text-xs text-blue-700 mb-1">
                            <span className="font-bold">📋 計算内訳:</span>
                        </div>
                        <div className="text-xs text-slate-600">
                            {(() => {
                                const isWorkDay = dayType.includes('勤務日') || dayType.includes('授業')
                                
                                // 運転ありの場合の最優先ルール
                                if (isDriving) {
                                    if (destinationId === 'outside') {
                                        const baseAmount = 15000
                                        const total = isAccommodation && (activityId === 'E' || activityId === 'F') ? baseAmount + 2400 : baseAmount
                                        return `【運転】県外: ${total.toLocaleString()}円${isAccommodation ? ' (運転15,000円＋宿泊2,400円)' : ''}`
                                    }
                                    if (destinationId === 'inside_long') {
                                        const baseAmount = 7500
                                        const total = isAccommodation && (activityId === 'E' || activityId === 'F') ? baseAmount + 2400 : baseAmount
                                        return `【運転】県内120km以上: ${total.toLocaleString()}円${isAccommodation ? ' (運転7,500円＋宿泊2,400円)' : ''}`
                                    }
                                    if (destinationId === 'inside_short' || destinationId === 'school') {
                                        if (activityId === 'C') return '【運転】指定大会（管内）: 3,400円'
                                        if (activityId === 'E' || activityId === 'F') {
                                            if (isWorkDay) {
                                                return isAccommodation ? '【運転】勤務日（管内＋宿泊）: 7,500円' : '【運転】勤務日（管内）: 5,100円'
                                            }
                                            return '【運転】休日（管内）: 2,400円'
                                        }
                                    }
                                }
                                
                                // 運転なしの場合
                                if (activityId === 'A') return '休日部活(1日): 2,400円'
                                if (activityId === 'B') return '休日部活(半日): 1,700円'
                                if (activityId === 'C') return '指定大会（運転なし）: 3,400円'
                                if (activityId === 'D') return '指定外大会: 2,400円'
                                if (activityId === 'E' || activityId === 'F') {
                                    if (isWorkDay) {
                                        return isAccommodation ? '勤務日（宿泊のみ）: 2,400円' : '勤務日（運転なし）: 0円'
                                    }
                                    return '休日（運転なし）: 2,400円'
                                }
                                if (activityId === 'G') return '研修旅行等引率: 3,400円'
                                if (activityId === 'H') return '宿泊指導: 2,400円'
                                if (activityId === 'OTHER') return 'その他: 6,000円'
                                return '計算中...'
                            })()}
                        </div>
                    </div>
                    
                    <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center mt-2">
                        <span className="text-xs font-medium">支給予定額</span>
                        <span className="text-xl font-bold">¥{calculatedAmount.toLocaleString()}</span>
                    </div>
                </>
                )}
            </div>

            {(!isSchedLocked || !isAllowLocked) && (
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-md text-lg">
                    💾 この内容で保存する
                </button>
            )}
          </form>
            </div>
          </div>
        </div>
      )}

      {/* ★氏名登録モーダル */}
      {showProfileModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">氏名登録</h3>
                  <p className="text-xs text-slate-500 mb-4">帳票出力に使用する氏名を登録してください。<br/>自動的に姓と名の間に半角スペースが入ります。</p>
                  
                  <div className="flex gap-2 mb-4">
                      <div className="flex-1">
                          <label className="text-xs font-bold text-slate-500">姓 (Last Name)</label>
                          <input type="text" value={inputLastName} onChange={(e) => setInputLastName(e.target.value)} placeholder="例: 羽黒" className="w-full p-3 rounded border border-slate-300 mt-1 font-bold text-black" />
                      </div>
                      <div className="flex-1">
                          <label className="text-xs font-bold text-slate-500">名 (First Name)</label>
                          <input type="text" value={inputFirstName} onChange={(e) => setInputFirstName(e.target.value)} placeholder="例: 太郎" className="w-full p-3 rounded border border-slate-300 mt-1 font-bold text-black" />
                      </div>
                  </div>
                  
                  <div className="flex gap-2">
                      <button onClick={() => setShowProfileModal(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-bold">キャンセル</button>
                      <button onClick={handleSaveProfile} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold shadow">登録する</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  )
}