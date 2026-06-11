import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatCompletionStreamBFF } from '@/api/newapi'
import { clearStoredAuth } from '@/api/client'

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn() },
  getStoredUserId: vi.fn(() => '42'),
  clearStoredAuth: vi.fn(),
}))

function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const chunks = lines.map((l) => encoder.encode(l))
  let i = 0
  return {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
    },
    body: {
      getReader: () => ({
        read: vi.fn().mockImplementation(async () =>
          i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }
        ),
      }),
    },
  } as unknown as Response
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
  } as unknown as Response
}

function makeHandlers() {
  return { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
}

describe('chatCompletionStreamBFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('正常 SSE 流：解析分片并完成，不报错', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      sseResponse(['data: {"choices":[{"delta":{"content":"hi"}}]}\n', 'data: [DONE]\n'])
    ) as any
    const h = makeHandlers()

    await chatCompletionStreamBFF({ model: 'gpt-4', messages: [] } as any, h)

    expect(h.onChunk).toHaveBeenCalled()
    expect(h.onDone).toHaveBeenCalledTimes(1)
    expect(h.onError).not.toHaveBeenCalled()
  })

  it('发送 cookie + New-Api-User，不发 Authorization', async () => {
    global.fetch = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n'])) as any
    const h = makeHandlers()

    await chatCompletionStreamBFF({ model: 'gpt-4', messages: [] } as any, h)

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('/pg/chat/completions')
    expect(init.credentials).toBe('include')
    expect(init.headers['New-Api-User']).toBe('42')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('HTTP 200 但 {success:false}（如封禁用户）→ onError，不静默完成', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { success: false, message: '用户已被封禁' })) as any
    const h = makeHandlers()

    await chatCompletionStreamBFF({ model: 'gpt-4', messages: [] } as any, h)

    expect(h.onError).toHaveBeenCalledTimes(1)
    expect(h.onError.mock.calls[0][0].message).toBe('用户已被封禁')
    expect(h.onDone).not.toHaveBeenCalled()
    expect(h.onChunk).not.toHaveBeenCalled()
  })

  it('401 → 清除会话缓存并 onError', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { success: false, message: '未登录' })) as any
    const h = makeHandlers()

    await chatCompletionStreamBFF({ model: 'gpt-4', messages: [] } as any, h)

    expect(clearStoredAuth).toHaveBeenCalledTimes(1)
    expect(h.onError).toHaveBeenCalledTimes(1)
    expect(h.onError.mock.calls[0][0].status).toBe(401)
  })

  it('网络异常 → onError(status 0)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as any
    const h = makeHandlers()

    await chatCompletionStreamBFF({ model: 'gpt-4', messages: [] } as any, h)

    expect(h.onError).toHaveBeenCalledTimes(1)
    expect(h.onError.mock.calls[0][0].status).toBe(0)
  })
})
