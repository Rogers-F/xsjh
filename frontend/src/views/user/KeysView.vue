<template>
  <AppLayout>
    <TablePageLayout>
      <template #filters>
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <SearchInput
              v-model="filterSearch"
              :placeholder="t('keys.searchPlaceholder')"
              class="w-full sm:w-64"
              @search="onFilterChange"
            />
            <Select
              :model-value="filterGroup"
              class="w-40"
              :options="groupFilterOptions"
              @update:model-value="onGroupFilterChange"
            />
            <Select
              :model-value="filterStatus"
              class="w-40"
              :options="statusFilterOptions"
              @update:model-value="onStatusFilterChange"
            />
          </div>
          <EndpointPopover
            v-if="publicSettings?.api_base_url || (publicSettings?.custom_endpoints?.length ?? 0) > 0"
            :api-base-url="publicSettings?.api_base_url || ''"
            :custom-endpoints="publicSettings?.custom_endpoints || []"
          />
        </div>
      </template>

      <template #actions>
        <div class="flex justify-end gap-3">
        <button
          @click="loadApiKeys"
          :disabled="loading"
          class="btn btn-secondary"
          :title="t('common.refresh')"
        >
          <Icon name="refresh" size="md" :class="loading ? 'animate-spin' : ''" />
        </button>
        <button @click="showCreateModal = true" class="btn btn-primary" data-tour="keys-create-btn">
          <Icon name="plus" size="md" class="mr-2" />
          {{ t('keys.createKey') }}
        </button>
      </div>
      </template>

      <template #table>
        <DataTable :columns="columns" :data="displayedKeys" :loading="loading">
          <template #cell-key="{ value, row }">
            <div class="flex items-center gap-2">
              <!-- The list only carries server-masked keys; the plaintext is fetched on demand. -->
              <code class="code text-xs">
                {{ value }}
              </code>
              <button
                @click="copyKey(row)"
                class="rounded-lg p-1 transition-colors hover-tint"
                :class="
                  copiedKeyId === row.id
                    ? 'text-mint-500'
                    : 'text-dust-400 hover:text-dust-700 dark:hover:text-pearl-100'
                "
                :title="copiedKeyId === row.id ? t('keys.copied') : t('keys.copyToClipboard')"
              >
                <Icon
                  v-if="copiedKeyId === row.id"
                  name="check"
                  size="sm"
                  :stroke-width="2"
                />
                <Icon v-else name="clipboard" size="sm" />
              </button>
            </div>
          </template>

          <template #cell-name="{ value }">
            <div class="flex items-center gap-1.5">
              <span class="font-medium text-primary-fg">{{ value }}</span>
            </div>
          </template>

          <template #cell-group="{ row }">
            <div class="group/dropdown relative">
              <button
                :ref="(el) => setGroupButtonRef(row.id, el)"
                @click="openGroupSelector(row)"
                class="-mx-2 -my-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-all duration-200 hover-tint"
                :title="t('keys.clickToChangeGroup')"
              >
                <GroupBadge
                  v-if="row.group_name"
                  :name="row.group_name"
                  :rate-multiplier="groupRatioByName[row.group_name]"
                />
                <span v-else class="text-sm text-dust-400 dark:text-pearl-400">{{
                  t('keys.noGroup')
                }}</span>
                <span class="text-xs text-secondary-fg">{{ t('keys.selectGroup') }}</span>
                <svg
                  class="h-3.5 w-3.5 text-dust-400 opacity-60 transition-opacity group-hover/dropdown:opacity-100"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
                  />
                </svg>
              </button>
            </div>
          </template>

          <template #cell-usage="{ row }">
            <div class="text-sm">
              <!-- Total used amount (USD) straight from the key record. -->
              <div class="flex items-center gap-1.5">
                <span class="text-secondary-fg">{{ t('keys.quotaUsed') }}:</span>
                <span class="font-medium text-primary-fg">
                  ${{ (row.quota_used ?? 0).toFixed(4) }}
                </span>
              </div>
              <!-- Quota progress (if quota is set) -->
              <div v-if="row.quota > 0" class="mt-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-secondary-fg">{{ t('keys.quota') }}:</span>
                  <span :class="[
                    'font-medium',
                    row.quota_used >= row.quota ? 'text-coral-600 dark:text-coral-500' :
                    row.quota_used >= row.quota * 0.8 ? 'text-yellow-500' :
                    'text-primary-fg'
                  ]">
                    ${{ row.quota_used?.toFixed(2) || '0.00' }} / ${{ row.quota?.toFixed(2) }}
                  </span>
                </div>
                <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-200 dark:bg-ink-700">
                  <div
                    :class="[
                      'h-full rounded-full transition-all',
                      row.quota_used >= row.quota ? 'bg-coral-500' :
                      row.quota_used >= row.quota * 0.8 ? 'bg-yellow-500' :
                      'bg-gold-500 dark:bg-gold-300'
                    ]"
                    :style="{ width: Math.min((row.quota_used / row.quota) * 100, 100) + '%' }"
                  />
                </div>
              </div>
            </div>
          </template>

          <template #cell-expires_at="{ value }">
            <span v-if="value" :class="[
              'text-sm',
              new Date(value) < new Date() ? 'text-coral-600 dark:text-coral-500' : 'text-secondary-fg'
            ]">
              {{ formatDateTime(value) }}
            </span>
            <span v-else class="text-sm text-dust-400 dark:text-pearl-400">{{ t('keys.noExpiration') }}</span>
          </template>

          <template #cell-status="{ value }">
            <span :class="[
              'badge',
              value === 'active' ? 'badge-success' :
              value === 'quota_exhausted' ? 'badge-warning' :
              value === 'expired' ? 'badge-danger' :
              'badge-gray'
            ]">
              {{ t('keys.status.' + value) }}
            </span>
          </template>

          <template #cell-last_used_at="{ value }">
            <span v-if="value" class="text-sm text-secondary-fg">
              {{ formatDateTime(value) }}
            </span>
            <span v-else class="text-sm text-dust-400 dark:text-pearl-400">-</span>
          </template>

          <template #cell-created_at="{ value }">
            <span class="text-sm text-secondary-fg">{{ formatDateTime(value) }}</span>
          </template>

          <template #cell-actions="{ row }">
            <div class="flex items-center gap-1">
              <!-- Use Key Button -->
              <button
                @click="openUseKeyModal(row)"
                class="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-dust-500 transition-colors hover:bg-mint-500/10 hover:text-mint-600 dark:hover:bg-mint-500/10 dark:hover:text-mint-500"
              >
                <Icon name="terminal" size="sm" />
                <span class="text-xs">{{ t('keys.useKey') }}</span>
              </button>
              <!-- Import to CC Switch Button -->
              <button
                v-if="!publicSettings?.hide_ccs_import_button"
                @click="importToCcswitch(row)"
                class="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-dust-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
              >
                <Icon name="upload" size="sm" />
                <span class="text-xs">{{ t('keys.importToCcSwitch') }}</span>
              </button>
              <!-- Toggle Status Button -->
              <button
                @click="toggleKeyStatus(row)"
                :class="[
                  'flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-colors',
                  row.status === 'active'
                    ? 'text-dust-500 hover:bg-yellow-50 hover:text-yellow-600 dark:hover:bg-yellow-900/20 dark:hover:text-yellow-400'
                    : 'text-dust-500 hover:bg-mint-500/10 hover:text-mint-600 dark:hover:bg-mint-500/10 dark:hover:text-mint-500'
                ]"
              >
                <Icon v-if="row.status === 'active'" name="ban" size="sm" />
                <Icon v-else name="checkCircle" size="sm" />
                <span class="text-xs">{{ row.status === 'active' ? t('keys.disable') : t('keys.enable') }}</span>
              </button>
              <!-- Edit Button -->
              <button
                @click="editKey(row)"
                class="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-dust-500 transition-colors hover:bg-paper-100 hover:text-gold-600 dark:hover:bg-white/[0.04] dark:hover:text-gold-300"
              >
                <Icon name="edit" size="sm" />
                <span class="text-xs">{{ t('common.edit') }}</span>
              </button>
              <!-- Delete Button -->
              <button
                @click="confirmDelete(row)"
                class="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-dust-500 transition-colors hover:bg-coral-500/10 hover:text-coral-600 dark:hover:bg-coral-500/10 dark:hover:text-coral-500"
              >
                <Icon name="trash" size="sm" />
                <span class="text-xs">{{ t('common.delete') }}</span>
              </button>
            </div>
          </template>

          <template #empty>
            <EmptyState
              :title="t('keys.noKeysYet')"
              :description="t('keys.createFirstKey')"
              :action-text="t('keys.createKey')"
              @action="showCreateModal = true"
            />
          </template>
        </DataTable>
      </template>

      <template #pagination>
        <Pagination
          v-if="pagination.total > 0"
          :page="pagination.page"
          :total="pagination.total"
          :page-size="pagination.page_size"
          @update:page="handlePageChange"
          @update:pageSize="handlePageSizeChange"
        />
      </template>
    </TablePageLayout>

    <!-- Create/Edit Modal -->
    <BaseDialog
      :show="showCreateModal || showEditModal"
      :title="showEditModal ? t('keys.editKey') : t('keys.createKey')"
      width="normal"
      @close="closeModals"
    >
      <form id="key-form" @submit.prevent="handleSubmit" class="space-y-5">
        <div>
          <label class="input-label">{{ t('keys.nameLabel') }}</label>
          <input
            v-model="formData.name"
            type="text"
            required
            maxlength="50"
            class="input"
            :placeholder="t('keys.namePlaceholder')"
            data-tour="key-form-name"
          />
          <p class="input-hint">{{ t('keys.nameMaxLengthHint') }}</p>
        </div>

        <div>
          <label class="input-label">{{ t('keys.groupLabel') }}</label>
          <Select
            v-model="formData.group"
            :options="groupOptions"
            :placeholder="t('keys.selectGroup')"
            :searchable="true"
            :search-placeholder="t('keys.searchGroup')"
            data-tour="key-form-group"
          />
        </div>

        <!-- Quota Limit Section (off = unlimited) -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="input-label mb-0">{{ t('keys.quotaLimit') }}</label>
            <button
              type="button"
              @click="formData.enable_quota = !formData.enable_quota"
              :class="[
                'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                formData.enable_quota ? 'bg-gold-600 dark:bg-gold-400' : 'bg-paper-200 dark:bg-ink-700'
              ]"
            >
              <span
                :class="[
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  formData.enable_quota ? 'translate-x-4' : 'translate-x-0'
                ]"
              />
            </button>
          </div>

          <div v-if="formData.enable_quota" class="space-y-4">
            <div>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-dust-500">$</span>
                <input
                  v-model.number="formData.quota"
                  type="number"
                  step="0.01"
                  min="0"
                  class="input pl-7"
                  :placeholder="t('keys.quotaAmountPlaceholder')"
                />
              </div>
              <p class="input-hint">{{ t('keys.quotaAmountHint') }}</p>
            </div>

            <!-- Quota used display (only in edit mode) -->
            <div v-if="showEditModal && selectedKey && selectedKey.quota > 0">
              <label class="input-label">{{ t('keys.quotaUsed') }}</label>
              <div class="rounded-lg bg-paper-100 px-3 py-2 dark:bg-ink-700">
                <span class="font-medium text-primary-fg">
                  ${{ selectedKey.quota_used?.toFixed(4) || '0.0000' }}
                </span>
                <span class="mx-2 text-dust-400">/</span>
                <span class="text-secondary-fg">
                  ${{ selectedKey.quota?.toFixed(2) || '0.00' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Expiration Section -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="input-label mb-0">{{ t('keys.expiration') }}</label>
            <button
              type="button"
              @click="formData.enable_expiration = !formData.enable_expiration"
              :class="[
                'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                formData.enable_expiration ? 'bg-gold-600 dark:bg-gold-400' : 'bg-paper-200 dark:bg-ink-700'
              ]"
            >
              <span
                :class="[
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  formData.enable_expiration ? 'translate-x-4' : 'translate-x-0'
                ]"
              />
            </button>
          </div>

          <div v-if="formData.enable_expiration" class="space-y-4 pt-2">
            <!-- Quick select buttons (for both create and edit mode) -->
            <div class="flex flex-wrap gap-2">
              <button
                v-for="days in ['7', '30', '90']"
                :key="days"
                type="button"
                @click="setExpirationDays(parseInt(days))"
                :class="[
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  formData.expiration_preset === days
                    ? 'bg-gold-500/15 dark:bg-gold-300/15 text-gold-600 dark:text-gold-300'
                    : 'bg-paper-100 text-dust-600 hover:bg-paper-200 dark:bg-ink-700 dark:text-pearl-300 dark:hover:bg-ink-700'
                ]"
              >
                {{ showEditModal ? t('keys.extendDays', { days }) : t('keys.expiresInDays', { days }) }}
              </button>
              <button
                type="button"
                @click="formData.expiration_preset = 'custom'"
                :class="[
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  formData.expiration_preset === 'custom'
                    ? 'bg-gold-500/15 dark:bg-gold-300/15 text-gold-600 dark:text-gold-300'
                    : 'bg-paper-100 text-dust-600 hover:bg-paper-200 dark:bg-ink-700 dark:text-pearl-300 dark:hover:bg-ink-700'
                ]"
              >
                {{ t('keys.customDate') }}
              </button>
            </div>

            <!-- Date picker (always show for precise adjustment) -->
            <div>
              <label class="input-label">{{ t('keys.expirationDate') }}</label>
              <input
                v-model="formData.expiration_date"
                type="datetime-local"
                class="input"
              />
              <p class="input-hint">{{ t('keys.expirationDateHint') }}</p>
            </div>

            <!-- Current expiration display (only in edit mode) -->
            <div v-if="showEditModal && selectedKey?.expires_at" class="text-sm">
              <span class="text-secondary-fg">{{ t('keys.currentExpiration') }}: </span>
              <span class="font-medium text-primary-fg">
                {{ formatDateTime(selectedKey.expires_at) }}
              </span>
            </div>
          </div>
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-3">
          <button @click="closeModals" type="button" class="btn btn-secondary">
            {{ t('common.cancel') }}
          </button>
          <button
            form="key-form"
            type="submit"
            :disabled="submitting"
            class="btn btn-primary"
            data-tour="key-form-submit"
          >
            <svg
              v-if="submitting"
              class="-ml-1 mr-2 h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {{
              submitting
                ? t('keys.saving')
                : showEditModal
                  ? t('common.update')
                  : t('common.create')
            }}
          </button>
        </div>
      </template>
    </BaseDialog>

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      :show="showDeleteDialog"
      :title="t('keys.deleteKey')"
      :message="t('keys.deleteConfirmMessage', { name: selectedKey?.name })"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteDialog = false"
    />

    <!-- Use Key Modal (plaintext fetched on demand, held only for the dialog lifetime) -->
    <UseKeyModal
      :show="showUseKeyModal"
      :api-key="useKeyPlaintext"
      :base-url="publicSettings?.api_base_url || ''"
      :platform="KEY_PLATFORM"
      :allow-messages-dispatch="false"
      @close="closeUseKeyModal"
    />

    <!-- Group Selector Dropdown (Teleported to body to avoid overflow clipping) -->
    <Teleport to="body">
      <div
        v-if="groupSelectorKeyId !== null && dropdownPosition"
        ref="dropdownRef"
        class="animate-in fade-in slide-in-from-top-2 fixed z-[100000020] w-max min-w-[380px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 duration-200 dark:bg-ink-800 dark:ring-white/10"
        style="pointer-events: auto !important;"
        :style="{
          top: dropdownPosition.top !== undefined ? dropdownPosition.top + 'px' : undefined,
          bottom: dropdownPosition.bottom !== undefined ? dropdownPosition.bottom + 'px' : undefined,
          left: dropdownPosition.left + 'px'
        }"
      >
        <!-- Search box -->
        <div class="border-b hairline p-2">
          <div class="relative">
            <svg class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dust-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              v-model="groupSearchQuery"
              type="text"
              class="w-full rounded-lg border hairline-strong bg-paper-50 py-1.5 pl-8 pr-3 text-sm text-dust-900 placeholder-dust-400 outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/50 dark:bg-ink-700 dark:text-pearl-50 dark:placeholder-pearl-400 dark:focus:border-gold-300/50 dark:focus:ring-gold-300/50"
              :placeholder="t('keys.searchGroup')"
              @click.stop
            />
          </div>
        </div>
        <!-- Group list (options are backend group names with their rate ratio) -->
        <div class="max-h-80 overflow-y-auto p-1.5">
          <button
            v-for="option in filteredGroupOptions"
            :key="option.name"
            @click="changeGroup(selectedKeyForGroup!, option.name)"
            :class="[
              'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
              'border-b hairline last:border-0',
              (selectedKeyForGroup?.group_name || '') === option.name
                ? 'bg-gold-500/10 dark:bg-gold-300/10'
                : 'hover-tint'
            ]"
            :title="option.desc || undefined"
          >
            <div class="flex min-w-0 flex-1 flex-col items-start">
              <span class="font-semibold text-primary-fg">{{ option.name }}</span>
              <span
                v-if="option.desc"
                class="mt-1 w-full text-left text-xs leading-relaxed text-secondary-fg line-clamp-2"
              >
                {{ option.desc }}
              </span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class="inline-flex items-center whitespace-nowrap rounded-full bg-black/10 px-3 py-1 text-xs font-semibold dark:bg-white/10">
                ×{{ option.ratio }}
              </span>
              <svg
                v-if="(selectedKeyForGroup?.group_name || '') === option.name"
                class="h-4 w-4 shrink-0 text-gold-600 dark:text-gold-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </button>
          <!-- Empty state when search has no results -->
          <div v-if="filteredGroupOptions.length === 0" class="py-4 text-center text-sm text-dust-400 dark:text-pearl-400">
            {{ t('keys.noGroupFound') }}
          </div>
        </div>
      </div>
    </Teleport>
  </AppLayout>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, onUnmounted, type ComponentPublicInstance } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { useAppStore } from '@/stores/app'
	import { useOnboardingStore } from '@/stores/onboarding'
	import { useClipboard } from '@/composables/useClipboard'
