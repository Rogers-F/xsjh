/**
 * API Keys management — backed by the native token endpoints.
 *
 * Contract notes (verified against the Go controllers):
 * - List/get responses carry MASKED keys only; the plaintext is fetched on
 *   demand via POST /token/:id/key (rate-limited server-side — never batch it).
 * - POST /token/ (create) returns no object; callers must re-list.
 * - PUT /token/ takes the FULL token body (we GET the current one and merge);
 *   PUT /token/?status_only=1 flips status without touching other fields.
 * - remain_quota is in integer quota units; expired_time -1 means "never".
 */

import { apiClient } from './client'
import { adaptPageInfo } from './pagination'
import type { ApiKey, PaginatedResponse } from '@/types'
import type { NewApiPageInfo, NewApiToken } from '@/types/newapi'
import { quotaToUSD, usdToQuota } from '@/utils/quota'

const TOKEN_STATUS_TO_KEY_STATUS: Record<number, ApiKey['status']> = {
  1: 'active',
  2: 'inactive',
  3: 'expired',
  4: 'quota_exhausted'
}

const KEY_STATUS_TO_TOKEN_STATUS: Record<string, number> = {
  active: 1,
  inactive: 2
}

/** Map a native token onto the view-facing ApiKey shape. Fields the backend has
 * no equivalent for (rate-limit windows, ip lists, numeric group id) are zeroed
 * or nulled — views must not render fabricated data for them. */
function adaptToken(t: NewApiToken): ApiKey {
  return {
    id: t.id,
    user_id: t.user_id,
    key: t.key,
    name: t.name,
    group_id: null,
    group_name: t.group || '',
    status: TOKEN_STATUS_TO_KEY_STATUS[t.status] ?? 'inactive',
    ip_whitelist: [],
    ip_blacklist: [],
    last_used_at: t.accessed_time > 0 ? new Date(t.accessed_time * 1000).toISOString() : null,
    quota: t.unlimited_quota ? 0 : quotaToUSD(t.remain_quota + t.used_quota),
    quota_used: quotaToUSD(t.used_quota),
    expires_at: t.expired_time === -1 ? null : new Date(t.expired_time * 1000).toISOString(),
    created_at: new Date(t.created_time * 1000).toISOString(),
    updated_at: new Date(t.created_time * 1000).toISOString(),
    rate_limit_5h: 0,
    rate_limit_1d: 0,
    rate_limit_7d: 0,
    usage_5h: 0,
    usage_1d: 0,
    usage_7d: 0,
    model_limits_enabled: t.model_limits_enabled,
    model_limits: t.model_limits
      ? t.model_limits.split(',').map((m) => m.trim()).filter(Boolean)
      : []
  }
}

function adaptPage(data: NewApiPageInfo<NewApiToken>): PaginatedResponse<ApiKey> {
  return adaptPageInfo(data, adaptToken)
}

/** List API keys (masked). page_size is capped at 100 by the server. */
export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: { search?: string },
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<ApiKey>> {
  if (filters?.search) {
    const { data } = await apiClient.get<NewApiPageInfo<NewApiToken>>('/token/search', {
      params: { keyword: filters.search, p: page, page_size: Math.min(pageSize, 100) },
      signal: options?.signal
    })
    return adaptPage(data)
  }
  const { data } = await apiClient.get<NewApiPageInfo<NewApiToken>>('/token/', {
    params: { p: page, page_size: Math.min(pageSize, 100) },
    signal: options?.signal
  })
  return adaptPage(data)
}

/** Get one key (masked). The server scopes by the session user — foreign ids 404. */
export async function getById(id: number): Promise<ApiKey> {
  const { data } = await apiClient.get<NewApiToken>(`/token/${id}`)
  return adaptToken(data)
}

/** Fetch the PLAINTEXT key for one token. Rate-limited server-side; call only on
 * explicit user action, never in a loop, and do not persist the result. */
export async function getKey(id: number): Promise<string> {
  const { data } = await apiClient.post<{ key: string }>(`/token/${id}/key`)
  return data.key
}

export interface CreateKeyParams {
  name: string
  /** USD limit; undefined/0 = unlimited quota. */
  quotaUSD?: number
  /** Days until expiry; undefined/0 = never expires (expired_time = -1). */
  expiresInDays?: number
  /** Backend group name ('' = user default group). */
  group?: string
  modelLimits?: string[]
}

/** Create a key. The backend returns no object — re-list to pick up the new row,
 * then use getKey() for the plaintext. */
export async function create(params: CreateKeyParams): Promise<void> {
  const unlimited = !params.quotaUSD || params.quotaUSD <= 0
  await apiClient.post('/token/', {
    name: params.name,
    remain_quota: unlimited ? 0 : usdToQuota(params.quotaUSD!),
    unlimited_quota: unlimited,
    expired_time:
      params.expiresInDays && params.expiresInDays > 0
        ? Math.floor(Date.now() / 1000) + params.expiresInDays * 86400
        : -1,
    group: params.group ?? '',
    model_limits_enabled: !!params.modelLimits?.length,
    model_limits: params.modelLimits?.join(',') ?? ''
  })
}

export interface UpdateKeyParams {
  name?: string
  /** USD limit; 0 = unlimited. When set, remaining quota becomes (limit - used). */
  quotaUSD?: number
  /** Days from now; 0 = never expires. */
  expiresInDays?: number
  group?: string
  modelLimits?: string[]
}

/** Update a key: fetch the current full body, merge, and PUT it back. */
export async function update(id: number, updates: UpdateKeyParams): Promise<void> {
  const { data: current } = await apiClient.get<NewApiToken>(`/token/${id}`)
  const body: Record<string, unknown> = {
    id,
    name: updates.name ?? current.name,
    unlimited_quota: current.unlimited_quota,
    remain_quota: current.remain_quota,
    expired_time: current.expired_time,
    group: updates.group ?? current.group,
    model_limits_enabled: current.model_limits_enabled,
    model_limits: current.model_limits
  }
  if (updates.quotaUSD !== undefined) {
    if (updates.quotaUSD <= 0) {
      body.unlimited_quota = true
      body.remain_quota = 0
    } else {
      body.unlimited_quota = false
      body.remain_quota = Math.max(0, usdToQuota(updates.quotaUSD) - current.used_quota)
    }
  }
  if (updates.expiresInDays !== undefined) {
    body.expired_time =
      updates.expiresInDays > 0
        ? Math.floor(Date.now() / 1000) + updates.expiresInDays * 86400
        : -1
  }
  if (updates.modelLimits !== undefined) {
    body.model_limits_enabled = updates.modelLimits.length > 0
    body.model_limits = updates.modelLimits.join(',')
  }
  await apiClient.put('/token/', body)
}

/** Flip status only (PUT /token/?status_only=1 leaves every other field alone). */
export async function toggleStatus(id: number, status: 'active' | 'inactive'): Promise<void> {
  await apiClient.put('/token/?status_only=1', {
    id,
    status: KEY_STATUS_TO_TOKEN_STATUS[status] ?? 2
  })
}

export async function deleteKey(id: number): Promise<void> {
  await apiClient.delete(`/token/${id}`)
}

export const keysAPI = {
  list,
  getById,
  getKey,
  create,
  update,
  delete: deleteKey,
  toggleStatus
}

export default keysAPI
