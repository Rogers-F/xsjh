/**
 * Native backend DTO shapes (adapter INPUT side).
 *
 * These mirror the Go models/controllers verbatim (snake_case JSON, unix-second
 * timestamps, integer quota units). The api/* modules adapt them into the view
 * types in ./index.ts; views never consume these directly.
 */

// Shared paginated envelope: common/page_info.go (query params are `p` + `page_size`).
export interface NewApiPageInfo<T> {
  page: number
  page_size: number
  total: number
  items: T[] | null
}

// model/token.go
export interface NewApiToken {
  id: number
  user_id: number
  key: string // masked in every list/get response
  status: number // 1 enabled, 2 disabled, 3 expired, 4 exhausted (common/constants.go)
  name: string
  created_time: number
  accessed_time: number
  expired_time: number // unix seconds; -1 = never expires (0 is NOT "never")
  remain_quota: number // integer quota units
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string // comma-separated
  allow_ips?: string | null
  used_quota: number
  group: string
  cross_group_retry?: boolean
}

// model/log.go (LogType: 1 topup, 2 consume, 3 manage, 4 system, 5 error, 6 refund)
export interface NewApiLog {
  id: number
  user_id: number
  created_at: number // unix seconds
  type: number
  content: string
  username: string
  token_name: string
  model_name: string
  quota: number // integer quota units
  prompt_tokens: number
  completion_tokens: number
  use_time: number // seconds
  is_stream: boolean
  channel: number
  token_id: number
  group: string
  ip?: string
  request_id?: string
  upstream_request_id?: string
  other?: string
}

export const NEWAPI_LOG_TYPE_TOPUP = 1
export const NEWAPI_LOG_TYPE_CONSUME = 2

// model/usedata.go — per-user per-model per-day aggregates from GET /api/data/self
export interface NewApiQuotaData {
  id: number
  user_id: number
  username: string
  model_name: string
  created_at: number // unix seconds (day bucket)
  token_used: number
  count: number
  quota: number // integer quota units
}

// controller/topup.go GetTopUpInfo (field subset the user face consumes)
export interface NewApiTopUpInfo {
  enable_online_topup?: boolean
  enable_stripe_topup?: boolean
  enable_creem_topup?: boolean
  // Online payments are forbidden server-side until the admin confirms the
  // compliance terms; the UI must hide the top-up form when this is false.
  payment_compliance_confirmed?: boolean
  pay_methods?: Array<{ name: string; type: string; color?: string; min_topup?: number }>
  min_topup?: number
  amount_options?: number[]
  discount?: Record<string, number>
  topup_link?: string
  [key: string]: unknown
}

// model/topup.go
export interface NewApiTopUp {
  id: number
  user_id: number
  // The top-up COUNT as entered by the user (display dollars, possibly before
  // discount) — NOT integer quota units. The credited quota is amount*QuotaPerUnit
  // applied by the payment callback; never run this through quotaToUSD().
  amount: number
  money: number // money actually paid (gateway currency)
  trade_no: string
  payment_method?: string
  create_time?: number
  complete_time?: number
  status: string
}

// model/subscription.go SubscriptionPlan (wrapped as {plan} by the plans endpoints)
export interface NewApiSubscriptionPlan {
  id: number
  title: string
  subtitle?: string
  price_amount: number // money, NOT quota units
  currency: string
  duration_unit: string
  duration_value: number
  enabled: boolean
  sort_order?: number
  allow_balance_pay?: boolean | null
  total_amount: number // integer quota units granted
  max_purchase_per_user?: number
  upgrade_group?: string
  quota_reset_period?: string
}

// model/subscription.go UserSubscription
export interface NewApiUserSubscription {
  id: number
  user_id: number
  plan_id: number
  amount_total: number // integer quota units
  amount_used: number // integer quota units
  start_time: number // unix seconds
  end_time: number // unix seconds
  status: 'active' | 'expired' | 'cancelled' | string
  source?: string
  last_reset_time?: number
  next_reset_time?: number
}

// controller/subscription.go GetSubscriptionSelf
export interface NewApiSubscriptionSelf {
  billing_preference: string
  subscriptions: Array<{ subscription: NewApiUserSubscription }>
  all_subscriptions: Array<{ subscription: NewApiUserSubscription }>
}

// controller/log.go GetLogsSelfStat
export interface NewApiLogStat {
  quota: number
  rpm: number
  tpm: number
}
