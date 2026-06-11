// new-api chat path — authenticated by the session cookie + `New-Api-User` header
// (NOT an sk- key). The model list goes through the axios client (cookie and
// `New-Api-User` are injected by the request interceptor; the `{success,data}`
// envelope is unwrapped). The chat stream uses raw fetch so the SSE body can
// stream, so it must set `credentials:'include'` and the `New-Api-User` header by
// hand (mirroring api/client.ts).
import { apiClient, getStoredUserId, clearStoredAuth } from '@/api/client'
import type { ChatCompletionPayload, ModelOption } from '@/types/playground'
import {
  consumeSseStream,
  extractError,
  type ChatCompletionError,
  type StreamHandlers
} from '@/api/playground'

// Session-authenticated chat relay (UserAuth + Distribute). NOT the sk- /v1 path.
const CHAT_STREAM_URL = '/pg/chat/completions'

/**
 * List the models the logged-in user may chat with.
 * Uses the axios client: the response envelope is unwrapped to a `string[]`.
 */
export async function listModelsBFF(signal?: AbortSignal): Promise<ModelOption[]> {
  const { data } = await apiClient.get<string[]>('/user/models', { signal })
  const list = Array.isArray(data) ? data : []
  return list.map((m) => ({ value: m, label: m }))
}

export async function chatCompletionStreamBFF(
  payload: ChatCompletionPayload,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let res: Response
  try {
    res = await fetch(CHAT_STREAM_URL, {
      method: 'POST',
      // Send the session cookie (HttpOnly, browser-managed) on this cross-fetch.
      credentials: 'include',
      headers: {
        // The backend session auth requires the user id; without it (or with a
        // mismatch) UserAuth returns 401 even with a valid cookie.
        'New-Api-User': getStoredUserId() ?? '',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({ ...payload, stream: true }),
      signal
    })
  } catch (e: any) {
    handlers.onError({ status: 0, message: e?.message ?? 'network error' })
    return
  }

  // The backend reports logical failures as JSON — often HTTP 200 `{success:false}`
  // (e.g. a banned user, caught by UserAuth before the relay) — never as an SSE
  // stream. Surface those as errors instead of letting the SSE loop see zero
  // frames and report a silent success.
  const contentType = res.headers.get('content-type') || ''
  if (!res.ok || !contentType.includes('text/event-stream')) {
    if (res.status === 401) {
      clearStoredAuth()
      try {
        sessionStorage.setItem('auth_expired', '1')
      } catch {
        // ignore sessionStorage failures
      }
    }
    handlers.onError(await extractError(res))
    return
  }

  await consumeSseStream(res, handlers)
}

export type { ChatCompletionError }
