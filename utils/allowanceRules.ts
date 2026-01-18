// utils/allowanceRules.ts

export const ACTIVITY_TYPES = [
    { id: 'A', label: 'A:休日部活(1日)', requiresHoliday: true },
    { id: 'B', label: 'B:休日部活(半日)', requiresHoliday: true },
    { id: 'C', label: 'C:指定大会', requiresHoliday: false },
    { id: 'D', label: 'D:指定外大会', requiresHoliday: false },
    { id: 'E', label: 'E:遠征', requiresHoliday: false },
    { id: 'F', label: 'F:合宿', requiresHoliday: false },
    { id: 'G', label: 'G:引率', requiresHoliday: false },
    { id: 'H', label: 'H:宿泊指導', requiresHoliday: false },
  ]
  
  export const DESTINATIONS = [
    { id: 'school', label: '校内' },
    { id: 'inside_short', label: '県内 (〜120km)' },
    { id: 'inside_long', label: '県内 (120km〜)' },
    { id: 'outside', label: '県外' },
  ]
  
  export const calculateAmount = (
    activityId: string,
    isDriving: boolean,
    destinationId: string,
    isWorkDay: boolean
  ): number => {
    // 基本額の決定
    let baseAmount = 0
    
    // 活動種別による基本額
    switch(activityId) {
      case 'A': // 休日部活(1日)
        baseAmount = 3400
        break
      case 'B': // 休日部活(半日)
        baseAmount = 1700
        break
      case 'C': // 指定大会
        baseAmount = 3400
        break
      case 'D': // 指定外大会
        baseAmount = 2400
        break
      case 'E': // 遠征
        baseAmount = 3000
        break
      case 'F': // 合宿
        baseAmount = 5000
        break
      case 'G': // 引率
        baseAmount = 2400
        break
      case 'H': // 宿泊指導
        baseAmount = 6000
        break
      default:
        baseAmount = 0
    }
  
    // 特殊手当（運転）の判定
    let finalAmount = baseAmount
  
    if (isDriving) {
      if (destinationId === 'outside') {
        // 県外マイクロバス運転: 15,000円
        finalAmount = 15000
      } else if (destinationId === 'inside_long') {
        // 県内長距離運転: 7,500円
        finalAmount = 7500
      } else {
        // 県内短距離運転: 基本額 + 500円
        finalAmount = baseAmount + 500
      }
    }
  
    return finalAmount
  }
  
  // 勤務日判定用のヘルパー関数
  export const canSelectActivity = (activityId: string, isWorkDay: boolean): { allowed: boolean, message?: string } => {
    const activity = ACTIVITY_TYPES.find(a => a.id === activityId)
    if (!activity) return { allowed: true }
    
    if (activity.requiresHoliday && isWorkDay) {
      return { 
        allowed: false, 
        message: `${activity.label}は休日のみ選択可能です。勤務日には選択できません。` 
      }
    }
    
    return { allowed: true }
  }