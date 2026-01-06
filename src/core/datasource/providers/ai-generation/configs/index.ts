/**
 * AI 生成配置集合
 * 集中管理所有 AI 生成配置
 */

import QwenImage4StepConfig from './qwen-image-4step.json'
import QwenImageI2IConfig from './qwen-image-i2i.json'
import QwenImageEdit2512Config from './qwen-image-edit-2512-2image.json'
import type { AIGenerateConfig } from '../types'

/**
 * 配置集合
 * 包含所有可用的 AI 生成配置
 */
export const collection = {
  'qwen-image-4step': QwenImage4StepConfig as AIGenerateConfig,
  'qwen-image-i2i': QwenImageI2IConfig as AIGenerateConfig,
  'qwen-image-edit-2512-2image': QwenImageEdit2512Config as AIGenerateConfig,
} as const

/**
 * 配置键类型
 */
export type ConfigKey = keyof typeof collection

/**
 * 配置集合类型
 */
export type ConfigCollection = Record<ConfigKey, AIGenerateConfig>