/**
 * User group options — backed by GET /user/self/groups.
 *
 * The backend returns a MAP of group name -> { ratio, desc } (no numeric ids;
 * tokens reference groups by name string).
 */

import { apiClient } from './client'

export interface UserGroupOption {
  name: string
  ratio: number
  desc: string
}

/** Groups the current user may bind to API keys. */
export async function getAvailable(): Promise<UserGroupOption[]> {
  const { data } = await apiClient.get<Record<string, { ratio?: number; desc?: string }>>(
    '/user/self/groups'
  )
  return Object.entries(data ?? {}).map(([name, info]) => ({
    name,
    ratio: typeof info?.ratio === 'number' ? info.ratio : 1,
    desc: info?.desc ?? ''
  }))
}

export const userGroupsAPI = {
  getAvailable
}

export default userGroupsAPI
