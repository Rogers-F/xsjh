import { useI18n } from 'vue-i18n'

import { userGroupsAPI } from '@/api/groups'
import { keysAPI } from '@/api/keys'
import { listModels } from '@/api/playground'
import { usePlaygroundStore } from '@/stores/playground'
import { useAppStore } from '@/stores/app'
import { PLAYGROUND_KEY_EXPIRY_DAYS } from '@/constants/playground'
import type { ApiKey } from '@/types'

export function usePlaygroundResources() {
  const store = usePlaygroundStore()
  const appStore = useAppStore()
  const { t } = useI18n()

  async function loadGroups() {
    try {
      store.groups = await userGroupsAPI.getAvailable()
    } catch {
      appStore.showError(t('playground.errors.loadGroupsFailed'))
    }
  }

  async function loadApiKeys() {
    try {
      const res = await keysAPI.list(1, 200)
      store.apiKeys = res.items ?? []
    } catch {
      appStore.showError(t('playground.errors.loadKeysFailed'))
    }
  }

  async function loadModelsForKey(apiKey: string) {
    if (!apiKey) {
      store.models = []
      return
    }
    try {
      store.models = await listModels(apiKey)
    } catch {
      store.models = []
      appStore.showError(t('playground.errors.loadModelsFailed'))
    }
  }

  // Groups have no numeric id on this backend — keys reference them by NAME.
  function findActiveKeyForGroup(groupName: string): ApiKey | null {
    const candidates = store.apiKeys.filter(
      (k) => k.group_name === groupName && k.status === 'active'
    )
    if (candidates.length === 0) return null
    // 优先选最近创建的；按 id 数值排序最稳（避免 created_at 字符串比较）
    candidates.sort((a, b) => b.id - a.id)
    return candidates[0]
  }

  async function createPlaygroundKey(groupName: string): Promise<ApiKey | null> {
    try {
      const name = `${t('playground.pickers.keyDefaultName')} ${new Date().toISOString().slice(0, 10)}`
      // The create endpoint returns no object — re-list and pick the newest match.
      await keysAPI.create({
        name,
        group: groupName,
        expiresInDays: PLAYGROUND_KEY_EXPIRY_DAYS
      })
      const res = await keysAPI.list(1, 200)
      store.apiKeys = res.items ?? []
      const created = store.apiKeys
        .filter((k) => k.name === name && k.group_name === groupName)
        .sort((a, b) => b.id - a.id)[0]
      if (!created) {
        appStore.showError(t('playground.pickers.keyCreateFailed'))
        return null
      }
      // List responses carry masked keys; fetch the plaintext so the new key is
      // immediately usable for model listing and requests.
      try {
        created.key = await keysAPI.getKey(created.id)
      } catch {
        // Keep the masked key; downstream calls will surface the failure.
      }
      appStore.showSuccess(t('playground.pickers.keyCreated'))
      return created
    } catch {
      appStore.showError(t('playground.pickers.keyCreateFailed'))
      return null
    }
  }

  async function loadAll() {
    store.resourcesLoading = true
    try {
      await Promise.all([loadGroups(), loadApiKeys()])
    } finally {
      store.resourcesLoading = false
    }
  }

  return {
    loadAll,
    loadGroups,
    loadApiKeys,
    loadModelsForKey,
    findActiveKeyForGroup,
    createPlaygroundKey
  }
}
