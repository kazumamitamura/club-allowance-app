// utils/leaveCalculations.ts

// 1日 = 8時間換算
const HOURS_PER_DAY = 8

/**
 * 休暇期間を時間に変換
 */
export const durationToHours = (duration: string): number => {
  if (duration === '1日') return HOURS_PER_DAY
  if (duration === '半日(午前)' || duration === '半日(午後)') return HOURS_PER_DAY / 2
  if (duration === '時間休') return 1 // デフォルト1時間（実際は入力値を使用）
  return 0
}

/**
 * 時間を「〇日と〇時間」形式に変換
 */
export const hoursToDisplayFormat = (totalHours: number): string => {
  const days = Math.floor(totalHours / HOURS_PER_DAY)
  const hours = totalHours % HOURS_PER_DAY
  
  if (days === 0) {
    return `${hours}時間`
  } else if (hours === 0) {
    return `${days}日`
  } else {
    return `${days}日と${hours}時間`
  }
}

/**
 * 休暇残高を計算
 */
export const calculateLeaveBalance = (
  totalAllowedHours: number,
  usedHours: number
): { remainingHours: number, displayText: string } => {
  const remainingHours = totalAllowedHours - usedHours
  const displayText = hoursToDisplayFormat(remainingHours)
  
  return { remainingHours, displayText }
}

/**
 * 年休の年間付与日数を時間に変換
 * 例: 20日 → 160時間
 */
export const daysToHours = (days: number): number => {
  return days * HOURS_PER_DAY
}

/**
 * 時間を日数に変換（小数点あり）
 */
export const hoursToDays = (hours: number): number => {
  return hours / HOURS_PER_DAY
}