import { getPersistedPageSize } from '@/composables/usePersistedPageSize'

const { t } = useI18n()
import { keysAPI, authAPI, userGroupsAPI } from '@/api'
import AppLayout from '@/components/layout/AppLayout.vue'
import TablePageLayout from '@/components/layout/TablePageLayout.vue'
	import DataTable from '@/components/common/DataTable.vue'
	import Pagination from '@/components/common/Pagination.vue'
	import BaseDialog from '@/components/common/BaseDialog.vue'
	import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
	import EmptyState from '@/components/common/EmptyState.vue'
	import Select from '@/components/common/Select.vue'
	import SearchInput from '@/components/common/SearchInput.vue'
	import Icon from '@/components/icons/Icon.vue'
	import UseKeyModal from '@/components/keys/UseKeyModal.vue'
	import EndpointPopover from '@/components/keys/EndpointPopover.vue'
	import GroupBadge from '@/components/common/GroupBadge.vue'
	import type { ApiKey, PublicSettings, GroupPlatform } from '@/types'
import type { Column } from '@/components/common/types'
import type { UserGroupOption } from '@/api/groups'
import { formatDateTime } from '@/utils/format'

// The backend has no per-group platform field — every key targets the single
// upstream platform. Explicit constant instead of a dead `.group?.platform`
// read whose fallback silently became the value.
const KEY_PLATFORM: GroupPlatform = 'anthropic'

