// utils/allowanceRules.ts
// 手当計算ロジック（規約完全準拠版）

export const ACTIVITY_TYPES = [
    { id: 'A', label: 'A:休日部活(1日)', requiresHoliday: true },
    { id: 'B', label: 'B:休日部活(半日)', requiresHoliday: true },
    { id: 'C', label: 'C:指定大会（対外運動競技等引率）', requiresHoliday: false },
    { id: 'D', label: 'D:指定外大会', requiresHoliday: false },
    { id: 'E', label: 'E:遠征（部活動指導）', requiresHoliday: false },
    { id: 'F', label: 'F:合宿（部活動指導）', requiresHoliday: false },
    { id: 'G', label: 'G:研修旅行等引率', requiresHoliday: false },
    { id: 'H', label: 'H:宿泊指導', requiresHoliday: false },
    { id: 'OTHER', label: 'その他', requiresHoliday: false },
  ]
  
export const DESTINATIONS = [
    { id: 'school', label: '校内' },
    { id: 'inside_short', label: '管内（庄内・新庄最上）' },
    { id: 'inside_long', label: '県内（片道120km以上）' },
    { id: 'outside', label: '県外' },
]

/**
 * 手当金額計算（運転判定優先版）
 * @param activityId 活動種別
 * @param isDriving 運転の有無
 * @param destinationId 行き先区分
 * @param isWorkDay 勤務日かどうか
 * @param isAccommodation 宿泊の有無
 * @param isHalfDay 半日かどうか（指定大会用）
 * @returns 手当金額
 */
export const calculateAmount = (
    activityId: string,
    isDriving: boolean,
    destinationId: string,
    isWorkDay: boolean,
    isAccommodation: boolean = false,
    isHalfDay: boolean = false
): number => {
    // ===========================================
    // 【最優先】運転ありの場合の特別ルール
    // ===========================================
    if (isDriving) {
        // 県外への運転は一律 15,000円（活動タイプに関係なく）
        if (destinationId === 'outside') {
            // 宿泊がある場合は加算
            if (isAccommodation && (activityId === 'E' || activityId === 'F')) {
                return 15000 + 2400
            }
            return 15000
        }
        
        // 県内（120km以上）への運転は一律 7,500円
        if (destinationId === 'inside_long') {
            // 宿泊がある場合は加算
            if (isAccommodation && (activityId === 'E' || activityId === 'F')) {
                return 7500 + 2400
            }
            return 7500
        }
        
        // 管内または校内運転の場合は、活動タイプごとのルールに従う
        if (destinationId === 'inside_short' || destinationId === 'school') {
            // C. 指定大会の場合
            if (activityId === 'C') {
                return 3400
            }
            
            // E, F. 遠征・合宿の場合
            if (activityId === 'E' || activityId === 'F') {
                if (isWorkDay) {
                    // 勤務日の管内運転
                    if (isAccommodation) {
                        return 5100 + 2400
                    }
                    return 5100
                } else {
                    // 休日の管内運転
                    return 2400
                }
            }
            
            // その他の活動で管内運転の場合、基本額を適用
        }
    }
    
    // ===========================================
    // 運転なしの場合の処理
    // ===========================================
    
    // A. 休日部活（1日）
    if (activityId === 'A') {
        if (isWorkDay) return 0
        return 2400
    }

    // B. 休日部活（半日）
    if (activityId === 'B') {
        if (isWorkDay) return 0
        return 1700
    }

    // C. 指定大会（対外運動競技等引率）
    if (activityId === 'C') {
        if (isHalfDay) return 1700
        return 3400 // 運転なしの基本額
    }

    // D. 指定外大会
    if (activityId === 'D') {
        return 2400
    }

    // E. 遠征 / F. 合宿（運転なしの場合）
    if (activityId === 'E' || activityId === 'F') {
        if (isWorkDay) {
            // 勤務日は宿泊のみ支給
            return isAccommodation ? 2400 : 0
        } else {
            // 休日は基本額
            return 2400
        }
    }

    // G. 研修旅行等引率
    if (activityId === 'G') {
        return 3400
    }

    // H. 宿泊指導
    if (activityId === 'H') {
        return 2400
    }

    // その他
    if (activityId === 'OTHER') {
        return 6000
    }

    return 0
}

/**
 * 勤務日判定用のヘルパー関数
 */
export const canSelectActivity = (
    activityId: string, 
    isWorkDay: boolean
): { allowed: boolean, message?: string } => {
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

/**
 * 活動種別の説明文を取得
 */
export const getActivityDescription = (activityId: string): string => {
    const descriptions: Record<string, string> = {
        'A': '土日の部活動指導（1日）- 2,400円',
        'B': '土日の部活動指導（半日）- 1,700円',
        'C': '対外運動競技等の引率 - 基本3,400円（運転・距離により変動）',
        'D': '指定外大会 - 2,400円',
        'E': '遠征での部活動指導 - 休日/勤務日・運転により変動',
        'F': '合宿での部活動指導 - 休日/勤務日・運転により変動',
        'G': '研修旅行等の引率 - 3,400円',
        'H': '宿泊指導 - 2,400円',
        'OTHER': 'その他の業務 - 6,000円'
    }
    return descriptions[activityId] || ''
}

/**
 * 運転手当の適用条件を判定
 */
export const needsDrivingSelection = (activityId: string): boolean => {
    return ['C', 'E', 'F'].includes(activityId)
}

/**
 * 宿泊手当の適用条件を判定
 */
export const needsAccommodationSelection = (activityId: string): boolean => {
    return ['E', 'F', 'H'].includes(activityId)
}
