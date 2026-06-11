/**
 * User profile — backed by the native /user/self endpoints.
 *
 * GET /user/self has NO created_at / concurrency / balance fields; the dollar
 * balance is derived as quotaToUSD(user.quota) (see utils/quota.ts).
 * PUT /user/self handles both profile edits ({username, display_name}) and
 * password changes ({original_password, password}).
 */

import { apiClient } from './client'
import type { User } from '@/types'

/** Current user (same payload the auth store caches). */
export async function getProfile(): Promise<User> {
  const { data } = await apiClient.get<User>('/user/self')
  return data
}

/** Update profile fields. The backend re-validates the WHOLE user struct
 * (username mandatory) and ALWAYS verifies original_password before applying
 * any self update — so the current password is required even for a rename.
 * It replies with a success message only — refresh the cached user afterwards. */
export async function updateProfile(profile: {
  username: string
  display_name?: string
  original_password: string
}): Promise<void> {
  await apiClient.put('/user/self', profile)
}

/** Change password; the backend validates original_password ("原密码错误" on
 * mismatch — surface its message verbatim). The struct validation also requires
 * username, so the current one is fetched and sent along. */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const current = await getProfile()
  await apiClient.put('/user/self', {
    username: current.username,
    original_password: oldPassword,
    password: newPassword
  })
}

export const userAPI = {
  getProfile,
  updateProfile,
  changePassword
}

export default userAPI
