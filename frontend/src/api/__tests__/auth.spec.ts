import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPublicSettings, login, register, PUBLIC_SETTINGS_FALLBACK } from '@/api/auth'
import { apiClient } from '@/api/client'

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPublicSettings', () => {
  beforeEach(() => {
    // 失败路径会 console.warn；静音以保持测试输出干净
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('服务端数据覆盖 fallback，缺失字段由 fallback 补齐', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { site_name: '星算', turnstile_enabled: true, chat_provider_mode: 'sub2api' },
    } as any)

    const settings = await getPublicSettings()

    expect(apiClient.get).toHaveBeenCalledWith('/public-settings')
    expect(settings.site_name).toBe('星算')
    expect(settings.turnstile_enabled).toBe(true)
    expect(settings.chat_provider_mode).toBe('sub2api')
    // 缺失字段回填 fallback 值
    expect(settings.registration_enabled).toBe(PUBLIC_SETTINGS_FALLBACK.registration_enabled)
    expect(settings.payg_exchange_rate).toBe(PUBLIC_SETTINGS_FALLBACK.payg_exchange_rate)
    expect(settings.custom_endpoints).toEqual([])
    expect(settings.newapi_console_url).toBe('')
  })

  it('custom_menu_items 为 null 时修复为 []', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { custom_menu_items: null },
    } as any)

    const settings = await getPublicSettings()

    expect(settings.custom_menu_items).toEqual([])
  })

  it('非法 chat_provider_mode 修复为 newapi_bff', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { chat_provider_mode: 'bogus' },
    } as any)

    const settings = await getPublicSettings()

    expect(settings.chat_provider_mode).toBe('newapi_bff')
  })

  it('请求失败时不抛错，返回完整 fallback（chat_provider_mode 保持 newapi_bff）', async () => {
    vi.mocked(apiClient.get).mockRejectedValue({ status: 404, message: 'not found' })

    const settings = await getPublicSettings()

    expect(settings).toEqual(PUBLIC_SETTINGS_FALLBACK)
    expect(settings.chat_provider_mode).toBe('newapi_bff')
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('并发调用只发一次请求，且各自拿到独立副本', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { site_name: 'X' } } as any)

    const [a, b] = await Promise.all([getPublicSettings(), getPublicSettings()])

    expect(apiClient.get).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})

describe('login', () => {
  it('携带 turnstile_token 时通过 ?turnstile= 查询参数转发', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 1 } } as any)

    await login({ email: 'a@b.c', password: 'pw', turnstile_token: 'tok-1' })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/user/login',
      { username: 'a@b.c', password: 'pw' },
      { params: { turnstile: 'tok-1' } }
    )
  })

  it('无 turnstile_token 时参数值为 undefined（axios 序列化时丢弃）', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 1 } } as any)

    await login({ email: 'a@b.c', password: 'pw' })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/user/login',
      { username: 'a@b.c', password: 'pw' },
      { params: { turnstile: undefined } }
    )
  })
})

describe('register', () => {
  it('携带 turnstile_token 时通过 ?turnstile= 查询参数转发', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined } as any)

    await register({
      email: 'a@b.c',
      password: 'pw',
      verify_code: '123456',
      turnstile_token: 'tok-2',
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/user/register',
      {
        username: 'a@b.c',
        password: 'pw',
        email: 'a@b.c',
        verification_code: '123456',
        aff_code: undefined,
      },
      { params: { turnstile: 'tok-2' } }
    )
  })

  it('无 turnstile_token 时参数值为 undefined（axios 序列化时丢弃）', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined } as any)

    await register({ email: 'a@b.c', password: 'pw' })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/user/register',
      {
        username: 'a@b.c',
        password: 'pw',
        email: 'a@b.c',
        verification_code: undefined,
        aff_code: undefined,
      },
      { params: { turnstile: undefined } }
    )
  })
})