// Helper to format date for datetime-local input
const formatDateTimeLocal = (isoDate: string): string => {
  const date = new Date(isoDate)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const appStore = useAppStore()
const onboardingStore = useOnboardingStore()
const { copyToClipboard: clipboardCopy } = useClipboard()

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('common.name'), sortable: true },
  { key: 'key', label: t('keys.apiKey'), sortable: false },
  { key: 'group', label: t('keys.group'), sortable: false },
  { key: 'usage', label: t('keys.usage'), sortable: false },
  { key: 'expires_at', label: t('keys.expiresAt'), sortable: true },
  { key: 'status', label: t('common.status'), sortable: true },
  { key: 'last_used_at', label: t('keys.lastUsedAt'), sortable: true },
  { key: 'created_at', label: t('keys.created'), sortable: true },
  { key: 'actions', label: t('common.actions'), sortable: false }
])

const apiKeys = ref<ApiKey[]>([])
const groups = ref<UserGroupOption[]>([])
const loading = ref(false)
const submitting = ref(false)

const pagination = ref({
  page: 1,
  page_size: getPersistedPageSize(),
  total: 0,
  pages: 0
})

// Filter state: search is server-side; status/group filter the current page client-side
const filterSearch = ref('')
const filterStatus = ref('')
const filterGroup = ref('')

