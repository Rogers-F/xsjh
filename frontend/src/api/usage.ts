/**
 * Usage tracking — backed by the native log/data endpoints.
 *
 * Sources (verified against the Go controllers):
 * - GET /log/self            paginated consume logs (p + page_size, unix-second filters)
 * - GET /log/self/stat       { quota, rpm, tpm } for a time range
 * - GET /data/self           per-model per-day aggregates; range capped at 30 days
 *
 * The backend has a single quota cost per log (no standard-vs-actual split and
 * no cache-token breakdown), so adapters set cost == actual_cost and zero the
 * cache fields — views render zeros as absent rather than fabricating data.
 */

import { apiClient } from './client'
import { adaptPageInfo } from './pagination'
import type {
  UsageLog,
  UsageQueryParams,
  UsageStatsResponse,
  PaginatedResponse,
  TrendDataPoint,
  ModelStat
} from '@/types'
import type { NewApiLog, NewApiLogStat, NewApiPageInfo, NewApiQuotaData } from '@/types/newapi'
import { NEWAPI_LOG_TYPE_CONSUME, NEWAPI_LOG_TYPE_TOPUP } from '@/types/newapi'
import { quotaToUSD } from '@/utils/quota'
import { toLocalDayKey } from '@/utils/format'

// data/self rejects ranges wider than this (backend usedata controller).
export const DATA_RANGE_MAX_DAYS = 30
const DATA_RANGE_MAX_SECONDS = DATA_RANGE_MAX_DAYS * 86400

// ==================== Dashboard Types ====================

export interface UserDashboardStats {
  total_api_keys: number
  active_api_keys: number
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_input_tokens: number
  today_output_tokens: number
  today_cache_creation_tokens: number
  today_cache_read_tokens: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
  average_duration_ms: number
  rpm: number
  tpm: number
}

export interface TrendParams {
  start_date?: string
  end_date?: string
}

export interface TrendResponse {
  trend: TrendDataPoint[]
  start_date: string
  end_date: string
  granularity: string
}

export interface ModelStatsResponse {
  models: ModelStat[]
  start_date: string
  end_date: string
}

/** Filters accepted by query(); the backend filters by token NAME, not id. */
export type UsageLogFilters = UsageQueryParams & { token_name?: string }

// ==================== Adapters ====================

function adaptLog(log: NewApiLog): UsageLog {
  const costUSD = quotaToUSD(log.quota)
  return {
    id: log.id,
    user_id: log.user_id,
    api_key_id: log.token_id,
    account_id: null,
    request_id: log.request_id || '',
    model: log.model_name,
    group_id: null,
    subscription_id: null,
    input_tokens: log.prompt_tokens,
    output_tokens: log.completion_tokens,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_5m_tokens: 0,
    cache_creation_1h_tokens: 0,
    input_cost: 0,
    output_cost: 0,
    cache_creation_cost: 0,
    cache_read_cost: 0,
    total_cost: costUSD,
    actual_cost: costUSD,
    rate_multiplier: 1,
    billing_type: 0,
    stream: log.is_stream,
    request_type: log.is_stream ? 'stream' : 'sync',
    duration_ms: (log.use_time || 0) * 1000,
    first_token_ms: 0,
    image_count: 0,
    image_size: null,
    user_agent: null,
    cache_ttl_overridden: false,
    created_at: new Date(log.created_at * 1000).toISOString(),
    content: log.content,
    api_key: { name: log.token_name }
  }
}

function toUnixSeconds(date: string | undefined, endOfDay = false): number | undefined {
  if (!date) return undefined
  const t = new Date(endOfDay ? `${date}T23:59:59` : `${date}T00:00:00`)
  const v = Math.floor(t.getTime() / 1000)
  return Number.isFinite(v) ? v : undefined
}

/** Fetch per-model per-day aggregates, clamping the span to the backend's cap. */
async function fetchQuotaData(
  startTs: number,
  endTs: number,
  options?: { signal?: AbortSignal }
): Promise<NewApiQuotaData[]> {
  const clampedStart = Math.max(startTs, endTs - DATA_RANGE_MAX_SECONDS + 1)
  const { data } = await apiClient.get<NewApiQuotaData[]>('/data/self', {
    params: { start_timestamp: clampedStart, end_timestamp: endTs },
    signal: options?.signal
  })
  return data ?? []
}

// ==================== Log list ====================

/** Query usage (consume) logs. Filters: token_name (NOT id), model, date range. */
export async function query(
  params: UsageLogFilters,
  config: { signal?: AbortSignal } = {}
): Promise<PaginatedResponse<UsageLog>> {
  const { data } = await apiClient.get<NewApiPageInfo<NewApiLog>>('/log/self', {
    ...config,
    params: {
      p: params.page ?? 1,
      page_size: Math.min(params.page_size ?? 20, 100),
      type: NEWAPI_LOG_TYPE_CONSUME,
      start_timestamp: toUnixSeconds(params.start_date),
      end_timestamp: toUnixSeconds(params.end_date, true),
      token_name: params.token_name || undefined,
      model_name: params.model || undefined
    }
  })
  return adaptPageInfo(data, adaptLog)
}

/** Account-credit history (topup/redeem entries share LogType=1 — label it
 * "credit records", NOT "redeem history"; online payments appear here too). */
