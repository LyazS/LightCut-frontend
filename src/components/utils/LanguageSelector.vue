<template>
  <n-dropdown
    placement="bottom-end"
    trigger="click"
    :options="dropdownOptions"
    @select="handleLanguageSelect"
  >
    <HoverButton variant="small" :title="t('common.language')">
      <template #icon>
        <component :is="IconComponents.TRANSLATE" size="18px" />
      </template>
    </HoverButton>
  </n-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NDropdown } from 'naive-ui'
import { useAppI18n } from '@/core/composables/useI18n'
import { IconComponents } from '@/constants/iconComponents'
import HoverButton from '@/components/base/HoverButton.vue'

const { t, locale, languageOptions, switchLanguage } = useAppI18n()

// 转换为 n-dropdown 的选项格式
const dropdownOptions = computed(() =>
  languageOptions.map((option) => ({
    label: option.label,
    key: option.value,
  })),
)

// 语言切换处理函数
const handleLanguageSelect = (key: string) => {
  switchLanguage(key as 'en-US' | 'zh-CN')
}
</script>

<style scoped>
/* n-dropdown 使用 Naive UI 的默认样式，不需要自定义样式 */
</style>
