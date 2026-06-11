import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import type { AxiosInstance } from 'axios'

// 需要在导入 client 之前设置 mock
vi.mock('@/i18n', () => ({
  getLocale: () => 'zh-CN',
}))

const okEnvelope = { success: true, data: {}, message: '' }

describe('API Client', () => {
  let apiClient: AxiosInstance

  beforeEach(async () => {
    localStorage.clear()
    // 每次测试重新导入以获取干净的模块状态
    vi.resetModules()
    const mod = await import('@/api/client')
    apiClient = mod.apiClient
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- 请求拦截器 ---

  describe('请求拦截器', () => {
    it('有 stored user id 时附加 New-Api-User 头', async () => {
      localStorage.setItem('new_api_user_id', '42')

      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: okEnvelope,
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      await apiClient.get('/test')

      const config = adapter.mock.calls[0][0]
      expect(config.headers.get('New-Api-User')).toBe('42')
    })

    it('无 stored user id 时不附加 New-Api-User 头', async () => {
      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: okEnvelope,
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      await apiClient.get('/test')

      const config = adapter.mock.calls[0][0]
      expect(config.headers.get('New-Api-User')).toBeFalsy()
    })

    it('cookie-session 下不再附加 Authorization 头', async () => {
      localStorage.setItem('new_api_user_id', '42')

      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: okEnvelope,
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      await apiClient.get('/test')

      const config = adapter.mock.calls[0][0]
      expect(config.headers.get('Authorization')).toBeFalsy()
    })

    it('GET 请求自动附加 timezone 参数', async () => {
      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: okEnvelope,
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      await apiClient.get('/test')

      const config = adapter.mock.calls[0][0]
      expect(config.params).toHaveProperty('timezone')
    })

    it('POST 请求不附加 timezone 参数', async () => {
      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: okEnvelope,
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      await apiClient.post('/test', { foo: 'bar' })

      const config = adapter.mock.calls[0][0]
      expect(config.params?.timezone).toBeUndefined()
    })
  })

  // --- 响应拦截器（new-api {success,message,data} 信封）---

  describe('响应拦截器', () => {
    it('success:true 时解包 data 字段', async () => {
      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: { success: true, data: { name: 'test' }, message: '' },
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      const response = await apiClient.get('/test')
      expect(response.data).toEqual({ name: 'test' })
    })

    it('success:false（HTTP 200）时拒绝并返回 {status, message}', async () => {
      // new-api 把逻辑错误以 HTTP 200 + {success:false} 返回；必须在成功回调里拒绝。
      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: { success: false, message: '参数错误' },
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      await expect(apiClient.get('/test')).rejects.toEqual(
        expect.objectContaining({
          status: 200,
          message: '参数错误',
        })
      )
    })

    it('非信封响应原样透传（relay / SSE / 二进制）', async () => {
      const adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: 'raw-body',
        headers: {},
        config: {},
        statusText: 'OK',
      })
      apiClient.defaults.adapter = adapter

      const response = await apiClient.get('/test')
      expect(response.data).toBe('raw-body')
    })
  })

  // --- 401（无 token 刷新；清除会话缓存并跳转）---

  describe('401 处理', () => {
    it('401 清除 stored auth（不再尝试刷新）', async () => {
      localStorage.setItem('new_api_user_id', '42')
      localStorage.setItem('new_api_user', JSON.stringify({ id: 42 }))

      // Mock window.location
      const originalLocation = window.location
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, pathname: '/dashboard', href: '/dashboard' },
        writable: true,
      })

      const adapter = vi.fn().mockRejectedValue({
        response: {
          status: 401,
          data: { success: false, message: '未登录' },
        },
        config: {
          url: '/test',
          headers: {},
        },
        code: 'ERR_BAD_REQUEST',
      })
      apiClient.defaults.adapter = adapter

      await expect(apiClient.get('/test')).rejects.toBeDefined()

      expect(localStorage.getItem('new_api_user_id')).toBeNull()
      expect(localStorage.getItem('new_api_user')).toBeNull()

      // 恢复 location
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      })
    })
  })

  // --- 网络错误 ---

  describe('网络错误', () => {
    it('网络错误返回 status 0 的错误', async () => {
      const adapter = vi.fn().mockRejectedValue({
        code: 'ERR_NETWORK',
        message: 'Network Error',
        config: { url: '/test' },
        // 没有 response
      })
      apiClient.defaults.adapter = adapter

      await expect(apiClient.get('/test')).rejects.toEqual(
        expect.objectContaining({
          status: 0,
          message: 'Network error. Please check your connection.',
        })
      )
    })
  })

  // --- 请求取消 ---

  describe('请求取消', () => {
    it('取消的请求保持原始取消错误', async () => {
      const source = axios.CancelToken.source()

      const adapter = vi.fn().mockRejectedValue(
        new axios.Cancel('Operation canceled')
      )
      apiClient.defaults.adapter = adapter

      await expect(
        apiClient.get('/test', { cancelToken: source.token })
      ).rejects.toBeDefined()
    })
  })
})