const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteDialog = ref(false)
const showUseKeyModal = ref(false)
const selectedKey = ref<ApiKey | null>(null)
// Plaintext for the Use Key modal; cleared as soon as the dialog closes.
const useKeyPlaintext = ref('')
const copiedKeyId = ref<number | null>(null)
const groupSelectorKeyId = ref<number | null>(null)
const publicSettings = ref<PublicSettings | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const dropdownPosition = ref<{ top?: number; bottom?: number; left: number } | null>(null)
const groupButtonRefs = ref<Map<number, HTMLElement>>(new Map())
let abortController: AbortController | null = null

// Get the currently selected key for group change
const selectedKeyForGroup = computed(() => {
  if (groupSelectorKeyId.value === null) return null
  return apiKeys.value.find((k) => k.id === groupSelectorKeyId.value) || null
})

const setGroupButtonRef = (keyId: number, el: Element | ComponentPublicInstance | null) => {
  if (el instanceof HTMLElement) {
    groupButtonRefs.value.set(keyId, el)
  } else {
    groupButtonRefs.value.delete(keyId)
  }
}

const formData = ref({
  name: '',
  // Backend group name ('' = user default group)
  group: '',
  // Quota settings (toggle off = unlimited)
  enable_quota: false,
  quota: null as number | null,
  enable_expiration: false,
  expiration_preset: '30' as '7' | '30' | '90' | 'custom',
  expiration_date: ''
})