export async function listCreditLogs(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<UsageLog>> {
  const { data } = await apiClient.get<NewApiPageInfo<NewApiLog>>('/log/self', {
    params: { p: page, page_size: Math.min(pageSize, 100), type: NEWAPI_LOG_TYPE_TOPUP }
  })
  return adaptPageInfo(data, adaptLog)
}

// ==================== Range stats ====================

async function fetchStat(startTs?: number, endTs?: number): Promise<NewApiLogStat> {
  const { data } = await apiClient.get<NewApiLogStat>('/log/self/stat', {
    params: {
      type: NEWAPI_LOG_TYPE_CONSUME,
      start_timestamp: startTs,
      end_timestamp: endTs
    }
  })
  return data ?? { quota: 0, rpm: 0, tpm: 0 }
}

/** Range statistics assembled from data/self aggregates. Token in/out split is
 * not available — only totals are real. */
export async function getStatsByDateRange(
  startDate: string,
  endDate: string
): Promise<UsageStatsResponse> {
  const startTs = toUnixSeconds(startDate) ?? Math.floor(Date.now() / 1000) - 86400 * 7
  const endTs = toUnixSeconds(endDate, true) ?? Math.floor(Date.now() / 1000)
  const rows = await fetchQuotaData(startTs, endTs)
  const cost = quotaToUSD(rows.reduce((s, r) => s + r.quota, 0))
  return {
    total_requests: rows.reduce((s, r) => s + r.count, 0),
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_tokens: 0,
    total_tokens: rows.reduce((s, r) => s + r.token_used, 0),
    total_cost: cost,
    total_actual_cost: cost,
    average_duration_ms: 0
  }
}

// ==================== Dashboard ====================

export async function getDashboardStats(): Promise<UserDashboardStats> {
  const nowTs = Math.floor(Date.now() / 1000)
  const todayStart = toUnixSeconds(toLocalDayKey(new Date()))!
  const rangeStart = nowTs - DATA_RANGE_MAX_SECONDS + 1

  const [rows, stat, tokenPage] = await Promise.all([
    fetchQuotaData(rangeStart, nowTs),
    fetchStat(todayStart, nowTs),
    apiClient.get<NewApiPageInfo<{ status: number }>>('/token/', {
      params: { p: 1, page_size: 100 }
    })
  ])

  const todayRows = rows.filter((r) => r.created_at >= todayStart)
  const sum = (rs: NewApiQuotaData[], f: (r: NewApiQuotaData) => number) =>
    rs.reduce((s, r) => s + f(r), 0)
  const totalCost = quotaToUSD(sum(rows, (r) => r.quota))
  const todayCost = quotaToUSD(sum(todayRows, (r) => r.quota))

  const tokens = tokenPage.data.items ?? []
  return {
    total_api_keys: tokenPage.data.total,
    active_api_keys: tokens.filter((t) => t.status === 1).length,
    total_requests: sum(rows, (r) => r.count),
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_creation_tokens: 0,
    total_cache_read_tokens: 0,
    total_tokens: sum(rows, (r) => r.token_used),
    total_cost: totalCost,
    total_actual_cost: totalCost,
    today_requests: sum(todayRows, (r) => r.count),
    today_input_tokens: 0,
    today_output_tokens: 0,
    today_cache_creation_tokens: 0,
    today_cache_read_tokens: 0,
    today_tokens: sum(todayRows, (r) => r.token_used),
    today_cost: todayCost,
    today_actual_cost: todayCost,
    average_duration_ms: 0,
    rpm: stat.rpm,
    tpm: stat.tpm
  }
}

function foldTrend(rows: NewApiQuotaData[]): TrendDataPoint[] {
  const byDay = new Map<string, TrendDataPoint>()
  for (const r of rows) {
    const key = toLocalDayKey(new Date(r.created_at * 1000))
    const point = byDay.get(key) ?? {
      date: key,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      total_tokens: 0,
      cost: 0,
      actual_cost: 0
    }
    point.requests += r.count
    point.total_tokens += r.token_used
    point.cost += quotaToUSD(r.quota)
    point.actual_cost += quotaToUSD(r.quota)
    byDay.set(key, point)
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function foldModels(rows: NewApiQuotaData[]): ModelStat[] {
  const byModel = new Map<string, ModelStat>()
  for (const r of rows) {
    const m = byModel.get(r.model_name) ?? {
      model: r.model_name,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      total_tokens: 0,
      cost: 0,
      actual_cost: 0
    }
    m.requests += r.count
    m.total_tokens += r.token_used
    m.cost += quotaToUSD(r.quota)
    m.actual_cost += quotaToUSD(r.quota)
    byModel.set(r.model_name, m)
  }
  return [...byModel.values()].sort((a, b) => b.actual_cost - a.actual_cost)
}

/** Daily trend + per-model stats from ONE data/self fetch (day granularity). */
export async function getDashboardChartData(params?: TrendParams): Promise<{
  trend: TrendResponse
  models: ModelStatsResponse
}> {
  const endTs = toUnixSeconds(params?.end_date, true) ?? Math.floor(Date.now() / 1000)
  const startTs = toUnixSeconds(params?.start_date) ?? endTs - 86400 * 7
  const rows = await fetchQuotaData(startTs, endTs)
  const startDate = params?.start_date ?? toLocalDayKey(new Date(startTs * 1000))
  const endDate = params?.end_date ?? toLocalDayKey(new Date(endTs * 1000))
  return {
    trend: { trend: foldTrend(rows), start_date: startDate, end_date: endDate, granularity: 'day' },
    models: { models: foldModels(rows), start_date: startDate, end_date: endDate }
  }
}

/** Recent logs for the dashboard panel. */
export async function getByDateRange(
  startDate: string,
  endDate: string,
  pageSize: number = 100
): Promise<PaginatedResponse<UsageLog>> {
  return query({ start_date: startDate, end_date: endDate, page: 1, page_size: pageSize })
}

export const usageAPI = {
  query,
  listCreditLogs,
  getStatsByDateRange,
  getByDateRange,
  getDashboardStats,
  getDashboardChartData
}

export default usageAPI
