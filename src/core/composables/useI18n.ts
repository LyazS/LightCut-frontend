import { useI18n } from 'vue-i18n'
import type { I18nSchema } from '@/locales'
import { useRouter } from 'vue-router'

type AppI18nReturn = ReturnType<typeof createAppI18n>

// 单例缓存
let i18nCache: AppI18nReturn | null = null

function createAppI18n() {
  const { t, locale, availableLocales } = useI18n<[I18nSchema], 'en-US' | 'zh-CN'>()
  const router = useRouter()

  // 初始化语言设置
  const savedLang = localStorage.getItem('preferred-language')
  const browserLang = navigator.language

  if (savedLang && ['en-US', 'zh-CN'].includes(savedLang)) {
    locale.value = savedLang as 'en-US' | 'zh-CN'
  } else if (browserLang.startsWith('zh')) {
    locale.value = 'zh-CN'
  } else {
    locale.value = 'en-US'
  }

  // 语言切换功能
  const switchLanguage = (lang: 'en-US' | 'zh-CN') => {
    locale.value = lang
    localStorage.setItem('preferred-language', lang)

    // 更新当前页面的标题
    updatePageTitle()
  }

  // 更新页面标题
  const updatePageTitle = () => {
    const currentRoute = router.currentRoute.value
    if (currentRoute.meta?.title) {
      const title = t(currentRoute.meta.title as string)
      const subtitle = currentRoute.meta.subtitle ? t(currentRoute.meta.subtitle as string) : ''
      document.title = subtitle ? `${subtitle} - ${title}` : title
    }
  }

  // 获取当前语言显示名称
  const getLanguageName = (lang: 'en-US' | 'zh-CN') => {
    return lang === 'zh-CN' ? '中文' : 'English'
  }

  // 获取所有支持的语言选项
  const languageOptions = [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ] as const

  // 安全地处理 availableLocales 类型转换
  const safeAvailableLocales =
    (availableLocales as unknown[]).includes('en-US') &&
    (availableLocales as unknown[]).includes('zh-CN')
      ? (availableLocales as unknown as readonly ['en-US', 'zh-CN'])
      : (['en-US', 'zh-CN'] as const)

  return {
    t,
    locale,
    availableLocales: safeAvailableLocales,
    switchLanguage,
    getLanguageName,
    languageOptions,
    updatePageTitle,
  }
}

export function useAppI18n() {
  if (!i18nCache) {
    i18nCache = createAppI18n()
  }
  return i18nCache
}

export type { I18nSchema }