// Filter dropdown options
const groupFilterOptions = computed(() => [
  { value: '', label: t('keys.allGroups') },
  ...groups.value.map((g) => ({ value: g.name, label: g.name }))
])

const statusFilterOptions = computed(() => [
  { value: '', label: t('keys.allStatus') },
  { value: 'active', label: t('keys.status.active') },
  { value: 'inactive', label: t('keys.status.inactive') },
  { value: 'quota_exhausted', label: t('keys.status.quota_exhausted') },
  { value: 'expired', label: t('keys.status.expired') }
])

// Search hits the server, so reload; status/group only filter the loaded page
const onFilterChange = () => {
  pagination.value.page = 1
  loadApiKeys()
}

const onGroupFilterChange = (value: string | number | boolean | null) => {
  filterGroup.value = (value as string) || ''
}

const onStatusFilterChange = (value: string | number | boolean | null) => {
  filterStatus.value = (value as string) || ''
}

// Client-side status/group filtering over the current page
const displayedKeys = computed(() =>
  apiKeys.value.filter(
    (k) =>
      (!filterStatus.value || k.status === filterStatus.value) &&
      (!filterGroup.value || k.group_name === filterGroup.value)
  )
)

// Group select options for the create/edit form: "name ×ratio"
const groupOptions = computed(() =>
  groups.value.map((g) => ({
    value: g.name,
    label: `${g.name} ×${g.ratio}`
  }))
)

