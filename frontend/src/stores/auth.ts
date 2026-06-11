/**
 * Authentication Store
 * Manages user authentication state over the cookie-session backend
 */

import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { authAPI, isTotp2FARequired, type LoginResponse } from '@/api'
import {
  setStoredUserId,
  setStoredUser,
  getStoredUser,
  clearStoredAuth
} from '@/api/client'
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@/types'

const AUTO_REFRESH_INTERVAL = 60 * 1000 // 60 seconds for user data refresh

export const useAuthStore = defineStore('auth', () => {
  // ==================== State ====================

  const user = ref<User | null>(null)
  const runMode = ref<'standard' | 'simple'>('standard')
  let refreshIntervalId: ReturnType<typeof setInterval> | null = null

  // ==================== Computed ====================

  // Legacy compatibility accessor. There is no client-held token under
  // cookie-session; not-yet-migrated embed views still read this.
  const token = computed<string | null>(() => null)

  const isAuthenticated = computed(() => !!user.value)

  const isAdmin = computed(() => (user.value?.role ?? 0) >= 10)

  const isSimpleMode = computed(() => runMode.value === 'simple')

  // ==================== Actions ====================

  /**
   * Persist the user in state + local cache, and the id used for the
   * `New-Api-User` header.
   */
  function persistUser(u: User): void {
    user.value = u
    setStoredUserId(u.id)
    setStoredUser(u)
  }

  /**
   * Restore session on app startup.
   * Optimistically hydrates from the cached user so navigation guards see an
   * authenticated state on reload, then validates against the server session.
   */
  function checkAuth(): void {
    const cached = getStoredUser()
    if (!cached) {
      return
    }

    user.value = cached

    // Validate / refresh against the live session (cookie), async.
    refreshUser().catch((error) => {
      console.error('Failed to restore session:', error)
    })

    // Start auto-refresh interval for user data
    startAutoRefresh()
  }

  /**
   * Start auto-refresh interval for user data
   * Refreshes user data every 60 seconds
   */
  function startAutoRefresh(): void {
    // Clear existing interval if any
    stopAutoRefresh()

    refreshIntervalId = setInterval(() => {
      if (user.value) {
        refreshUser().catch((error) => {
          console.error('Auto-refresh user failed:', error)
        })
      }
    }, AUTO_REFRESH_INTERVAL)
  }

  /**
   * Stop auto-refresh interval
   */
  function stopAutoRefresh(): void {
    if (refreshIntervalId) {
      clearInterval(refreshIntervalId)
      refreshIntervalId = null
    }
  }

  /**
   * User login
   * @param credentials - Login credentials (email and password)
   * @returns Promise resolving to the login response (may require 2FA)
   * @throws Error if login fails
   */
  async function login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await authAPI.login(credentials)

      // If 2FA is required, return the response without setting auth state
      if (isTotp2FARequired(response)) {
        return response
      }

      // Set auth state from the response
      setAuthFromResponse(response)

      return response
    } catch (error) {
      // Clear any partial state on error
      clearAuth()
      throw error
    }
  }

  /**
   * Complete login with a 2FA code (TOTP or backup code)
   * @param code - The verification code
   * @returns Promise resolving to the authenticated user
   * @throws Error if 2FA verification fails
   */
  async function login2FA(code: string): Promise<User> {
    try {
      const response = await authAPI.login2FA({ code })
      setAuthFromResponse(response)
      return user.value!
    } catch (error) {
      clearAuth()
      throw error
    }
  }

  /**
   * Set auth state from a login/2FA response (a flat user object)
   * Internal helper function
   */
  function setAuthFromResponse(response: AuthResponse): void {
    persistUser(response)
    // Start auto-refresh interval for user data
    startAutoRefresh()
  }

  /**
   * User registration
   * The backend does not establish a session on register, so we log in
   * afterwards to preserve the prior "register then land authenticated" flow.
   * @param userData - Registration data (email, password)
   * @throws Error if registration or the follow-up login fails
   */
  async function register(userData: RegisterRequest): Promise<void> {
    try {
      await authAPI.register(userData)
      await login({ email: userData.email, password: userData.password })
    } catch (error) {
      // Clear any partial state on error
      clearAuth()
      throw error
    }
  }

  /**
   * Establish auth state after an OAuth/SSO callback whose session cookie was set
   * server-side. There is no client-held token under cookie-session, so this just
   * hydrates the user from the live session (the cookie).
   */
  async function hydrateSession(): Promise<User> {
    stopAutoRefresh()
    user.value = null

    try {
      const userData = await refreshUser()
      startAutoRefresh()
      return userData
    } catch (error) {
      clearAuth()
      throw error
    }
  }

  /**
   * User logout
   * Clears the server session and all local authentication state
   */
  async function logout(): Promise<void> {
    // Clear the server-side session
    await authAPI.logout()

    // Clear local state
    clearAuth()
  }

  /**
   * Refresh current user data from the server (cookie session)
   * @returns Promise resolving to the updated user
   * @throws Error if not authenticated or request fails
   */
  async function refreshUser(): Promise<User> {
    try {
      const response = await authAPI.getCurrentUser()
      if (response.data.run_mode) {
        runMode.value = response.data.run_mode
      }
      const { run_mode: _run_mode, ...userData } = response.data
      persistUser(userData)

      return userData
    } catch (error) {
      // If refresh fails with 401, clear auth state
      if ((error as { status?: number }).status === 401) {
        clearAuth()
      }
      throw error
    }
  }

  /**
   * Clear all authentication state
   * Internal helper function
   */
  function clearAuth(): void {
    // Stop auto-refresh
    stopAutoRefresh()

    user.value = null
    runMode.value = 'standard'
    clearStoredAuth()
  }

  // ==================== Return Store API ====================

  return {
    // State
    user,
    token,
    runMode: readonly(runMode),

    // Computed
    isAuthenticated,
    isAdmin,
    isSimpleMode,

    // Actions
    login,
    login2FA,
    register,
    hydrateSession,
    logout,
    checkAuth,
    refreshUser
  }
})
