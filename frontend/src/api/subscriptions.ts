/**
 * User subscriptions — backed by the native subscription endpoints.
 *
 * Contract notes (verified):
 * - GET /subscription/self returns { billing_preference, subscriptions:
 *   [{subscription}], all_subscriptions } — there is NO plan object inside, so
 *   plan titles are joined client-side from GET /subscription/plans.
 * - GET /subscription/plans returns [] until payment compliance is confirmed —
 *   an empty list HIDES purchase entry points (gate, not an error).
 * - POST /subscription/balance/pay is additionally gated per-plan by
 *   allow_balance_pay; the server is authoritative, the UI only disables.
 */

import { apiClient } from './client'
import type {
  NewApiSubscriptionPlan,
  NewApiSubscriptionSelf,
  NewApiUserSubscription
} from '@/types/newapi'
import { quotaToUSD } from '@/utils/quota'

/** View-facing subscription shape: single used/total progress (the backend has
 * no daily/weekly/monthly windows — do not fabricate them). */
export interface SubscriptionDisplay {
  id: number
  plan_id: number
  plan_title: string
  plan_subtitle?: string
  status: string
  amount_total_usd: number
  amount_used_usd: number
  /** 0-100; null when the plan grants unlimited amount (amount_total=0). */
  usage_pct: number | null
  started_at: string
  expires_at: string | null
  next_reset_at: string | null
}

function adaptSubscription(
  s: NewApiUserSubscription,
  plans: Map<number, NewApiSubscriptionPlan>
): SubscriptionDisplay {
  const plan = plans.get(s.plan_id)
  const expiresAt = s.end_time > 0 ? new Date(s.end_time * 1000) : null
  return {
    id: s.id,
    plan_id: s.plan_id,
    plan_title: plan?.title ?? `#${s.plan_id}`,
    plan_subtitle: plan?.subtitle,
    status: s.status,
    amount_total_usd: quotaToUSD(s.amount_total),
    amount_used_usd: quotaToUSD(s.amount_used),
    usage_pct:
      s.amount_total > 0
        ? Math.min(100, Math.round((s.amount_used / s.amount_total) * 100))
        : null,
    started_at: new Date(s.start_time * 1000).toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    next_reset_at:
      s.next_reset_time && s.next_reset_time > 0
        ? new Date(s.next_reset_time * 1000).toISOString()
        : null
  }
}

// Plans are quasi-static; memoize briefly so the self+plans join doesn't refetch
// them on every navigation (the subscriptions store has its own 60s TTL on top).
const PLANS_TTL_MS = 60_000
let plansCache: { at: number; promise: Promise<NewApiSubscriptionPlan[]> } | null = null

/** Purchasable plans. Empty array = payment compliance not confirmed (hide entry). */
export async function getPlans(force = false): Promise<NewApiSubscriptionPlan[]> {
  if (!force && plansCache && Date.now() - plansCache.at < PLANS_TTL_MS) {
    return plansCache.promise
  }
  const promise = apiClient
    .get<Array<{ plan: NewApiSubscriptionPlan }>>('/subscription/plans')
    .then(({ data }) => (data ?? []).map((p) => p.plan))
  plansCache = { at: Date.now(), promise }
  promise.catch(() => {
    plansCache = null
  })
  return promise
}

async function getSelf(): Promise<NewApiSubscriptionSelf> {
  const { data } = await apiClient.get<NewApiSubscriptionSelf>('/subscription/self')
  return data
}

async function planIndex(): Promise<Map<number, NewApiSubscriptionPlan>> {
  try {
    const plans = await getPlans()
    return new Map(plans.map((p) => [p.id, p]))
  } catch {
    // Plan join is cosmetic (titles); subscriptions must still render.
    return new Map()
  }
}

/** All subscriptions (incl. expired) joined with plan titles. */
export async function getMySubscriptions(): Promise<SubscriptionDisplay[]> {
  const [self, plans] = await Promise.all([getSelf(), planIndex()])
  return (self.all_subscriptions ?? []).map((s) => adaptSubscription(s.subscription, plans))
}

/** Active subscriptions only. */
export async function getActiveSubscriptions(): Promise<SubscriptionDisplay[]> {
  const [self, plans] = await Promise.all([getSelf(), planIndex()])
  return (self.subscriptions ?? []).map((s) => adaptSubscription(s.subscription, plans))
}

export async function updateBillingPreference(preference: string): Promise<void> {
  await apiClient.put('/subscription/self/preference', { billing_preference: preference })
}

/** Purchase with wallet balance. Server enforces compliance + allow_balance_pay +
 * sufficient balance; surface its error message verbatim. */
export async function balancePay(planId: number): Promise<void> {
  await apiClient.post('/subscription/balance/pay', { plan_id: planId })
}

/** Purchase via the online payment gateway. */
export async function epayPay(planId: number, paymentMethod?: string): Promise<unknown> {
  const { data } = await apiClient.post('/subscription/epay/pay', {
    plan_id: planId,
    payment_method: paymentMethod
  })
  return data
}

export const subscriptionsAPI = {
  getPlans,
  getMySubscriptions,
  getActiveSubscriptions,
  updateBillingPreference,
  balancePay,
  epayPay
}

export default subscriptionsAPI
