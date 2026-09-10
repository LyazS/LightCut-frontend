import { ref, computed } from 'vue'
import { accountClient } from '@/utils/accountClient'
import { ModuleRegistry, MODULE_NAMES } from '@/core/modules/ModuleRegistry'
import { useAppI18n } from '@/core/composables/useI18n'
import type { UnifiedUseNaiveUIModule } from '@/core/modules/UnifiedUseNaiveUIModule'
import type { User, LoginResponse, RegisterResponse } from '@/utils/types'
import { formatMoneyForDisplay } from '@/utils/money'

// 重新导出类型以供其他模块使用
export type {
  User,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/utils/types'

type UserModuleError = Error & {
  status?: number
}

type BalanceInfo = Pick<User, 'balance'>

// LocalStorage 键名常量
const BIZYAIR_API_KEY_STORAGE_KEY = 'bizyair_api_key'

/**
 * 统一用户管理模块
 * 基于新架构统一类型系统的用户管理，提供用户认证和状态管理功能
 */
export function createUnifiedUserModule(registry: ModuleRegistry) {
  // 通过注册中心获取依赖模块
  const useNaiveUIModule = registry.get<UnifiedUseNaiveUIModule>(MODULE_NAMES.USENAIVEUI)

  // 获取国际化函数
  const { t } = useAppI18n()

  // ==================== 状态定义 ====================

  // 当前登录用户
  const currentUser = ref<User | null>(null)

  // 登录加载状态
  const isLoggingIn = ref(false)

  // 注册加载状态
  const isRegistering = ref(false)

  // 激活码使用加载状态
  const isUsingActivationCode = ref(false)

  // BizyAir API Key（响应式状态，初始化时从 localStorage 加载）
  const bizyairApiKey = ref<string>(getBizyAirApiKey())
  let refreshBalancePromise: Promise<void> | null = null
  let authStateEpoch = 0

  // ==================== 计算属性 ====================

  /**
   * 用户是否已登录
   */
  const isLoggedIn = computed(() => !!currentUser.value)

  /**
   * 用户名显示
   */
  const username = computed(() => currentUser.value?.username || '')

  // ==================== 私有方法 ====================

  /** Keep account data in memory; browser cookies hold the session credentials. */
  function saveUserData(user: User): void {
    currentUser.value = user
  }

  function toUserModuleError(error: unknown): UserModuleError {
    if (error instanceof Error) {
      return error as UserModuleError
    }
    return new Error(String(error))
  }

  /** Restore the server-backed session without exposing credentials to JavaScript. */
  async function loadUserData(): Promise<void> {
    const expectedEpoch = authStateEpoch
    try {
      const [user, wallet] = await Promise.all([accountClient.currentUser(), accountClient.getBalance()])
      if (expectedEpoch === authStateEpoch) saveUserData({ ...user, balance: wallet.balance })
    } catch {
      if (expectedEpoch === authStateEpoch) clearUserData()
    }
  }

  /**
   * 清除用户数据
   */
  function clearUserData(): void {
    currentUser.value = null
  }

  /** Refresh only the balance shown in the shared user state. */
  async function refreshBalance(): Promise<void> {
    if (!currentUser.value) {
      return
    }
    if (refreshBalancePromise) {
      return refreshBalancePromise
    }

    const userAtRequest = currentUser.value
    const balanceAtRequest = userAtRequest.balance
    refreshBalancePromise = (async () => {
      try {
        const response: BalanceInfo = await accountClient.getBalance()
        if (currentUser.value !== userAtRequest) {
          return
        }

        // Do not overwrite a newer balance update that happened while this request was in flight.
        if (currentUser.value.balance !== balanceAtRequest) {
          return
        }
        saveUserData({ ...currentUser.value, balance: response.balance })
      } catch {
        // The existing balance remains visible when a background refresh fails.
      } finally {
        refreshBalancePromise = null
      }
    })()

    return refreshBalancePromise
  }

  // ==================== 用户认证方法 ====================

  /**
   * 用户登录
   */
  async function login(username: string, password: string): Promise<LoginResponse> {
    try {
      isLoggingIn.value = true
      authStateEpoch += 1
      const response = await accountClient.login({ username, password })
      const wallet = await accountClient.getBalance()
      saveUserData({ ...response.user, balance: wallet.balance })
      useNaiveUIModule.messageSuccess(t('user.loginSuccess') + response.user.username)
      return response
    } catch (error: unknown) {
      const userError = toUserModuleError(error)
      const errorMessage = userError.message || t('user.loginFailed')
      useNaiveUIModule.messageError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      isLoggingIn.value = false
    }
  }

  /**
   * 用户注册
   */
  async function register(username: string, password: string): Promise<RegisterResponse> {
    try {
      isRegistering.value = true
      const response = await accountClient.register({ username, password })
      useNaiveUIModule.messageSuccess(t('user.registerSuccess'))
      return response
    } catch (error: unknown) {
      const userError = toUserModuleError(error)
      const errorMessage = userError.message || t('user.registerFailed')
      useNaiveUIModule.messageError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      isRegistering.value = false
    }
  }

  /**
   * 用户登出
   */
  async function logout(): Promise<void> {
    try {
      authStateEpoch += 1
      await accountClient.logout()
    } finally {
      clearUserData()
      useNaiveUIModule.messageSuccess(t('user.logoutSuccess'))
    }
  }

  /**
   * 获取当前用户信息
   */
  function getCurrentUser(): User | null {
    return currentUser.value
  }

  /**
   * 检查用户是否已登录
   */
  function checkLoginStatus(): boolean {
    return isLoggedIn.value
  }

  /**
   * 使用激活码充值
   */
  async function useActivationCode(code: string): Promise<void> {
    try {
      isUsingActivationCode.value = true
      const response = await accountClient.redeemActivationCode(code.trim())
      useNaiveUIModule.messageSuccess(
        t('user.activationCodeSuccess', {
          amount: formatMoneyForDisplay(response.amount),
          balance: formatMoneyForDisplay(response.current_balance),
        }),
      )

      if (currentUser.value) {
        saveUserData({ ...currentUser.value, balance: response.current_balance })
      }
    } catch (error: unknown) {
      const userError = toUserModuleError(error)
      if (userError.status === 400 || userError.status === 422 || userError.status === 409) {
        useNaiveUIModule.messageError(userError.message || t('user.activationCodeInvalid'))
      } else if (userError.status === 401) {
        useNaiveUIModule.messageError(t('user.activationCodeUnauthorized'))
      } else {
        useNaiveUIModule.messageError(userError.message || t('user.activationCodeError'))
      }

      throw new Error(userError.message || t('user.activationCodeError'))
    } finally {
      isUsingActivationCode.value = false
    }
  }

  // ==================== BizyAir API Key 管理 ====================

  /**
   * 保存 BizyAir API Key 到 localStorage
   * 注意：这个方法只保存到 localStorage，不更新响应式状态
   * 因为 v-model 已经直接修改了 bizyairApiKey.value
   */
  function saveBizyAirApiKey(apiKey: string): void {
    const trimmedKey = apiKey.trim()
    localStorage.setItem(BIZYAIR_API_KEY_STORAGE_KEY, trimmedKey)
  }

  /**
   * 从 localStorage 获取 BizyAir API Key
   */
  function getBizyAirApiKey(): string {
    return localStorage.getItem(BIZYAIR_API_KEY_STORAGE_KEY) || ''
  }

  /**
   * 清除 BizyAir API Key
   */
  function clearBizyAirApiKey(): void {
    localStorage.removeItem(BIZYAIR_API_KEY_STORAGE_KEY)
    bizyairApiKey.value = ''
  }

  /**
   * 检查 BizyAir API Key 是否已配置
   */
  function hasBizyAirApiKey(): boolean {
    return bizyairApiKey.value.length > 0
  }

  // ==================== 初始化 ====================

  // 模块初始化时加载用户数据
  let initializationPromise: Promise<void> | null = null

  /**
   * 初始化用户模块
   */
  function initialize(): Promise<void> {
    if (!initializationPromise) {
      initializationPromise = loadUserData()
    }
    return initializationPromise
  }

  // 立即开始初始化，但不阻塞模块创建
  initialize()

  // ==================== 导出接口 ====================

  return {
    // 状态
    currentUser,
    isLoggingIn,
    isRegistering,
    isUsingActivationCode,
    bizyairApiKey,

    // 计算属性
    isLoggedIn,
    username,

    // 用户认证方法
    login,
    register,
    logout,

    // 用户信息获取
    getCurrentUser,
    checkLoginStatus,
    refreshBalance,

    // 激活码功能
    useActivationCode,

    // BizyAir API Key 管理
    saveBizyAirApiKey,
    getBizyAirApiKey,
    clearBizyAirApiKey,
    hasBizyAirApiKey,

    // 初始化
    initialize,
  }
}

// 导出类型定义
export type UnifiedUserModule = ReturnType<typeof createUnifiedUserModule>