// Lookup of group rate ratios for the table badge
const groupRatioByName = computed(() => {
  const map: Record<string, number> = {}
  for (const g of groups.value) map[g.name] = g.ratio
  return map
})

// Group dropdown search
const groupSearchQuery = ref('')
const filteredGroupOptions = computed(() => {
  const query = groupSearchQuery.value.trim().toLowerCase()
  if (!query) return groups.value
  return groups.value.filter(
    (g) => g.name.toLowerCase().includes(query) || g.desc.toLowerCase().includes(query)
  )
})

// Fetch the plaintext of one key on explicit user action. Single fetch per
// call — the endpoint is rate-limited server-side; never loop/batch it and
// never cache the result.
const fetchPlaintextKey = async (id: number): Promise<string | null> => {
  try {
    return await keysAPI.getKey(id)
  } catch (error) {
    appStore.showError(t('keys.failedToFetchKey'))
    return null
  }
}

const copyKey = async (row: ApiKey) => {
  const plaintext = await fetchPlaintextKey(row.id)
  if (!plaintext) return
  const success = await clipboardCopy(plaintext, t('keys.copied'))
  if (success) {
    copiedKeyId.value = row.id
    setTimeout(() => {
      copiedKeyId.value = null
    }, 800)
  }
}

const isAbortError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || code === 'ERR_CANCELED'
}

const loadApiKeys = async () => {
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller
  const { signal } = controller
  loading.value = true
  try {
    // Only keyword search is server-side; status/group filters apply client-side
    const filters = filterSearch.value ? { search: filterSearch.value } : undefined

    const response = await keysAPI.list(pagination.value.page, pagination.value.page_size, filters, {
      signal
    })
    if (signal.aborted) return
    apiKeys.value = response.items
    pagination.value.total = response.total
    pagination.value.pages = response.pages
  } catch (error) {
    if (isAbortError(error)) {
      return
    }
    appStore.showError(t('keys.failedToLoad'))
  } finally {
    if (abortController === controller) {
      loading.value = false
    }
  }
}

const loadGroups = async () => {
  try {
    groups.value = await userGroupsAPI.getAvailable()
  } catch (error) {
    console.error('Failed to load groups:', error)
  }
}

