/**
 * AI 生成配置集合
 * 集中管理所有 AI 生成配置
 */

import QwenImage4StepConfig from './qwen-image-4step.json'
import QwenImageEdit2512Config from './qwen-image-edit-2512.json'
import BLTCYSora2Config from './bltcy-sora2.json'
import NanoBanana2Config from './nano-banana-2.json'
import RunningHubSora2Config from './runninghub-sora2.json'
import RunningHubRhTestConfig from './runninghub-rh-test.json'
import RunningHubImageNProConfig from './rhart-image-n-pro.json'
import RunningHubVideoSConfig from './rhart-video-s.json'
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
  'sora2-hd': RunningHubSora2Config as AIGenerateConfig,
  'rh-test': RunningHubRhTestConfig as AIGenerateConfig,
  'rhart-image-n-pro': RunningHubImageNProConfig as AIGenerateConfig,
  'rhart-video-s': RunningHubVideoSConfig as AIGenerateConfig,
} as const

/**
 * 配置键类型
 */
export type ConfigKey = keyof typeof collection

/**
 * 配置集合类型
 */
export type ConfigCollection = Record<ConfigKey, AIGenerateConfig>
