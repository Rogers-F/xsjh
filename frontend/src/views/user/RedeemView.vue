<template>
  <AppLayout>
    <div class="mx-auto max-w-2xl space-y-6">
      <!-- Current Balance Card -->
      <div class="card overflow-hidden">
        <div
          class="relative bg-gradient-to-br from-accent-800 via-accent-900 to-ink-950 px-6 py-8 text-center"
        >
          <!-- Decorative glow orbs -->
          <div
            class="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold-500/15 dark:bg-gold-300/15 blur-3xl"
          ></div>
          <div
            class="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-gold-500/10 dark:bg-gold-300/10 blur-2xl"
          ></div>

          <div class="relative z-10">
            <div
              class="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/[0.08] backdrop-blur-sm"
            >
              <Icon name="creditCard" size="lg" class="text-gold-500 dark:text-gold-300" />
            </div>
            <p class="text-sm font-medium tracking-wide text-accent-400">
              {{ t('redeem.currentBalance') }}
            </p>
            <p class="mt-1.5 text-4xl font-bold tabular-nums tracking-tight text-pearl-50">
              {{ formatQuotaUSD(user?.quota ?? 0) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Redeem Form -->
      <div class="card">
        <div class="p-6">
          <form @submit.prevent="handleRedeem" class="space-y-5">
            <div>
              <label for="code" class="input-label">
                {{ t('redeem.redeemCodeLabel') }}
              </label>
              <div class="relative mt-1">
                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Icon name="gift" size="md" class="text-dust-400 dark:text-pearl-400" />
                </div>
                <input
                  id="code"
                  v-model="redeemCode"
                  type="text"
                  required
                  :placeholder="t('redeem.redeemCodePlaceholder')"
                  :disabled="submitting"
                  class="input py-3 pl-12 text-lg"
                />
              </div>
              <p class="input-hint">
                {{ t('redeem.redeemCodeHint') }}
              </p>
            </div>

            <button
              type="submit"
              :disabled="!redeemCode || submitting"
              class="btn btn-gold w-full py-3"
            >
              <svg
                v-if="submitting"
                class="-ml-1 mr-2 h-5 w-5 animate-spin"
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
              <Icon v-else name="checkCircle" size="md" class="mr-2" />
              {{ submitting ? t('redeem.redeeming') : t('redeem.redeemButton') }}
            </button>
          </form>
        </div>
      </div>

      <!-- Success Message -->
      <transition name="fade">
        <div
          v-if="redeemedQuota !== null"
          class="card border-mint-500/30 bg-mint-500/10 dark:border-mint-500/30 dark:bg-mint-500/10"
        >
          <div class="p-6">
            <div class="flex items-start gap-4">
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-mint-500/15 dark:bg-mint-500/15"
              >
                <Icon name="checkCircle" size="md" class="text-mint-600 dark:text-mint-500" />
              </div>
              <div class="flex-1">
                <h3 class="text-sm font-semibold text-mint-600 dark:text-mint-500">
                  {{ t('redeem.redeemSuccess') }}
                </h3>
                <div class="mt-2 text-sm text-mint-600 dark:text-mint-500">
                  <p class="font-medium">
                    {{ t('redeem.added') }}: +{{ formatQuotaUSD(redeemedQuota) }}
                  </p>
                  <p class="mt-1">
                    {{ t('redeem.newBalance') }}:
                    <span class="font-semibold">{{ formatQuotaUSD(user?.quota ?? 0) }}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- Error Message -->
      <transition name="fade">
        <div
          v-if="errorMessage"
          class="card border-coral-500/30 bg-coral-500/10 dark:border-coral-500/30 dark:bg-coral-500/10"
        >
          <div class="p-6">
            <div class="flex items-start gap-4">
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-coral-500/15 dark:bg-coral-500/15"
              >
                <Icon
                  name="exclamationCircle"
                  size="md"
                  class="text-coral-600 dark:text-coral-500"
                />
              </div>
              <div class="flex-1">
                <h3 class="text-sm font-semibold text-coral-600 dark:text-coral-500">
                  {{ t('redeem.redeemFailed') }}
                </h3>
                <p class="mt-2 text-sm text-coral-600 dark:text-coral-500">
                  {{ errorMessage }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- Information Card -->
      <div
        class="card border-accent-200 bg-accent-50/50 dark:border-accent-700/50 dark:bg-accent-800/30"
      >
        <div class="p-6">
          <div class="flex items-start gap-4">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/10 dark:bg-gold-300/10"
            >
              <Icon name="infoCircle" size="md" class="text-gold-600 dark:text-gold-300" />
            </div>
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-gold-600 dark:text-gold-300">
                {{ t('redeem.aboutCodes') }}
              </h3>
              <ul
                class="mt-2 list-inside list-disc space-y-1 text-sm text-gold-600 dark:text-gold-300"
              >
                <li>{{ t('redeem.codeRule1') }}</li>
                <li>{{ t('redeem.codeRule2') }}</li>
                <li>
                  {{ t('redeem.codeRule3') }}
                  <span
                    v-if="contactInfo"
                    class="ml-1.5 inline-flex items-center rounded-md bg-gold-500/15 dark:bg-gold-300/15 px-2 py-0.5 text-xs font-medium text-gold-600 dark:text-gold-300"
                  >
                    {{ contactInfo }}
                  </span>
                </li>
                <li>{{ t('redeem.codeRule4') }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Account Credit Records (topups + redeems share one log type) -->
      <div class="card">
        <div class="hairline border-b px-6 py-4">
          <h2 class="text-lg font-semibold text-primary-fg">
            {{ t('redeem.creditRecords') }}
          </h2>
        </div>
        <div class="p-6">
          <!-- Loading State -->
          <div v-if="loadingHistory" class="flex items-center justify-center py-8">
            <svg class="h-6 w-6 animate-spin text-gold-500 dark:text-gold-300" fill="none" viewBox="0 0 24 24">
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
          </div>

          <!-- History List -->
          <div v-else-if="history.length > 0" class="space-y-3">
            <div
              v-for="item in history"
              :key="item.id"
              class="flex items-center justify-between gap-4 rounded-xl bg-paper-50 p-4 dark:bg-ink-800"
            >
              <div class="flex min-w-0 items-center gap-4">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-mint-500/15 dark:bg-mint-500/15"
                >
                  <Icon name="dollar" size="md" class="text-mint-600 dark:text-mint-500" />
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-primary-fg" :title="item.content">
                    {{ item.content }}
                  </p>
                  <p class="text-xs text-secondary-fg">
                    {{ formatDateTime(item.created_at) }}
                  </p>
                </div>
              </div>
              <p
                v-if="item.total_cost > 0"
                class="flex-shrink-0 text-sm font-semibold text-mint-600 dark:text-mint-500"
              >
                +${{ item.total_cost.toFixed(2) }}
              </p>
            </div>

            <Pagination
              v-if="historyTotal > historyPageSize"
              :total="historyTotal"
              :page="historyPage"
              :page-size="historyPageSize"
              :show-page-size-selector="false"
              @update:page="onHistoryPageChange"
            />
          </div>

          <!-- Empty State -->
          <div v-else class="empty-state py-8">
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-paper-100 dark:bg-ink-800"
            >
              <Icon name="clock" size="xl" class="text-dust-400 dark:text-pearl-400" />
            </div>
            <p class="text-sm text-secondary-fg">
              {{ t('redeem.creditRecordsEmpty') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { authAPI } from '@/api'
import topupAPI from '@/api/topup'
import usageAPI from '@/api/usage'
import type { UsageLog } from '@/types'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import Pagination from '@/components/common/Pagination.vue'
import { formatDateTime } from '@/utils/format'
import { formatQuotaUSD } from '@/utils/quota'

const { t } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()

const user = computed(() => authStore.user)

const redeemCode = ref('')
const submitting = ref(false)
// Credited quota units returned by the server (null = no result shown).
const redeemedQuota = ref<number | null>(null)
const errorMessage = ref('')

// Credit-log history (mixes redeem codes and online payments)
const history = ref<UsageLog[]>([])
const loadingHistory = ref(false)
const historyPage = ref(1)
const historyPageSize = ref(10)
const historyTotal = ref(0)
const contactInfo = ref('')

const fetchHistory = async (page = historyPage.value) => {
  loadingHistory.value = true
  try {
    const result = await usageAPI.listCreditLogs(page, historyPageSize.value)
    history.value = result.items
    historyPage.value = result.page || page
    historyTotal.value = result.total
  } catch (error) {
    console.error('Failed to fetch credit records:', error)
  } finally {
    loadingHistory.value = false
  }
}

function onHistoryPageChange(page: number) {
  void fetchHistory(page)
}

const handleRedeem = async () => {
  if (!redeemCode.value.trim() || submitting.value) {
    if (!redeemCode.value.trim()) {
      appStore.showError(t('redeem.pleaseEnterCode'))
    }
    return
  }

  submitting.value = true
  errorMessage.value = ''
  redeemedQuota.value = null

  try {
    // Server returns the credited quota units; never compute locally.
    const credited = await topupAPI.redeem(redeemCode.value.trim())
    redeemedQuota.value = credited

    // Re-fetch the user so the balance shown is server state.
    await authStore.refreshUser()

    // Clear the input
    redeemCode.value = ''

    // Refresh history
    await fetchHistory(1)

    // Show success toast
    appStore.showSuccess(t('redeem.codeRedeemSuccess'))
  } catch (error: any) {
    errorMessage.value = error?.message || t('redeem.failedToRedeem')

    appStore.showError(t('redeem.redeemFailed'))
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  void fetchHistory()
  try {
    const settings = await authAPI.getPublicSettings()
    contactInfo.value = settings.contact_info || ''
  } catch (error) {
    console.error('Failed to load contact info:', error)
  }
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
