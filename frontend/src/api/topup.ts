/**
 * Top-up / redeem — backed by the native payment endpoints.
 *
 * FINANCIAL MODULE RULES (design consensus):
 * - The server is the only authority: render what it returns, never compute
 *   payable amounts locally, never optimistically update balances.
 * - POST /user/amount and POST /user/pay reply with `{message:'success'|'error',
 *   data[, url]}` and NO `success` boolean, so they bypass the shared client
 *   (whose interceptor would mis-handle them) via a dedicated raw instance.
 * - Buttons must debounce/disable while a request is in flight (the backend
 *   also holds a per-user lock, but the UI must not double-fire).
 */

import axios from 'axios'
import { apiClient, attachSessionHeaders } from './client'
import { adaptPageInfo } from './pagination'
import type { NewApiPageInfo, NewApiTopUp, NewApiTopUpInfo } from '@/types/newapi'
import type { PaginatedResponse } from '@/types'

// Raw instance for the two non-enveloped payment endpoints only: it must skip
// the shared RESPONSE interceptor (their {message:'success'} envelope would be
// mis-handled) but authenticates with the same session headers.
const rawPayClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})
rawPayClient.interceptors.request.use(attachSessionHeaders)

/** Payment options/config for the top-up page. */
export async function getTopUpInfo(): Promise<NewApiTopUpInfo> {
  const { data } = await apiClient.get<NewApiTopUpInfo>('/user/topup/info')
  return data
}

/** Paginated top-up (payment) records. */
export async function getUserTopUps(
  page: number = 1,
  pageSize: number = 10,
  keyword?: string
): Promise<PaginatedResponse<NewApiTopUp>> {
  const { data } = await apiClient.get<NewApiPageInfo<NewApiTopUp>>('/user/topup/self', {
    params: { p: page, page_size: Math.min(pageSize, 100), keyword: keyword || undefined }
  })
  return adaptPageInfo(data)
}

/** Redeem a code. Resolves with the credited quota units (server-authoritative);
 * the caller must re-fetch the user to show the new balance. */
export async function redeem(key: string): Promise<number> {
  const { data } = await apiClient.post<number>('/user/topup', { key })
  return data
}

export interface EpayAmountPreview {
  /** Server-computed payable amount (display string, authoritative). */
  amount: string
}

/** Preview the payable amount for a top-up count. Non-enveloped endpoint. */
export async function requestAmount(amount: number): Promise<EpayAmountPreview> {
  const { data } = await rawPayClient.post<{ message: string; data: string }>('/user/amount', {
    amount
  })
  if (!data || data.message !== 'success') {
    // Failure payloads are either {message:'error', data:'<reason>'} or the
    // standard {success:false, message:'<reason>'} from shared guards.
    throw new Error(
      (typeof data?.data === 'string' && data.data) || data?.message || 'amount preview failed'
    )
  }
  return { amount: data.data }
}

export interface EpayOrder {
  /** Gateway endpoint to submit the params to (form POST / redirect). */
  url: string
  /** Signed gateway parameters, rendered as hidden form fields. Never iframe. */
  params: Record<string, string>
}

/** Create a payment order. Non-enveloped endpoint; success REQUIRES url+params —
 * anything else must surface as an error, never a success state. */
export async function requestEpay(amount: number, paymentMethod: string): Promise<EpayOrder> {
  const { data } = await rawPayClient.post<{
    message: string
    data: Record<string, string> | string
    url?: string
  }>('/user/pay', { amount, payment_method: paymentMethod })
  if (!data || data.message !== 'success') {
    throw new Error(
      (typeof data?.data === 'string' && data.data) || data?.message || 'payment request failed'
    )
  }
  if (!data.url || typeof data.data !== 'object') {
    throw new Error('payment gateway returned an incomplete order')
  }
  return { url: data.url, params: data.data }
}

export const topupAPI = {
  getTopUpInfo,
  getUserTopUps,
  redeem,
  requestAmount,
  requestEpay
}

export default topupAPI
