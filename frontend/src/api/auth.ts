/**
 * Authentication API endpoints
 * Handles user login, registration, and logout over the cookie-session backend
 */

import { apiClient } from './client'
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  CurrentUserResponse,
  SendVerifyCodeRequest,
  SendVerifyCodeResponse,
  PublicSettings,
  TotpLoginResponse,
  TotpLogin2FARequest
} from '@/types'

/**
 * Login response type - can be either a full user (success) or a 2FA challenge
 */
export type LoginResponse = AuthResponse | TotpLoginResponse

/**
 * Type guard to check if login response requires 2FA
 */
export function isTotp2FARequired(response: LoginResponse): response is TotpLoginResponse {
  return 'require_2fa' in response && response.require_2fa === true
}

/**
 * User login
 * The backend Turnstile middleware reads the token from the `?turnstile=` query,
 * so forward it there when the view collected one.
 * @param credentials - Email and password (the email is sent as the backend username)
 * @returns The authenticated user, or a 2FA-required challenge
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>(
    '/user/login',
    {
      username: credentials.email,
      password: credentials.password
    },
    // axios drops undefined params, mirroring sendVerifyCode/forgotPassword
    { params: { turnstile: credentials.turnstile_token } }
  )
  return data
}

/**
 * Complete login with a 2FA code (TOTP or backup code)
 * @param request - The verification code
 * @returns The authenticated user
 */
export async function login2FA(request: TotpLogin2FARequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/user/login/2fa', request)
  return data
}

/**
 * User registration
 * The backend returns no session on register; the caller logs in afterwards.
 * As with login, the Turnstile token travels in the `?turnstile=` query.
 * @param userData - Registration data
 */
export async function register(userData: RegisterRequest): Promise<void> {
  await apiClient.post(
    '/user/register',
    {
      username: userData.email,
      password: userData.password,
      email: userData.email,
      verification_code: userData.verify_code,
      aff_code: userData.referral_code
    },
    { params: { turnstile: userData.turnstile_token } }
  )
}

/**
 * Get current authenticated user
 * @returns User profile data
 */
export async function getCurrentUser() {
  return apiClient.get<CurrentUserResponse>('/user/self')
}

/**
 * User logout - clears the server-side session
 */
export async function logout(): Promise<void> {
  try {
    // POST (state-changing) + the New-Api-User header (injected by the axios
    // request interceptor) makes this CSRF-safe. The store still clears local
    // state even if this errors (e.g. an already-expired session).
    await apiClient.post('/user/logout')
  } catch {
    // Ignore errors - the store still clears local state.
  }
}

/**
 * Fail-closed defaults for the public settings payload. Returned verbatim when
 * GET /api/public-settings is unavailable (e.g. an older backend without the
 * endpoint), and used as the per-field repair source for partial/malformed
 * server payloads.
 */
export const PUBLIC_SETTINGS_FALLBACK: PublicSettings = {
  registration_enabled: true,
  email_verify_enabled: false,
  registration_email_suffix_whitelist: [],
  promo_code_enabled: false,
  password_reset_enabled: false,
  invitation_code_enabled: false,
  turnstile_enabled: false,
  turnstile_site_key: '',
  site_name: '',
  site_logo: '',
  site_subtitle: '',
  api_base_url: '',
  contact_info: '',
  doc_url: '',
  home_content: '',
  hide_ccs_import_button: false,
  purchase_subscription_enabled: false,
  purchase_subscription_url: '',
  payg_enabled: false,
  payg_exchange_rate: 0,
  payg_fixed_amount_options: [],
  custom_menu_items: [],
  custom_endpoints: [],
  linuxdo_oauth_enabled: false,
  backend_mode_enabled: false,
  version: '',
  // Route chat through the new-api session path (POST /pg/chat/completions);
  // this fused deployment has no sub2api gateway.
  chat_provider_mode: 'newapi_bff',
  newapi_console_url: ''
}

/**
 * Merge a server payload over the fallback, then repair malformed fields
 * fail-closed: array fields that are not arrays, string fields that are
 * null/undefined, and unknown chat_provider_mode values all revert to the
 * fallback value.
 */
function normalizePublicSettings(data: unknown): PublicSettings {
  const overrides = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const merged: Record<string, unknown> = { ...PUBLIC_SETTINGS_FALLBACK, ...overrides }
  for (const [key, fallback] of Object.entries(PUBLIC_SETTINGS_FALLBACK)) {
    const value = merged[key]
    const broken = Array.isArray(fallback)
      ? !Array.isArray(value)
      : typeof fallback === 'string' && (value === null || value === undefined)
    if (broken) {
      merged[key] = fallback
    }
  }
  if (merged.chat_provider_mode !== 'sub2api' && merged.chat_provider_mode !== 'newapi_bff') {
    merged.chat_provider_mode = 'newapi_bff'
  }
  return merged as unknown as PublicSettings
}

// Shares one request between concurrent callers (e.g. App.vue and LoginView both
// fetch on first paint); cleared on settle so later mounts still get fresh data.
let publicSettingsInFlight: Promise<PublicSettings> | null = null

