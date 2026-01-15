/**
 * AI 生成配置集合
 * 集中管理所有 AI 生成配置
 */

import QwenImage4StepConfig from './qwen-image-4step.json'
import QwenImageEdit2512Config from './qwen-image-edit-2512.json'
import BLTCYSora2Config from './bltcy-sora2.json'
import NanoBanana2Config from './nano-banana-2.json'
import type { AIGenerateConfig } from '../types'

/**
 * 配置集合
 * 包含所有可用的 AI 生成配置
 */
export const collection = {
  'qwen-image-4step': QwenImage4StepConfig as AIGenerateConfig,
  'qwen-image-edit-2512': QwenImageEdit2512Config as AIGenerateConfig,
  'bltcy-sora2': BLTCYSora2Config as AIGenerateConfig,
  'nano-banana-2': NanoBanana2Config as AIGenerateConfig,
} as const

/**
 * 配置键类型
 */
export type ConfigKey = keyof typeof collection

/**
 * 配置集合类型
 */
export type ConfigCollection = Record<ConfigKey, AIGenerateConfig>