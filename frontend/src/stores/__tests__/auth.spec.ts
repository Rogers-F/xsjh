import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

// The store transitively imports api/client (for the session-cache helpers), which
// imports the i18n locale getter; stub it so the import is side-effect free.
vi.mock('@/i18n', () => ({
  getLocale: () => 'zh-CN',
}))

// Mock authAPI (the network layer). isTotp2FARequired mirrors the real guard.
const mockLogin = vi.fn()
const mockLogin2FA = vi.fn()
const mockLogout = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockRegister = vi.fn()

vi.mock('@/api', () => ({
  authAPI: {
    login: (...args: any[]) => mockLogin(...args),
    login2FA: (...args: any[]) => mockLogin2FA(...args),
    logout: (...args: any[]) => mockLogout(...args),
    getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
    register: (...args: any[]) => mockRegister(...args),
  },
  isTotp2FARequired: (response: any) => response?.require_2fa === true,
}))

// Cookie-session: login/2FA return the User object directly (no token wrapper).
const fakeUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  role: 1, // 1 = common user
  status: 1, // 1 = enabled
  group: 'default',
}

const fakeAdminUser = {
  ...fakeUser,
  id: 2,
  username: 'admin',
  email: 'admin@example.com',
  role: 10, // 10 = admin
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- login ---

  describe('login', () => {
    it('成功登录后设置 user 并持久化 id/user（无 token）', async () => {
      mockLogin.mockResolvedValue({ ...fakeUser })
      const store = useAuthStore()

      await store.login({ email: 'test@example.com', password: '123456' })

      expect(store.user).toEqual(fakeUser)
      expect(store.isAuthenticated).toBe(true)
      expect(store.token).toBeNull() // 兼容访问器，cookie-session 下恒为 null
      expect(localStorage.getItem('new_api_user_id')).toBe('1')
      expect(localStorage.getItem('new_api_user')).toBe(JSON.stringify(fakeUser))
      // 旧 JWT 键不应被写入
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('登录失败时清除状态并抛出错误', async () => {
      mockLogin.mockRejectedValue(new Error('Invalid credentials'))
      const store = useAuthStore()

      await expect(store.login({ email: 'test@example.com', password: 'wrong' })).rejects.toThrow(
        'Invalid credentials'
      )

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('需要 2FA 时返回响应但不设置认证状态', async () => {
      const twoFAResponse = { require_2fa: true }
      mockLogin.mockResolvedValue(twoFAResponse)
      const store = useAuthStore()

      const result = await store.login({ email: 'test@example.com', password: '123456' })

      expect(result).toEqual(twoFAResponse)
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  // --- login2FA ---

  describe('login2FA', () => {
    it('2FA 验证成功后设置认证状态', async () => {
      mockLogin2FA.mockResolvedValue({ ...fakeUser })
      const store = useAuthStore()

      const user = await store.login2FA('654321')

      expect(store.user).toEqual(fakeUser)
      expect(user).toEqual(fakeUser)
      expect(mockLogin2FA).toHaveBeenCalledWith({ code: '654321' })
    })

    it('2FA 验证失败时清除状态并抛出错误', async () => {
      mockLogin2FA.mockRejectedValue(new Error('Invalid TOTP'))
      const store = useAuthStore()

      await expect(store.login2FA('000000')).rejects.toThrow('Invalid TOTP')
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  // --- logout ---

  describe('logout', () => {
    it('注销后清除所有状态和会话缓存', async () => {
      mockLogin.mockResolvedValue({ ...fakeUser })
      mockLogout.mockResolvedValue(undefined)
      const store = useAuthStore()

      // 先登录
      await store.login({ email: 'test@example.com', password: '123456' })
      expect(store.isAuthenticated).toBe(true)

      // 注销
      await store.logout()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(localStorage.getItem('new_api_user_id')).toBeNull()
      expect(localStorage.getItem('new_api_user')).toBeNull()
    })
  })

  // --- checkAuth ---

  describe('checkAuth', () => {
    it('从会话缓存恢复用户状态', () => {
      localStorage.setItem('new_api_user', JSON.stringify(fakeUser))
      localStorage.setItem('new_api_user_id', '1')

      // Mock refreshUser(getCurrentUser) 防止后台校验报错
      mockGetCurrentUser.mockResolvedValue({ data: fakeUser })

      const store = useAuthStore()
      store.checkAuth()

      expect(store.user).toEqual(fakeUser)
      expect(store.isAuthenticated).toBe(true)
    })

    it('无缓存时保持未认证状态', () => {
      const store = useAuthStore()
      store.checkAuth()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('缓存用户数据损坏时保持未认证（不崩溃）', () => {
      localStorage.setItem('new_api_user', 'invalid-json{{{')

      const store = useAuthStore()
      store.checkAuth()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  // --- isAdmin ---

  describe('isAdmin', () => {
    it('管理员用户（role>=10）返回 true', async () => {
      mockLogin.mockResolvedValue({ ...fakeAdminUser })
      const store = useAuthStore()

      await store.login({ email: 'admin@example.com', password: '123456' })

      expect(store.isAdmin).toBe(true)
    })

    it('普通用户返回 false', async () => {
      mockLogin.mockResolvedValue({ ...fakeUser })
      const store = useAuthStore()

      await store.login({ email: 'test@example.com', password: '123456' })

      expect(store.isAdmin).toBe(false)
    })

    it('未登录时返回 false', () => {
      const store = useAuthStore()
      expect(store.isAdmin).toBe(false)
    })
  })

  // --- refreshUser ---

  describe('refreshUser', () => {
    it('刷新用户数据并更新会话缓存', async () => {
      mockLogin.mockResolvedValue({ ...fakeUser })
      const store = useAuthStore()
      await store.login({ email: 'test@example.com', password: '123456' })

      const updatedUser = { ...fakeUser, username: 'updated-name' }
      mockGetCurrentUser.mockResolvedValue({ data: updatedUser })

      const result = await store.refreshUser()

      expect(result).toEqual(updatedUser)
      expect(store.user).toEqual(updatedUser)
      expect(JSON.parse(localStorage.getItem('new_api_user')!)).toEqual(updatedUser)
    })

    it('401 时清除认证状态并抛出', async () => {
      mockLogin.mockResolvedValue({ ...fakeUser })
      const store = useAuthStore()
      await store.login({ email: 'test@example.com', password: '123456' })

      mockGetCurrentUser.mockRejectedValue({ status: 401 })

      await expect(store.refreshUser()).rejects.toBeDefined()
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  // --- isSimpleMode ---

  describe('isSimpleMode', () => {
    it('refreshUser 返回 run_mode=simple 时为 true', async () => {
      mockLogin.mockResolvedValue({ ...fakeUser })
      const store = useAuthStore()
      await store.login({ email: 'test@example.com', password: '123456' })

      mockGetCurrentUser.mockResolvedValue({ data: { ...fakeUser, run_mode: 'simple' } })
      await store.refreshUser()

      expect(store.isSimpleMode).toBe(true)
    })

    it('默认为 standard 模式', () => {
      const store = useAuthStore()
      expect(store.isSimpleMode).toBe(false)
    })
  })
})