/**
 * Get public settings (no auth required)
 *
 * Fetches GET /api/public-settings and normalizes the payload over
 * PUBLIC_SETTINGS_FALLBACK. Never throws — callers treat this as infallible,
 * so any failure (older backend without the endpoint, network error) degrades
 * to the static fallback.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  if (!publicSettingsInFlight) {
    publicSettingsInFlight = apiClient
      .get<PublicSettings>('/public-settings')
      .then(({ data }) => normalizePublicSettings(data))
      .catch((error) => {
        console.warn('Failed to fetch public settings, using fallback defaults:', error)
        return { ...PUBLIC_SETTINGS_FALLBACK }
      })
      .finally(() => {
        publicSettingsInFlight = null
      })
  }
  // Each caller gets its own copy so shared results can't be cross-mutated.
  return { ...(await publicSettingsInFlight) }
}

/**
 * Send verification code to email
 * @param request - Email and optional Turnstile token
 * @returns Response with countdown seconds
 */
export async function sendVerifyCode(
  request: SendVerifyCodeRequest
): Promise<SendVerifyCodeResponse> {
  // new-api: GET /api/verification?email=&turnstile= (Turnstile enforced by middleware).
  // The backend returns no countdown, so synthesize a client-side resend window.
  await apiClient.get('/verification', {
    params: { email: request.email, turnstile: request.turnstile_token }
  })
  return { message: '', countdown: 60 }
}

/**
 * Forgot password request
 */
export interface ForgotPasswordRequest {
  email: string
  turnstile_token?: string
}

/**
 * Forgot password response
 */
export interface ForgotPasswordResponse {
  message: string
}

/**
 * Request password reset link
 * @param request - Email and optional Turnstile token
 * @returns Response with message
 */
export async function forgotPassword(request: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  // new-api: GET /api/reset_password?email= sends the reset-link email.
  await apiClient.get('/reset_password', {
    params: { email: request.email, turnstile: request.turnstile_token }
  })
  return { message: '' }
}

/**
 * Reset password request
 */
export interface ResetPasswordRequest {
  email: string
  token: string
  new_password: string
}

/**
 * Reset password response
 */
export interface ResetPasswordResponse {
  message: string
}

/**
 * Reset password with token
 * @param request - Email, token, and new password
 * @returns Response with message
 */
export async function resetPassword(request: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  // new-api: POST /api/user/reset {email, token}. NOTE: the backend generates a
  // fresh random password and emails it; `request.new_password` is NOT honored.
  // The reset UI is currently hidden (password_reset disabled); the user-chosen
  // password UX remap is a separate follow-up.
  await apiClient.post('/user/reset', { email: request.email, token: request.token })
  return { message: '' }
}

/**
 * Validate promo code response
 */
export interface ValidatePromoCodeResponse {
  valid: boolean
  bonus_amount?: number
  error_code?: string
  message?: string
}

/**
 * Validate promo code.
 *
 * Shim: promo codes have no backend equivalent in the new gateway. Retired as a
 * no-op so the registration form keeps compiling and behaving (the field is
 * hidden while the feature is disabled). Migrated in a later phase.
 */
export async function validatePromoCode(_code: string): Promise<ValidatePromoCodeResponse> {
  return { valid: false }
}

/**
 * Validate invitation code response
 */
export interface ValidateInvitationCodeResponse {
  valid: boolean
  error_code?: string
}

/**
 * Validate invitation code.
 *
 * Shim: invitation codes have no backend equivalent in the new gateway. Retired
 * as a no-op so the registration form keeps compiling and behaving (the field is
 * hidden while the feature is disabled). Migrated in a later phase.
 */
export async function validateInvitationCode(_code: string): Promise<ValidateInvitationCodeResponse> {
  return { valid: false }
}

/**
 * Complete a LinuxDo OAuth registration that requires an invitation code.
 *
 * NOT-WIRED: new-api's OAuth flow is server-side (GET /api/oauth/:provider sets the
 * session cookie via a redirect) and has no JWT / invitation-completion endpoint, so
 * this call has no new-api backend yet. The LinuxDo OAuth end-to-end flow needs
 * new-api OAuth wiring (separate phase). Kept as a typed stub so the callback view
 * compiles; on success the caller hydrates the session from the cookie. No tokens
 * are returned under cookie-session.
 */
export async function completeLinuxDoOAuthRegistration(
  pendingOAuthToken: string,
  invitationCode: string
): Promise<void> {
  await apiClient.post('/auth/oauth/linuxdo/complete-registration', {
    pending_oauth_token: pendingOAuthToken,
    invitation_code: invitationCode
  })
}

export const authAPI = {
  login,
  login2FA,
  isTotp2FARequired,
  register,
  getCurrentUser,
  logout,
  getPublicSettings,
  sendVerifyCode,
  forgotPassword,
  resetPassword,
  completeLinuxDoOAuthRegistration
}

export default authAPI
