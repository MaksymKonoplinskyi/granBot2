import { ADMINS } from '../config'

export function isAdmin(userId: number | string | undefined): boolean {
  if (!userId) return false
  return ADMINS.includes(String(userId))
}

export class AuthService {
  static checkAdminAccess(userId: number | string | undefined): boolean {
    return isAdmin(userId)
  }

  static requireAdmin(userId: number | string | undefined): void {
    if (!isAdmin(userId)) {
      throw new Error('Access denied: admin privileges required')
    }
  }
}
