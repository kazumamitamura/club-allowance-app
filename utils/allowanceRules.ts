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
    { id: 'kannai', label: '管内（庄内・新庄最上）' },
    { id: 'kennai_short', label: '県内（片道120km未満）' },
    { id: 'kennai_long', label: '県内（片道120km以上）' },
    { id: 'kengai', label: '県外（片道500km以内）' },
]

/**
 * 手当金額計算（規約完全準拠版）
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
    // A. 休日部活（1日）
    if (activityId === 'A') {
        if (isWorkDay) return 0 // 勤務日は支給なし
        return 2400
    }

    // B. 休日部活（半日）
    if (activityId === 'B') {
        if (isWorkDay) return 0 // 勤務日は支給なし
        return 1700
    }

    // C. 指定大会（対外運動競技等引率）
    if (activityId === 'C') {
        // 半日の場合
        if (isHalfDay) {
            return 1700
        }

        // 運転なしの場合
        if (!isDriving) {
            return 3400
        }

        // 運転ありの場合
        switch (destinationId) {
            case 'kannai': // 管内（庄内・新庄最上）
                return 3400
            case 'kennai_short': // 県内（片道120km未満）
            case 'kennai_long': // 県内（片道120km以上）
                return 7500
            case 'kengai': // 県外（500km以内）
                return 15000
            default:
                return 3400
        }
    }

    // D. 指定外大会（従来ロジック維持）
    if (activityId === 'D') {
        return 2400
    }

    // E. 遠征 / F. 合宿（部活動指導手当）
    if (activityId === 'E' || activityId === 'F') {
        // 休日の場合
        if (!isWorkDay) {
            if (!isDriving) {
                return 2400
            }

            // 運転ありの場合
            switch (destinationId) {
                case 'kannai': // 管内
                case 'kennai_short': // 県内（片道120km未満）
                    return 2400
                case 'kennai_long': // 県内（片道120km以上）
                    return 7500
                case 'kengai': // 県外
                    return 15000
                default:
                    return 2400
            }
        }

        // 勤務日（授業日）の場合
        if (!isDriving) {
            // 宿泊のみの場合
            if (isAccommodation) {
                return 2400
            }
            return 0 // 運転なし・宿泊なしは支給なし
        }

        // 勤務日 + 運転ありの場合
        switch (destinationId) {
            case 'kannai': // 管内
            case 'kennai_short': // 県内（片道120km未満）
                if (isAccommodation) {
                    return 5100 + 2400 // 運転 + 宿泊
                }
                return 5100
            case 'kennai_long': // 県内（片道120km以上）
                if (isAccommodation) {
                    return 12600 + 2400 // 運転 + 宿泊
                }
                return 7500
            case 'kengai': // 県外
                if (isAccommodation) {
                    return 12600 + 2400 // 運転 + 宿泊
                }
                return 12600
            default:
                return 0
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

    // その他（非常災害など）
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
