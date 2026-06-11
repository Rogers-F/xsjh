<template>
  <AppLayout>
    <div class="mx-auto max-w-6xl space-y-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-16">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-gold-500 dark:border-gold-300 border-t-transparent"
        ></div>
      </div>

      <!-- Not enabled / no purchasable plans (compliance gate) -->
      <div
        v-else-if="!purchaseEnabled || plans.length === 0"
        class="card flex items-center justify-center p-10 text-center"
      >
        <div class="max-w-md py-10">
          <div
            class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-paper-100 dark:bg-ink-700"
          >
            <Icon name="creditCard" size="lg" class="text-dust-400" />
          </div>
          <h3 class="text-lg font-semibold text-primary-fg">
            {{ t('purchase.notEnabledTitle') }}
          </h3>
          <p class="mt-2 text-sm text-secondary-fg">
            {{ t('purchase.notEnabledDesc') }}
          </p>
        </div>
      </div>

      <!-- Plan cards -->
      <div v-else class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="plan in plans" :key="plan.id" class="card flex flex-col overflow-hidden">
          <div class="hairline border-b px-6 py-4">
            <h3 class="text-lg font-semibold text-primary-fg">{{ plan.title }}</h3>
            <p v-if="plan.subtitle" class="mt-1 text-sm text-secondary-fg">
              {{ plan.subtitle }}
            </p>
          </div>

          <div class="flex flex-1 flex-col gap-4 p-6">
            <div class="text-3xl font-bold num-mono text-primary-fg">
              {{ formatPlanPrice(plan) }}
            </div>

            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="text-secondary-fg">{{ t('purchase.duration') }}</span>
                <span class="font-medium text-primary-fg">
                  {{ plan.duration_value }} {{ plan.duration_unit }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-secondary-fg">{{ t('purchase.quota') }}</span>
                <span class="font-medium num-mono text-mint-600 dark:text-mint-500">
                  {{ formatQuotaUSD(plan.total_amount) }}
                </span>
              </div>
              <div
                v-if="plan.max_purchase_per_user && plan.max_purchase_per_user > 0"
                class="flex items-center justify-between gap-3"
              >
                <span class="text-secondary-fg">{{ t('purchase.purchaseLimit') }}</span>
                <span class="font-medium text-primary-fg">
                  {{ plan.max_purchase_per_user }}
                </span>
              </div>
            </div>

            <div class="mt-auto pt-2">
              <button
                type="button"
                class="btn btn-primary w-full"
                :disabled="!plan.allow_balance_pay || payingPlanId !== null"
                :title="!plan.allow_balance_pay ? t('purchase.balancePayUnavailable') : undefined"
                @click="askBalancePay(plan)"
              >
                <svg
                  v-if="payingPlanId === plan.id"
                  class="mr-2 h-4 w-4 animate-spin"
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
                {{
                  payingPlanId === plan.id
                    ? t('common.processing')
                    : plan.allow_balance_pay
                      ? t('purchase.balancePay')
                      : t('purchase.balancePayUnavailable')
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :show="confirmPlan !== null"
      :title="t('purchase.confirmTitle')"
      :message="
        confirmPlan
          ? t('purchase.confirmMessage', {
              plan: confirmPlan.title,
              price: formatPlanPrice(confirmPlan)
            })
          : ''
      "
      @confirm="confirmBalancePay"
      @cancel="confirmPlan = null"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { useSubscriptionStore } from '@/stores/subscriptions'
import subscriptionsAPI from '@/api/subscriptions'
import type { NewApiSubscriptionPlan } from '@/types/newapi'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { formatQuotaUSD } from '@/utils/quota'
import { formatCurrency } from '@/utils/format'

const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()
const subscriptionStore = useSubscriptionStore()

const loading = ref(true)
// Empty plans list = payment compliance not confirmed; the page shows the
// not-enabled state instead of an error (server-side gate).
const plans = ref<NewApiSubscriptionPlan[]>([])
const confirmPlan = ref<NewApiSubscriptionPlan | null>(null)
const payingPlanId = ref<number | null>(null)

const purchaseEnabled = computed(() => {
  return appStore.cachedPublicSettings?.purchase_subscription_enabled ?? false
})

function formatPlanPrice(plan: NewApiSubscriptionPlan): string {
  // price_amount + currency come straight from the server; never derive them.
  try {
    return formatCurrency(plan.price_amount, plan.currency || 'USD')
  } catch {
    return `${plan.price_amount.toFixed(2)} ${plan.currency}`.trim()
  }
}

function askBalancePay(plan: NewApiSubscriptionPlan): void {
  if (!plan.allow_balance_pay || payingPlanId.value !== null) return
  confirmPlan.value = plan
}

async function confirmBalancePay(): Promise<void> {
  const plan = confirmPlan.value
  confirmPlan.value = null
  if (!plan || payingPlanId.value !== null) return

  payingPlanId.value = plan.id
  try {
    // Server enforces compliance, allow_balance_pay and balance sufficiency.
    await subscriptionsAPI.balancePay(plan.id)
    appStore.showSuccess(t('purchase.paySuccess'))
    // Refresh server state; never adjust the balance locally.
    await authStore.refreshUser()
    subscriptionStore.fetchActiveSubscriptions(true).catch((error) => {
      console.error('Failed to refresh subscriptions after purchase:', error)
    })
  } catch (error: any) {
    // Surface the backend message verbatim.
    appStore.showError(error?.message || t('common.unknownError'))
  } finally {
    payingPlanId.value = null
  }
}

onMounted(async () => {
  loading.value = true
  try {
    if (!appStore.publicSettingsLoaded) {
      await appStore.fetchPublicSettings()
    }
    if (purchaseEnabled.value) {
      plans.value = await subscriptionsAPI.getPlans()
    }
  } catch (error: any) {
    appStore.showError(error?.message || t('common.unknownError'))
  } finally {
    loading.value = false
  }
})
</script>
