<template>
  <div class="card">
    <div class="border-b hairline px-6 py-4">
      <h2 class="text-lg font-medium text-dust-900 dark:text-white">
        {{ t('profile.editProfile') }}
      </h2>
    </div>
    <div class="px-6 py-6">
      <form @submit.prevent="handleUpdateProfile" class="space-y-4">
        <div>
          <label for="username" class="input-label">
            {{ t('profile.username') }}
          </label>
          <input
            id="username"
            v-model="username"
            type="text"
            class="input"
            :placeholder="t('profile.enterUsername')"
          />
        </div>

        <div>
          <label for="display_name" class="input-label">
            {{ t('profile.displayName') }}
          </label>
          <input
            id="display_name"
            v-model="displayName"
            type="text"
            class="input"
            :placeholder="t('profile.enterDisplayName')"
          />
        </div>

        <div>
          <label for="profile_current_password" class="input-label">
            {{ t('profile.currentPassword') }}
          </label>
          <!-- The backend verifies the current password on EVERY self update,
               renames included — not only on password changes. -->
          <input
            id="profile_current_password"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            class="input"
            :placeholder="t('profile.currentPassword')"
          />
        </div>

        <div class="flex justify-end pt-4">
          <button type="submit" :disabled="loading" class="btn btn-primary">
            {{ loading ? t('profile.updating') : t('profile.updateProfile') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { userAPI } from '@/api'

const props = defineProps<{
  initialUsername: string
  initialDisplayName?: string
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()

const username = ref(props.initialUsername)
const displayName = ref(props.initialDisplayName ?? '')
const currentPassword = ref('')
const loading = ref(false)

watch(() => props.initialUsername, (val) => {
  username.value = val
})

watch(() => props.initialDisplayName, (val) => {
  displayName.value = val ?? ''
})

const handleUpdateProfile = async () => {
  if (!username.value.trim()) {
    appStore.showError(t('profile.usernameRequired'))
    return
  }
  if (!currentPassword.value) {
    appStore.showError(t('profile.currentPasswordRequired'))
    return
  }

  loading.value = true
  try {
    // The update endpoint returns no user object — re-fetch to refresh the
    // cached profile after a successful save.
    await userAPI.updateProfile({
      username: username.value,
      display_name: displayName.value.trim() || undefined,
      original_password: currentPassword.value
    })
    currentPassword.value = ''
    await authStore.refreshUser().catch(() => undefined)
    appStore.showSuccess(t('profile.updateSuccess'))
  } catch (error: any) {
    // Surface the backend message verbatim (the client normalizes it).
    appStore.showError(error?.message || t('profile.updateFailed'))
  } finally {
    loading.value = false
  }
}
</script>
