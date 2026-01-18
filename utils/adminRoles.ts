// utils/adminRoles.ts
// 管理者権限管理

export const ADMIN_ROLES = {
  // スーパー管理者（全権限）
  super_admin: [
    'mitamuraka@haguroko.ed.jp',
    'tomonoem@haguroko.ed.jp'
  ],
  
  // 手当管理権限
  allowance_manager: [
    'tomonoem@haguroko.ed.jp',
    'takeda@haguroko.ed.jp'
  ],
  
  // 勤務表管理権限
  schedule_manager: [
    'komatsu@haguroko.ed.jp',
    'takeda@haguroko.ed.jp'
  ],
  
  // 休暇管理権限
  leave_manager: [
    'mitamuraka@haguroko.ed.jp',
    'tomonoem@haguroko.ed.jp'
  ]
}

// メールアドレスを小文字化して正規化
const normalizeRoles = () => {
  return {
    super_admin: ADMIN_ROLES.super_admin.map(e => e.toLowerCase()),
    allowance_manager: ADMIN_ROLES.allowance_manager.map(e => e.toLowerCase()),
    schedule_manager: ADMIN_ROLES.schedule_manager.map(e => e.toLowerCase()),
    leave_manager: ADMIN_ROLES.leave_manager.map(e => e.toLowerCase())
  }
}

const NORMALIZED_ROLES = normalizeRoles()

/**
 * ユーザーが管理画面にアクセス可能かチェック
 */
export const isAdmin = (email: string): boolean => {
  const normalizedEmail = email.toLowerCase()
  return NORMALIZED_ROLES.super_admin.includes(normalizedEmail) ||
         NORMALIZED_ROLES.allowance_manager.includes(normalizedEmail) ||
         NORMALIZED_ROLES.schedule_manager.includes(normalizedEmail) ||
         NORMALIZED_ROLES.leave_manager.includes(normalizedEmail)
}

/**
 * ユーザーが手当管理権限を持つかチェック
 */
export const canManageAllowances = (email: string): boolean => {
  const normalizedEmail = email.toLowerCase()
  return NORMALIZED_ROLES.super_admin.includes(normalizedEmail) ||
         NORMALIZED_ROLES.allowance_manager.includes(normalizedEmail)
}

/**
 * ユーザーが勤務表管理権限を持つかチェック
 */
export const canManageSchedules = (email: string): boolean => {
  const normalizedEmail = email.toLowerCase()
  return NORMALIZED_ROLES.super_admin.includes(normalizedEmail) ||
         NORMALIZED_ROLES.schedule_manager.includes(normalizedEmail)
}

/**
 * ユーザーが休暇管理権限を持つかチェック
 */
export const canManageLeaves = (email: string): boolean => {
  const normalizedEmail = email.toLowerCase()
  return NORMALIZED_ROLES.super_admin.includes(normalizedEmail) ||
         NORMALIZED_ROLES.leave_manager.includes(normalizedEmail)
}

/**
 * ユーザーがスーパー管理者かチェック
 */
export const isSuperAdmin = (email: string): boolean => {
  const normalizedEmail = email.toLowerCase()
  return NORMALIZED_ROLES.super_admin.includes(normalizedEmail)
}

/**
 * ユーザーの権限リストを取得
 */
export const getUserRoles = (email: string): string[] => {
  const normalizedEmail = email.toLowerCase()
  const roles: string[] = []
  
  if (NORMALIZED_ROLES.super_admin.includes(normalizedEmail)) {
    roles.push('スーパー管理者')
  }
  if (NORMALIZED_ROLES.allowance_manager.includes(normalizedEmail)) {
    roles.push('手当管理')
  }
  if (NORMALIZED_ROLES.schedule_manager.includes(normalizedEmail)) {
    roles.push('勤務表管理')
  }
  if (NORMALIZED_ROLES.leave_manager.includes(normalizedEmail)) {
    roles.push('休暇管理')
  }
  
  return roles
}

// 現在は試験運用中のため、全員がアクセス可能にする場合は以下をtrueに
export const DEVELOPMENT_MODE = true // ★本番運用時はfalseに変更

/**
 * 開発モード時は全員を許可
 */
export const checkAccess = (email: string, checkFunction: (email: string) => boolean): boolean => {
  if (DEVELOPMENT_MODE) return true // 開発モード: 全員許可
  return checkFunction(email)
}
