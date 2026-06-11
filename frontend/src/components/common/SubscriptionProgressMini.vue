<template>
  <div v-if="hasActiveSubscriptions" class="relative" ref="containerRef">
    <!-- Mini Progress Display -->
    <button
      @click="toggleTooltip"
      class="flex cursor-pointer items-center gap-2 rounded-xl bg-purple-50 px-3 py-1.5 transition-colors hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30"
      :title="t('subscriptionProgress.viewDetails')"
    >
      <Icon name="creditCard" size="sm" class="text-purple-600 dark:text-purple-400" />
      <div class="flex items-center gap-1.5">
        <!-- Combined progress indicator -->
        <div class="flex items-center gap-0.5">
          <div
            v-for="(sub, index) in displaySubscriptions.slice(0, 3)"
            :key="index"
            class="h-2 w-2 rounded-full"
            :class="getProgressDotClass(sub)"
          ></div>
        </div>
        <span class="text-xs font-medium text-purple-700 dark:text-purple-300">
          {{ activeSubscriptions.length }}
        </span>
      </div>
    </button>

    <!-- Hover/Click Tooltip -->
    <transition name="dropdown">
      <div
        v-if="tooltipOpen"
        class="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-xl border border-paper-200 bg-white shadow-xl dark:border-ink-700 dark:bg-ink-800"
      >
        <div class="border-b border-paper-100 p-3 dark:border-ink-700">
          <h3 class="text-sm font-semibold text-primary-fg">
            {{ t('subscriptionProgress.title') }}
          </h3>
          <p class="mt-0.5 text-xs text-secondary-fg">
            {{ t('subscriptionProgress.activeCount', { count: activeSubscriptions.length }) }}
          </p>
        </div>

        <div class="max-h-64 overflow-y-auto">
          <div
            v-for="subscription in displaySubscriptions"
            :key="subscription.id"
            class="border-b border-paper-100 p-3 last:border-b-0 dark:border-ink-700/50"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-medium text-primary-fg">
                {{ subscription.plan_title }}
              </span>
              <span
                v-if="subscription.expires_at"
                class="text-xs"
                :class="getDaysRemainingClass(subscription.expires_at)"
              >
                {{ formatDaysRemaining(subscription.expires_at) }}
              </span>
            </div>

            <!-- Single used/total progress or Unlimited badge -->
            <div class="space-y-1.5">
              <div
                v-if="subscription.usage_pct === null"
                class="flex items-center gap-2 rounded-lg bg-gradient-to-r from-mint-500/10 to-teal-50 px-2.5 py-1.5 dark:from-mint-500/15 dark:to-teal-900/20"
              >
                <span class="text-lg text-mint-600 dark:text-mint-500">∞</span>
                <span class="text-xs font-medium text-mint-600 dark:text-mint-500">
                  {{ t('subscriptionProgress.unlimited') }}
                </span>
              </div>

              <div v-else class="flex items-center gap-2">
                <div class="h-1.5 min-w-0 flex-1 rounded-full bg-paper-200 dark:bg-ink-600">
                  <div
                    class="h-1.5 rounded-full transition-all"
                    :class="getProgressBarClass(subscription.usage_pct)"
                    :style="{ width: `${Math.min(subscription.usage_pct, 100)}%` }"
                  ></div>
                </div>
                <span class="w-28 flex-shrink-0 text-right text-[10px] text-secondary-fg">
                  {{ formatUsage(subscription) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-paper-100 p-2 dark:border-ink-700">
          <router-link
            to="/subscriptions"
            @click="closeTooltip"
            class="block w-full py-1 text-center text-xs text-gold-600 hover:underline dark:text-gold-300"
          >
            {{ t('subscriptionProgress.viewAll') }}
          </router-link>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { useSubscriptionStore } from '@/stores'
import type { SubscriptionDisplay } from '@/api/subscriptions'

const { t } = useI18n()

const subscriptionStore = useSubscriptionStore()

const containerRef = ref<HTMLElement | null>(null)
const tooltipOpen = ref(false)

// Use store data instead of local state
const activeSubscriptions = computed(() => subscriptionStore.activeSubscriptions)
const hasActiveSubscriptions = computed(() => subscriptionStore.hasActiveSubscriptions)

const displaySubscriptions = computed(() => {
  // Sort by most usage (highest percentage first; unlimited last)
  return [...activeSubscriptions.value].sort(
    (a, b) => (b.usage_pct ?? -1) - (a.usage_pct ?? -1)
  )
})

function getProgressDotClass(sub: SubscriptionDisplay): string {
  // Unlimited subscriptions get a special color
  if (sub.usage_pct === null) {
    return 'bg-mint-500'
  }
  if (sub.usage_pct >= 90) return 'bg-coral-500'
  if (sub.usage_pct >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

function getProgressBarClass(pct: number): string {
  if (pct >= 90) return 'bg-coral-500'
  if (pct >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

function formatUsage(sub: SubscriptionDisplay): string {
  return `$${sub.amount_used_usd.toFixed(2)}/$${sub.amount_total_usd.toFixed(2)}`
}

function formatDaysRemaining(expiresAt: string): string {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diff = expires.getTime() - now.getTime()
  if (diff < 0) return t('subscriptionProgress.expired')
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return t('subscriptionProgress.expiresToday')
  if (days === 1) return t('subscriptionProgress.expiresTomorrow')
  return t('subscriptionProgress.daysRemaining', { days })
}

function getDaysRemainingClass(expiresAt: string): string {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diff = expires.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 3) return 'text-coral-600 dark:text-coral-500'
  if (days <= 7) return 'text-orange-600 dark:text-orange-400'
  return 'text-secondary-fg'
}

function toggleTooltip() {
  tooltipOpen.value = !tooltipOpen.value
}

function closeTooltip() {
  tooltipOpen.value = false
}

function handleClickOutside(event: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    closeTooltip()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  // Trigger initial fetch if not already loaded
  // The actual data loading is handled by App.vue globally
  subscriptionStore.fetchActiveSubscriptions().catch((error) => {
    console.error('Failed to load subscriptions in SubscriptionProgressMini:', error)
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
