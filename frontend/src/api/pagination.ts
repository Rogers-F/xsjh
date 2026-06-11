/**
 * Shared adapter from the backend PageInfo envelope to the view-facing
 * PaginatedResponse — the single place that owns the items/pages fallbacks.
 */

import type { PaginatedResponse } from '@/types'
import type { NewApiPageInfo } from '@/types/newapi'

export function adaptPageInfo<T, U = T>(
  data: NewApiPageInfo<T>,
  map?: (item: T) => U
): PaginatedResponse<U> {
  const source = data.items ?? []
  const items = (map ? source.map(map) : source) as U[]
  const pageSize = data.page_size || items.length || 1
  return {
    items,
    total: data.total,
    page: data.page,
    page_size: data.page_size,
    pages: Math.max(1, Math.ceil(data.total / pageSize))
  }
}