const loadPublicSettings = async () => {
  try {
    publicSettings.value = await authAPI.getPublicSettings()
  } catch (error) {
    console.error('Failed to load public settings:', error)
  }
}

// Fetch the plaintext once on user action, then open the modal with it.
const openUseKeyModal = async (key: ApiKey) => {
  const plaintext = await fetchPlaintextKey(key.id)
  if (!plaintext) return
  selectedKey.value = key
  useKeyPlaintext.value = plaintext
  showUseKeyModal.value = true
}

const closeUseKeyModal = () => {
  showUseKeyModal.value = false
  // Drop the plaintext as soon as the dialog closes
  useKeyPlaintext.value = ''
  selectedKey.value = null
}

const handlePageChange = (page: number) => {
  pagination.value.page = page
  loadApiKeys()
}

const handlePageSizeChange = (pageSize: number) => {
  pagination.value.page_size = pageSize
  pagination.value.page = 1
  loadApiKeys()
}

const editKey = (key: ApiKey) => {
  selectedKey.value = key
  formData.value = {
    name: key.name,
    group: key.group_name || '',
    enable_quota: key.quota > 0,
    quota: key.quota > 0 ? key.quota : null,
    enable_expiration: !!key.expires_at,
    expiration_preset: 'custom',
    expiration_date: key.expires_at ? formatDateTimeLocal(key.expires_at) : ''
  }
  showEditModal.value = true
}

const toggleKeyStatus = async (key: ApiKey) => {
  const newStatus = key.status === 'active' ? 'inactive' : 'active'
  try {
    await keysAPI.toggleStatus(key.id, newStatus)
    appStore.showSuccess(
      newStatus === 'active' ? t('keys.keyEnabledSuccess') : t('keys.keyDisabledSuccess')
    )
    loadApiKeys()
  } catch (error) {
    appStore.showError(t('keys.failedToUpdateStatus'))
  }
}

const openGroupSelector = (key: ApiKey) => {
  if (groupSelectorKeyId.value === key.id) {
    groupSelectorKeyId.value = null
    dropdownPosition.value = null
  } else {
    const buttonEl = groupButtonRefs.value.get(key.id)
    if (buttonEl) {
      const rect = buttonEl.getBoundingClientRect()
      const dropdownEstHeight = 400 // estimated max dropdown height
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top

      if (spaceBelow < dropdownEstHeight && spaceAbove > spaceBelow) {
        // Not enough space below, pop upward
        dropdownPosition.value = {
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left
        }
      } else {
        // Default: pop downward
        dropdownPosition.value = {
          top: rect.bottom + 4,
          left: rect.left
        }
      }
    }
    groupSelectorKeyId.value = key.id
    groupSearchQuery.value = ''
  }
}

const changeGroup = async (key: ApiKey, newGroup: string) => {
  groupSelectorKeyId.value = null
  dropdownPosition.value = null
  if ((key.group_name || '') === newGroup) return

  try {
    await keysAPI.update(key.id, { group: newGroup })
    appStore.showSuccess(t('keys.groupChangedSuccess'))
    loadApiKeys()
  } catch (error) {
    appStore.showError(t('keys.failedToChangeGroup'))
  }
}

const closeGroupSelector = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  // Check if click is inside the dropdown or the trigger button
  if (!target.closest('.group\\/dropdown') && !dropdownRef.value?.contains(target)) {
    groupSelectorKeyId.value = null
    dropdownPosition.value = null
  }
}

const confirmDelete = (key: ApiKey) => {
  selectedKey.value = key
  showDeleteDialog.value = true
}

