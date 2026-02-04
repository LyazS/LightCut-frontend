/**
 * BizyAir 配置管理器
 *
 * 集中管理所有 BizyAir 配置组的选择器和请求构建器
 * 提供统一的配置查找和构建器获取接口
 *
 * 功能：
 * 1. 导入所有配置组的选择器和构建器
 * 2. 根据 task_config['id'] 查找对应的选择器
 * 3. 如果找不到匹配的选择器，使用默认选择器
 * 4. 根据配置组查找对应的请求构建器
 */

import type { BizyAirAppConfig } from './types'

// ==================== 配置选择器导入 ====================

// 默认配置组（作为 fallback）
import { selectConfig as defaultSelectConfig } from './configs/default/configSelector'


// ==================== 请求构建器导入 ====================

// 导入 BizyAir 请求构建器类
import { BizyAirRequestBuilder } from './BizyAirRequestBuilder'

// ==================== 配置选择器类型定义 ====================

/**
 * 配置选择器函数类型
 */
type ConfigSelector = (taskConfig: Record<string, any>) => BizyAirAppConfig

/**
 * 请求构建器函数类型
 */
type RequestBuilder = (
  taskConfig: Record<string, any>,
  appConfig: BizyAirAppConfig
) => Record<string, any>

/**
 * 默认请求构建器
 *
 * 使用 BizyAirRequestBuilder 类的 build 方法
 */
const defaultRequestBuilder: RequestBuilder = (
  taskConfig: Record<string, any>,
  appConfig: BizyAirAppConfig
): Record<string, any> => {
  return BizyAirRequestBuilder.build(taskConfig, appConfig)
}

// ==================== 配置管理器实现 ====================

export class BizyAirConfigManager {
  /**
   * 选择器映射表
   * key: 配置组 ID (task_config['id'])
   * value: 配置选择器函数
   */
  private static selectorMap: Map<string, ConfigSelector> = new Map([
    // Default configuration is the fallback selector
  ])

  /**
   * 构建器映射表
   * key: 配置组 ID
   * value: 请求构建器函数
   *
   * 注意：由于所有配置组都使用相同的 BizyAirRequestBuilder.build() 方法，
   * 只是参数预处理不同，因此这里存储的是各个配置组的自定义构建器函数
   */
  private static builderMap: Map<string, RequestBuilder> = new Map([
    // All configurations now use the default builder
  ])

  /**
   * 默认选择器（当找不到匹配的配置组时使用）
   */
  private static defaultSelector: ConfigSelector = defaultSelectConfig

  /**
   * 默认构建器（当找不到匹配的构建器时使用）
   */
  private static defaultBuilder: RequestBuilder = defaultRequestBuilder

  /**
   * 初始化状态
   */
  private static initialized = false

  /**
   * 初始化配置管理器
   *
   * 在应用启动时调用，用于加载所有配置组
   * 由于使用静态导入，此方法主要用于验证配置完整性
   *
   * @throws Error 如果配置验证失败
   */
  static async initialize(): Promise<void> {
    if (BizyAirConfigManager.initialized) {
      console.warn('[BizyAirConfigManager] 已经初始化，跳过重复初始化')
      return
    }

    console.log('[BizyAirConfigManager] 开始初始化...')

    try {
      // 验证选择器映射表
      if (BizyAirConfigManager.selectorMap.size === 0) {
        console.error('[BizyAirConfigManager] 选择器映射表为空')
      } else {
        console.log(
          `[BizyAirConfigManager] 已加载 ${BizyAirConfigManager.selectorMap.size} 个配置选择器`
        )
      }

      // 验证构建器映射表
      if (BizyAirConfigManager.builderMap.size === 0) {
        console.warn('[BizyAirConfigManager] 构建器映射表为空')
      } else {
        console.log(
          `[BizyAirConfigManager] 已加载 ${BizyAirConfigManager.builderMap.size} 个请求构建器`
        )
      }

      // 记录已注册的配置组
      const registeredIds = Array.from(BizyAirConfigManager.selectorMap.keys())
      console.log('[BizyAirConfigManager] 已注册的配置组:', registeredIds.join(', '))

      BizyAirConfigManager.initialized = true
      console.log('[BizyAirConfigManager] 初始化完成')
    } catch (error) {
      console.error('[BizyAirConfigManager] 初始化失败:', error)
      throw error
    }
  }

