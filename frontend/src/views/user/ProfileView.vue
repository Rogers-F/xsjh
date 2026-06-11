<template>
  <AppLayout>
    <div class="mx-auto max-w-4xl space-y-6">
      <!-- The backend exposes neither a concurrency limit nor a created_at
           date; only the quota-derived balance is real. -->
      <StatCard
        :title="t('profile.accountBalance')"
        :value="formatCurrency(quotaToUSD(user?.quota ?? 0))"
        :icon="WalletIcon"
        icon-variant="success"
      />
      <ProfileInfoCard :user="user" />
      <div v-if="contactInfo" class="card border-accent-200 bg-accent-50/50 dark:border-accent-700/50 dark:bg-accent-800/30 p-6">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-accent-100 rounded-xl text-accent-600 dark:bg-accent-800/50 dark:text-accent-300">
            <Icon name="chat" size="lg" />
          </div>
          <div>
            <h3 class="font-semibold text-accent-800 dark:text-accent-200">
              {{ t('common.contactSupport') }}
            </h3>
            <p class="text-sm font-medium">{{ contactInfo }}</p>
          </div>
        </div>
      </div>
      <ProfileEditForm
        :initial-username="user?.username || ''"
        :initial-display-name="user?.display_name || ''"
      />
      <ProfilePasswordForm />
      <ProfileTotpCard />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { quotaToUSD } from '@/utils/quota'
import { authAPI } from '@/api'
import AppLayout from '@/components/layout/AppLayout.vue'
import StatCard from '@/components/common/StatCard.vue'
import ProfileInfoCard from '@/components/user/profile/ProfileInfoCard.vue'
import ProfileEditForm from '@/components/user/profile/ProfileEditForm.vue'
import ProfilePasswordForm from '@/components/user/profile/ProfilePasswordForm.vue'
import ProfileTotpCard from '@/components/user/profile/ProfileTotpCard.vue'
import { Icon } from '@/components/icons'

const { t } = useI18n()
const authStore = useAuthStore()
const user = computed(() => authStore.user)
const contactInfo = ref('')

const WalletIcon = {
  render: () =>
    h(
      'svg',
      { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', 'stroke-width': '1.5' },
      [h('path', { d: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12' })]
    )
}

async function loadContactInfo(): Promise<void> {
  try {
    const settings = await authAPI.getPublicSettings()
    contactInfo.value = settings.contact_info || ''
  } catch (error) {
    console.error('Failed to load contact info:', error)
  }
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

onMounted(loadContactInfo)
</script>
