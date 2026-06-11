<template>
  <AppLayout>
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-primary-fg">
            {{ t('wallet.title') }}
          </h1>
          <p class="text-sm text-secondary-fg">
            {{ t('wallet.description') }}
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="refreshAll()">
          <Icon name="refresh" size="sm" class="mr-1.5" />
          {{ t('common.refresh') }}
        </button>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16">
        <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-gold-500 dark:border-gold-300"></div>
      </div>

      <template v-else>
        <!-- Balance cards (server values only) -->
        <div class="grid gap-4 md:grid-cols-2">
          <div class="card p-5">
            <div class="text-sm text-secondary-fg">{{ t('wallet.balance') }}</div>
            <div class="mt-2 text-3xl font-bold num-mono text-primary-fg">
              {{ formatQuotaUSD(user?.quota ?? 0) }}
            </div>
          </div>
          <div class="card p-5">
            <div class="text-sm text-secondary-fg">{{ t('wallet.totalConsumption') }}</div>
            <div class="mt-2 text-3xl font-bold num-mono text-primary-fg">
              {{ formatQuotaUSD(user?.used_quota ?? 0) }}
            </div>
          </div>
        </div>

        <!-- Online top-up (hidden entirely when the server disables it) -->
        <div v-if="onlineTopupEnabled" class="card">
          <div class="hairline border-b px-6 py-4">
            <h2 class="text-lg font-semibold text-primary-fg">
              {{ t('wallet.rechargeTitle') }}
            </h2>
          </div>
          <div class="space-y-6 p-6">
            <div>
              <div class="mb-3 text-sm font-medium text-dust-700 dark:text-pearl-100">
                {{ t('wallet.fixedAmounts') }}
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="amount in amountOptions"
                  :key="amount"
                  type="button"
                  :class="[
                    'rounded-xl border px-4 py-2 text-sm font-medium transition',
                    selectedAmount === amount
                      ? 'border-gold-500 dark:border-gold-300 bg-gold-500/10 dark:bg-gold-300/10 text-gold-600 dark:text-gold-300'
                      : 'border-paper-200 dark:border-ink-700 text-dust-700 dark:text-pearl-100 hover:border-gold-500/50 dark:hover:border-gold-300/50 hover:text-gold-600 dark:hover:text-gold-300'
                  ]"
                  @click="selectFixedAmount(amount)"
                >
                  ${{ amount }}
                </button>
              </div>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-dust-700 dark:text-pearl-100">
                {{ t('wallet.customAmount') }}
              </label>
              <input
                v-model="customAmount"
                type="number"
                :min="minTopup"
                step="1"
                class="input w-full"
                :placeholder="t('wallet.customAmountUsd')"
                @input="selectedAmount = null"
              />
              <p v-if="minTopup > 0" class="input-hint">
                {{ t('wallet.minTopupHint', { min: minTopup }) }}
              </p>
            </div>

            <div>
              <div class="mb-3 text-sm font-medium text-dust-700 dark:text-pearl-100">
                {{ t('wallet.paymentMethod') }}
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <button
                  v-for="method in payMethods"
                  :key="method.type"
                  type="button"
                  :class="selectedMethod === method.type ? activePaywayClass : inactivePaywayClass"
                  @click="selectedMethod = method.type"
                >
                  {{ method.name }}
                </button>
              </div>
            </div>

            <div class="rounded-xl hairline-strong border bg-paper-50 px-4 py-3 text-sm dark:bg-ink-800">
              <div class="flex items-center justify-between gap-3">
                <span class="text-secondary-fg">{{ t('wallet.selectedAmount') }}</span>
                <span class="font-semibold num-mono text-primary-fg">
                  {{ effectiveAmount > 0 ? `$${effectiveAmount}` : t('wallet.noAmountSelected') }}
                </span>
              </div>
              <div class="mt-2 flex items-center justify-between gap-3">
                <span class="text-secondary-fg">{{ t('wallet.payableAmount') }}</span>
                <span class="font-semibold num-mono text-mint-600 dark:text-mint-500">
                  <!-- Server-computed payable amount; never derived locally. -->
                  {{ previewLoading ? t('common.loading') : payablePreview || '—' }}
                </span>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="submitting || !amountValid || !selectedMethod"
                @click="submitTopup"
              >
                <svg
                  v-if="submitting"
                  class="mr-2 h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
                {{ submitting ? t('wallet.creatingOrder') : t('wallet.createOrder') }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-else
          class="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300"
        >
          <div class="flex items-start gap-3">
            <Icon name="exclamationTriangle" size="md" class="mt-0.5 text-amber-500" />
            <div>{{ t('wallet.onlineTopupDisabled') }}</div>
          </div>
        </div>

        <!-- Top-up records -->
        <div class="card">
          <div class="hairline border-b px-6 py-4">
            <h2 class="text-lg font-semibold text-primary-fg">
              {{ t('wallet.orderHistory') }}
            </h2>
          </div>
          <div class="p-6">
            <div v-if="recordsLoading" class="flex items-center justify-center py-10">
              <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-gold-500 dark:border-gold-300"></div>
            </div>

            <div v-else-if="records.length === 0" class="py-12 text-center">
              <Icon name="list" size="xl" class="mx-auto text-dust-300 dark:text-pearl-400" />
              <p class="mt-3 text-sm text-secondary-fg">
                {{ t('wallet.noOrders') }}
              </p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[860px]">
                <thead>
                  <tr class="hairline-strong border-b text-left text-sm text-secondary-fg">
                    <th class="px-3 py-3">{{ t('wallet.orderNo') }}</th>
                    <th class="px-3 py-3">{{ t('wallet.paymentMethod') }}</th>
                    <th class="px-3 py-3">{{ t('wallet.orderAmount') }}</th>
                    <th class="px-3 py-3">{{ t('wallet.creditAmount') }}</th>
                    <th class="px-3 py-3">{{ t('common.status') }}</th>
                    <th class="px-3 py-3">{{ t('wallet.createdAt') }}</th>
                    <th class="px-3 py-3">{{ t('wallet.completedAt') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-paper-200 dark:divide-ink-700">
                  <tr v-for="record in records" :key="record.id" class="hover-tint">
                    <td class="px-3 py-3 font-mono text-xs text-dust-700 dark:text-pearl-200">
                      {{ record.trade_no }}
                    </td>
                    <td class="px-3 py-3 text-sm text-dust-700 dark:text-pearl-200">
                      {{ record.payment_method || '—' }}
                    </td>
                    <td class="px-3 py-3 text-sm num-mono text-dust-700 dark:text-pearl-200">
                      {{ record.money.toFixed(2) }}
                    </td>
                    <td class="px-3 py-3 text-sm font-medium num-mono text-mint-600 dark:text-mint-500">
                      <!-- amount = top-up count as entered (display dollars), NOT quota units -->
                      ${{ record.amount }}
                    </td>
                    <td class="px-3 py-3">
                      <span :class="['badge', recordStatusClass(record.status)]">
                        {{ recordStatusLabel(record.status) }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-sm text-secondary-fg">
                      {{ record.create_time ? formatDateTime(new Date(record.create_time * 1000)) : '—' }}
                    </td>
                    <td class="px-3 py-3 text-sm text-secondary-fg">
                      {{ record.complete_time ? formatDateTime(new Date(record.complete_time * 1000)) : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="recordsTotal > recordsPageSize" class="mt-4">
              <Pagination
                :total="recordsTotal"
                :page="recordsPage"
                :page-size="recordsPageSize"
                :show-page-size-selector="false"
                @update:page="onRecordsPageChange"
              />
            </div>
          </div>
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import topupAPI, { type EpayOrder } from '@/api/topup'
import type { NewApiTopUp, NewApiTopUpInfo } from '@/types/newapi'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import Pagination from '@/components/common/Pagination.vue'
import { useAppStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/format'
import { formatQuotaUSD } from '@/utils/quota'

const PREVIEW_DEBOUNCE_MS = 400

const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()

const user = computed(() => authStore.user)

const loading = ref(true)
const submitting = ref(false)
const topupInfo = ref<NewApiTopUpInfo | null>(null)

const selectedAmount = ref<number | null>(null)
const customAmount = ref('')
const selectedMethod = ref('')

// Server-computed payable preview (authoritative display string).
const payablePreview = ref('')
const previewLoading = ref(false)
let previewTimer: number | null = null
let previewGeneration = 0

const records = ref<NewApiTopUp[]>([])
const recordsLoading = ref(false)
const recordsPage = ref(1)
const recordsPageSize = ref(10)
const recordsTotal = ref(0)

const payMethods = computed(() => topupInfo.value?.pay_methods ?? [])
const amountOptions = computed(() => topupInfo.value?.amount_options ?? [])
const onlineTopupEnabled = computed(
  () =>
    (topupInfo.value?.enable_online_topup ?? false) &&
    // Server-side the /pay endpoint is compliance-gated too; this hides the form
    // instead of letting submissions fail.
    (topupInfo.value?.payment_compliance_confirmed ?? false) &&
    payMethods.value.length > 0
)

const minTopup = computed(() => {
  const globalMin = topupInfo.value?.min_topup ?? 0
  const methodMin =
    payMethods.value.find((m) => m.type === selectedMethod.value)?.min_topup ?? 0
  return Math.max(globalMin, methodMin)
})

const effectiveAmount = computed(() => {
  if (selectedAmount.value && selectedAmount.value > 0) {
    return selectedAmount.value
  }
  const amount = Number(customAmount.value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
})

// Client-side check is UX only; the server re-validates everything.
const amountValid = computed(
  () => effectiveAmount.value > 0 && effectiveAmount.value >= minTopup.value
)

const activePaywayClass =
  'rounded-xl border border-gold-500 dark:border-gold-300 bg-gold-500/10 dark:bg-gold-300/10 px-4 py-3 text-sm font-medium text-gold-600 dark:text-gold-300 transition'
const inactivePaywayClass =
  'rounded-xl border border-paper-200 dark:border-ink-700 px-4 py-3 text-sm font-medium text-dust-700 dark:text-pearl-100 transition hover:border-gold-500/50 dark:hover:border-gold-300/50 hover:text-gold-600 dark:hover:text-gold-300'

function recordStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return t('wallet.statusPaid')
    case 'pending':
      return t('wallet.statusPending')
    default:
      return t('wallet.statusClosed')
  }
}

function recordStatusClass(status: string): string {
  switch (status) {
    case 'success':
      return 'badge-success'
    case 'pending':
      return 'badge-warning'
    default:
      return 'badge-danger'
  }
}

function selectFixedAmount(amount: number): void {
  selectedAmount.value = amount
  customAmount.value = ''
}

function schedulePreview(): void {
  if (previewTimer !== null) {
    window.clearTimeout(previewTimer)
    previewTimer = null
  }
  const generation = ++previewGeneration
  if (!amountValid.value) {
    payablePreview.value = ''
    previewLoading.value = false
    return
  }
  previewLoading.value = true
  previewTimer = window.setTimeout(async () => {
    try {
      const preview = await topupAPI.requestAmount(effectiveAmount.value)
      if (generation === previewGeneration) {
        payablePreview.value = preview.amount
      }
    } catch (error) {
      if (generation === previewGeneration) {
        payablePreview.value = ''
      }
      console.error('Failed to preview payable amount:', error)
    } finally {
      if (generation === previewGeneration) {
        previewLoading.value = false
      }
    }
  }, PREVIEW_DEBOUNCE_MS)
}

// minTopup is method-dependent, so a method switch can flip amount validity.
watch([effectiveAmount, minTopup, onlineTopupEnabled], () => {
  if (onlineTopupEnabled.value) {
    schedulePreview()
  }
})

/** Redirect to the gateway via a self-submitting POST form (never an iframe). */
function postToGateway(order: EpayOrder): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = order.url
  for (const [name, value] of Object.entries(order.params)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = String(value)
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

async function submitTopup(): Promise<void> {
  if (submitting.value || !amountValid.value || !selectedMethod.value) {
    return
  }
  submitting.value = true
  try {
    // requestEpay throws unless the order has url + params: a failed or
    // incomplete payment response can never reach this redirect.
    const order = await topupAPI.requestEpay(effectiveAmount.value, selectedMethod.value)
    postToGateway(order)
  } catch (error: any) {
    appStore.showError(
      t('wallet.createOrderFailed') + ': ' + (error?.message || t('common.unknownError'))
    )
  } finally {
    submitting.value = false
  }
}

async function loadTopupInfo(): Promise<void> {
  try {
    topupInfo.value = await topupAPI.getTopUpInfo()
    if (!selectedMethod.value && payMethods.value.length > 0) {
      selectedMethod.value = payMethods.value[0].type
    }
  } catch (error: any) {
    appStore.showError(
      t('wallet.loadFailed') + ': ' + (error?.message || t('common.unknownError'))
    )
  }
}

async function loadRecords(page = recordsPage.value): Promise<void> {
  recordsLoading.value = true
  try {
    const result = await topupAPI.getUserTopUps(page, recordsPageSize.value)
    records.value = result.items
    recordsPage.value = result.page || page
    recordsTotal.value = result.total
  } catch (error) {
    console.error('Failed to load top-up records:', error)
  } finally {
    recordsLoading.value = false
  }
}

function onRecordsPageChange(page: number): void {
  void loadRecords(page)
}

async function refreshAll(): Promise<void> {
  loading.value = true
  try {
    await Promise.all([
      loadTopupInfo(),
      loadRecords(1),
      // Balance comes from the server-refreshed user; never updated locally.
      authStore.refreshUser().catch((error) => {
        console.error('Failed to refresh user:', error)
      })
    ])
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refreshAll()
})

onUnmounted(() => {
  if (previewTimer !== null) {
    window.clearTimeout(previewTimer)
    previewTimer = null
  }
})
</script>