  /**
   * 获取配置
   *
   * 根据 task_config['id'] 查找对应的选择器，并返回配置
   * 如果找不到匹配的选择器，使用默认选择器
   *
   * @param taskConfig - 任务配置，必须包含 'id' 字段
   * @returns BizyAir 应用配置
   * @throws Error 如果选择器抛出错误
   */
  static getConfig(taskConfig: Record<string, any>): BizyAirAppConfig {
    if (!BizyAirConfigManager.initialized) {
      console.warn('[BizyAirConfigManager] 未初始化，尝试自动初始化')
      BizyAirConfigManager.initialize().catch((err) => {
        console.error('[BizyAirConfigManager] 自动初始化失败:', err)
      })
    }

    const configId = taskConfig['id']

    if (!configId) {
      console.warn('[BizyAirConfigManager] task_config 中缺少 id 字段，使用默认选择器')
      return BizyAirConfigManager.defaultSelector(taskConfig)
    }

    // 查找对应的选择器
    const selector = BizyAirConfigManager.selectorMap.get(configId)

    if (selector) {
      try {
        console.log(`[BizyAirConfigManager] 使用配置组: ${configId}`)
        return selector(taskConfig)
      } catch (error) {
        console.error(`[BizyAirConfigManager] 配置组 ${configId} 的选择器执行失败:`, error)
        throw error
      }
    }

    // 找不到匹配的选择器，使用默认选择器
    console.warn(
      `[BizyAirConfigManager] 未找到配置组 ${configId}，使用默认选择器`
    )
    return BizyAirConfigManager.defaultSelector(taskConfig)
  }

  /**
   * 获取请求构建器
   *
   * 根据 task_config['id'] 查找对应的请求构建器
   * 如果找不到匹配的构建器，返回默认构建器
   *
   * @param taskConfig - 任务配置，必须包含 'id' 字段
   * @returns 请求构建器函数，永远不会返回 null
   */
  static getRequestBuilder(taskConfig: Record<string, any>): RequestBuilder {
    if (!BizyAirConfigManager.initialized) {
      console.warn('[BizyAirConfigManager] 未初始化，尝试自动初始化')
      BizyAirConfigManager.initialize().catch((err) => {
        console.error('[BizyAirConfigManager] 自动初始化失败:', err)
      })
    }

    const configId = taskConfig['id']

    if (!configId) {
      console.warn('[BizyAirConfigManager] task_config 中缺少 id 字段，使用默认构建器')
      return BizyAirConfigManager.defaultBuilder
    }

    // 查找对应的构建器
    const builder = BizyAirConfigManager.builderMap.get(configId)

    if (builder) {
      console.log(`[BizyAirConfigManager] 使用构建器: ${configId}`)
      return builder
    }

    // 找不到匹配的构建器，使用默认构建器
    console.warn(
      `[BizyAirConfigManager] 未找到构建器 ${configId}，使用默认构建器`
    )
    return BizyAirConfigManager.defaultBuilder
  }

  /**
   * 获取所有已注册的配置组 ID
   *
   * @returns 配置组 ID 列表
   */
  static getRegisteredConfigIds(): string[] {
    return Array.from(BizyAirConfigManager.selectorMap.keys())
  }

  /**
   * 检查是否支持指定的配置组
   *
   * @param configId - 配置组 ID
   * @returns 是否支持
   */
  static hasConfigId(configId: string): boolean {
    return BizyAirConfigManager.selectorMap.has(configId)
  }

  /**
   * 重置初始化状态（主要用于测试）
   */
  static reset(): void {
    BizyAirConfigManager.initialized = false
  }
}
