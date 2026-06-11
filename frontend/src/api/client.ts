/**
 * Axios HTTP Client Configuration
 * Base client with interceptors for cookie-session auth and error handling
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import type { ApiResponse, User } from '@/types'
import { getLocale } from '@/i18n'

// ==================== Axios Instance Configuration ====================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  // Send the session cookie on every request (HttpOnly, browser-managed).
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

// ==================== Session Persistence ====================
// The backend identifies the user by a session cookie plus a `New-Api-User`
// header carrying the numeric user id. We persist the id (for the header) and a
// cached user object (so a page reload can restore auth state synchronously
// before the profile re-fetch completes).

const USER_ID_KEY = 'new_api_user_id'
const USER_KEY = 'new_api_user'

export function getStoredUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_KEY)
  } catch {
    return null
  }
}

export function setStoredUserId(id: number | string): void {
  try {
    localStorage.setItem(USER_ID_KEY, String(id))
  } catch {
    // ignore localStorage failures
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: User): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // ignore localStorage failures
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem(USER_KEY)
    // Purge pre-migration JWT artifacts so logout / 401 fully clears legacy state.
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('auth_user')
    localStorage.removeItem('token_expires_at')
  } catch {
    // ignore localStorage failures
  }
}

// ==================== Request Interceptor ====================

// Get user's timezone
const getUserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Attach the session auth headers (New-Api-User + Accept-Language). Shared with
 * the raw payment client in api/topup.ts, which must bypass the RESPONSE
 * interceptor but still authenticate identically.
 */
export function attachSessionHeaders(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  // Attach the user id required by the backend session auth. Public endpoints
  // ignore it; authenticated endpoints reject the request without it.
  const userId = getStoredUserId()
  if (userId && config.headers) {
    config.headers['New-Api-User'] = userId
  }
  // Attach locale for backend translations
  if (config.headers) {
    config.headers['Accept-Language'] = getLocale()
  }
  return config
}

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    attachSessionHeaders(config)

    // Attach timezone for all GET requests (backend may use it for default date ranges)
    if (config.method === 'get') {
      if (!config.params) {
        config.params = {}
      }
      config.params.timezone = getUserTimezone()
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// ==================== Response Interceptor ====================

const PUBLIC_PATHS = [
  '/login', '/register', '/forgot-password', '/reset-password', '/email-verify',
  '/home', '/setup', '/auth/callback', '/auth/linuxdo/callback'
]

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Unwrap the standard envelope { success, message, data }.
    const apiResponse = response.data as ApiResponse<unknown>
    if (apiResponse && typeof apiResponse === 'object' && 'success' in apiResponse) {
      if (apiResponse.success === true) {
        // Success - return the data portion
        response.data = apiResponse.data
        return response
      }
      // IMPORTANT: the backend returns logical errors on HTTP 200 with
      // { success: false }. Reject here so callers never treat them as success.
      return Promise.reject({
        status: response.status,
        message: apiResponse.message || 'Unknown error'
      })
    }
    // Non-enveloped responses (relay / SSE / binary) pass through untouched.
    return response
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    // Request cancellation: keep the original axios cancellation error so callers can ignore it.
    // Otherwise we'd misclassify it as a generic "network error".
    if (error.code === 'ERR_CANCELED' || axios.isCancel(error)) {
      return Promise.reject(error)
    }

    // Handle common errors
    if (error.response) {
      const { status, data } = error.response
      const url = String(error.config?.url || '')

      // Validate `data` shape to avoid HTML error pages breaking our error handling.
      const apiData = (typeof data === 'object' && data !== null ? data : {}) as Record<string, any>

      // Ops monitoring disabled: treat as feature-flagged 404, and proactively redirect away
      // from ops pages to avoid broken UI states.
      if (status === 404 && apiData.message === 'Ops monitoring is disabled') {
        try {
          localStorage.setItem('ops_monitoring_enabled_cached', 'false')
        } catch {
          // ignore localStorage failures
        }
        try {
          window.dispatchEvent(new CustomEvent('ops-monitoring-disabled'))
        } catch {
          // ignore event failures
        }

        if (window.location.pathname.startsWith('/admin/ops')) {
          window.location.href = '/admin/settings'
        }

        return Promise.reject({
          status,
          code: 'OPS_DISABLED',
          message: apiData.message || error.message,
          url
        })
      }

      // 401: missing/expired session, or a missing/mismatched `New-Api-User`
      // header. There is no token refresh under cookie-session — re-login is the
      // only recovery, so clear the cached session and bounce to login.
      if (status === 401) {
        const isAuthEndpoint =
          url.includes('/user/login') || url.includes('/user/register')

        clearStoredAuth()

        if (!isAuthEndpoint) {
          sessionStorage.setItem('auth_expired', '1')
        }

        // Only redirect on protected pages; public pages must not bounce.
        const pathname = window.location.pathname
        const isPublicPage = PUBLIC_PATHS.some((p) => pathname.includes(p))
        if (!isPublicPage && !isAuthEndpoint && !pathname.includes('/login')) {
          window.location.href = '/login'
        }
      }

      // Return structured error
      return Promise.reject({
        status,
        code: apiData.code,
        error: apiData.error,
        message: apiData.message || apiData.detail || error.message
      })
    }

    // Network error
    return Promise.reject({
      status: 0,
      message: 'Network error. Please check your connection.'
    })
  }
)

export default apiClient
