<template>
  <AppLayout>
    <div class="space-y-6">
      <div v-if="loading" class="flex items-center justify-center py-12"><LoadingSpinner /></div>
      <template v-else-if="stats">
        <!-- Welcome Section -->
        <UserDashboardWelcome />

        <!-- Stats Row -->
        <UserDashboardStats :stats="stats" :balance="quotaToUSD(user?.quota ?? 0)" :is-simple="authStore.isSimpleMode" />

        <!-- Charts -->
        <UserDashboardCharts v-model:startDate="startDate" v-model:endDate="endDate" :loading="loadingCharts" :trend="trendData" :models="modelStats" @dateRangeChange="loadCharts" />

        <!-- Recent Usage -->
        <UserDashboardRecentUsage :data="recentUsage" :loading="loadingUsage" />
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usageAPI, DATA_RANGE_MAX_DAYS, type UserDashboardStats as UserStatsType } from '@/api/usage'
import { quotaToUSD } from '@/utils/quota'
import { toLocalDayKey } from '@/utils/format'
import AppLayout from '@/components/layout/AppLayout.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import UserDashboardWelcome from '@/components/user/dashboard/UserDashboardWelcome.vue'
import UserDashboardStats from '@/components/user/dashboard/UserDashboardStats.vue'
import UserDashboardCharts from '@/components/user/dashboard/UserDashboardCharts.vue'
import UserDashboardRecentUsage from '@/components/user/dashboard/UserDashboardRecentUsage.vue'
import type { UsageLog, TrendDataPoint, ModelStat } from '@/types'

const authStore = useAuthStore()
const user = computed(() => authStore.user)
const stats = ref<UserStatsType | null>(null)
const loading = ref(false)
const loadingUsage = ref(false)
const loadingCharts = ref(false)
const trendData = ref<TrendDataPoint[]>([])
const modelStats = ref<ModelStat[]>([])
const recentUsage = ref<UsageLog[]>([])

const startDate = ref(toLocalDayKey(new Date(Date.now() - 6 * 86400000)))
const endDate = ref(toLocalDayKey(new Date()))

// The per-day aggregate endpoint rejects ranges wider than the cap — clamp the
// selected start date so the picker always reflects the data actually shown.
const clampDateRange = () => {
  const end = new Date(`${endDate.value}T00:00:00`)
  const start = new Date(`${startDate.value}T00:00:00`)
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return
  const minStart = new Date(end.getTime() - (DATA_RANGE_MAX_DAYS - 1) * 86400000)
  if (start < minStart) {
    startDate.value = toLocalDayKey(minStart)
  }
}

const loadStats = async () => {
  loading.value = true
  try {
    await authStore.refreshUser()
    stats.value = await usageAPI.getDashboardStats()
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
  } finally {
    loading.value = false
  }
}

const loadCharts = async () => {
  clampDateRange()
  loadingCharts.value = true
  try {
    // One data/self fetch feeds both the trend and the per-model table.
    const { trend, models } = await usageAPI.getDashboardChartData({
      start_date: startDate.value,
      end_date: endDate.value
    })
    trendData.value = trend.trend || []
    modelStats.value = models.models || []
  } catch (error) {
    console.error('Failed to load charts:', error)
  } finally {
    loadingCharts.value = false
  }
}

const loadRecent = async () => {
  loadingUsage.value = true
  try {
    const res = await usageAPI.getByDateRange(startDate.value, endDate.value, 5)
    recentUsage.value = res.items
  } catch (error) {
    console.error('Failed to load recent usage:', error)
  } finally {
    loadingUsage.value = false
  }
}

onMounted(() => {
  loadStats()
  loadCharts()
  loadRecent()
})
</script>