const handleSubmit = async () => {
  const name = formData.value.name.trim()
  if (!name) return

  // Quota limit in USD (toggle off / empty / 0 = unlimited, sent as 0)
  const quotaUSD =
    formData.value.enable_quota && formData.value.quota && formData.value.quota > 0
      ? formData.value.quota
      : 0

  // Expiration as days from now (0 = never expires)
  let expiresInDays = 0
  if (formData.value.enable_expiration && formData.value.expiration_date) {
    const diff = new Date(formData.value.expiration_date).getTime() - Date.now()
    expiresInDays = Math.max(1, Math.ceil(diff / 86400000))
  }

  submitting.value = true
  try {
    if (showEditModal.value && selectedKey.value) {
      await keysAPI.update(selectedKey.value.id, {
        name,
        quotaUSD,
        expiresInDays,
        group: formData.value.group
      })
      appStore.showSuccess(t('keys.keyUpdatedSuccess'))
    } else {
      // create() returns no object by design — the list reload below picks up the new row
      await keysAPI.create({
        name,
        quotaUSD,
        expiresInDays,
        group: formData.value.group
      })
      appStore.showSuccess(t('keys.keyCreatedSuccess'))
      // Only advance tour if active, on submit step, and creation succeeded
      if (onboardingStore.isCurrentStep('[data-tour="key-form-submit"]')) {
        onboardingStore.nextStep(500)
      }
    }
    closeModals()
    loadApiKeys()
  } catch (error: any) {
    const errorMsg = error.response?.data?.detail || t('keys.failedToSave')
    appStore.showError(errorMsg)
    // Don't advance tour on error
  } finally {
    submitting.value = false
  }
}

/**
 * 处理删除 API Key 的操作
 * 优化：错误处理改进，优先显示后端返回的具体错误消息（如权限不足等），
 * 若后端未返回消息则显示默认的国际化文本
 */
const handleDelete = async () => {
  if (!selectedKey.value) return

  try {
    await keysAPI.delete(selectedKey.value.id)
    appStore.showSuccess(t('keys.keyDeletedSuccess'))
    showDeleteDialog.value = false
    loadApiKeys()
  } catch (error: any) {
    // 优先使用后端返回的错误消息，提供更具体的错误信息给用户
    const errorMsg = error?.message || t('keys.failedToDelete')
    appStore.showError(errorMsg)
  }
}

const closeModals = () => {
  showCreateModal.value = false
  showEditModal.value = false
  selectedKey.value = null
  formData.value = {
    name: '',
    group: '',
    enable_quota: false,
    quota: null,
    enable_expiration: false,
    expiration_preset: '30',
    expiration_date: ''
  }
}

// Set expiration date based on quick select days
const setExpirationDays = (days: number) => {
  formData.value.expiration_preset = days.toString() as '7' | '30' | '90'
  const expDate = new Date()
  expDate.setDate(expDate.getDate() + days)
  formData.value.expiration_date = formatDateTimeLocal(expDate.toISOString())
}

const importToCcswitch = (row: ApiKey) => {
  // Single-platform backend: no client-selection dialog, import directly.
  executeCcsImport(row)
}

const executeCcsImport = async (row: ApiKey) => {
  // Fetch the plaintext once per import action; it is never cached locally.
  const plaintextKey = await fetchPlaintextKey(row.id)
  if (!plaintextKey) return

  const baseUrl = publicSettings.value?.api_base_url || window.location.origin
  // Single-platform backend (see KEY_PLATFORM): one app/endpoint pairing.
  const app = 'claude'
  const endpoint = baseUrl

  const usageScript = `({
    request: {
      url: "{{baseUrl}}/v1/usage",
      method: "GET",
      headers: { "Authorization": "Bearer {{apiKey}}" }
    },
    extractor: function(response) {
      const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance;
      const unit = response?.unit ?? response?.quota?.unit ?? "USD";
      return {
        isValid: response?.is_active ?? response?.isValid ?? true,
        remaining,
        unit
      };
    }
  })`
  const providerName = (publicSettings.value?.site_name || 'sub2api').trim() || 'sub2api'

  const params = new URLSearchParams({
    resource: 'provider',
    app: app,
    name: providerName,
    homepage: baseUrl,
    endpoint: endpoint,
    apiKey: plaintextKey,
    configFormat: 'json',
    usageEnabled: 'true',
    usageScript: btoa(usageScript),
    usageAutoInterval: '30'
  })
  const deeplink = `ccswitch://v1/import?${params.toString()}`

  try {
    window.open(deeplink, '_self')

    // Check if the protocol handler worked by detecting if we're still focused
    setTimeout(() => {
      if (document.hasFocus()) {
        // Still focused means the protocol handler likely failed
        appStore.showError(t('keys.ccSwitchNotInstalled'))
      }
    }, 100)
  } catch (error) {
    appStore.showError(t('keys.ccSwitchNotInstalled'))
  }
}


onMounted(() => {
  loadApiKeys()
  loadGroups()
  loadPublicSettings()
  document.addEventListener('click', closeGroupSelector)
})

onUnmounted(() => {
  document.removeEventListener('click', closeGroupSelector)
})
</script>
