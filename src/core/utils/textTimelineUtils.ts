import { reactive } from 'vue'
import { generateUUID4 } from '@/core/utils/idGenerator'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { TextMediaConfig } from '@/core/timelineitem/type'
import type { TextStyleConfig } from '@/core/timelineitem/texttype'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { DEFAULT_TEXT_STYLE } from '@/core/timelineitem/texttype'

/**
 * 统一架构下的文本时间轴工具函数
 * 提供文本项目的创建、管理和操作功能
 * 适配新的统一时间轴项目架构
 */

/**
 * 生成时间轴项目ID
 * 使用统一的UUID4生成器
 * @returns 唯一的时间轴项目ID
 */
export function generateTimelineItemId(): string {
  return generateUUID4()
}

/**
 * 创建文本时间轴项目（统一架构）- 专注于可持久化数据
 *
 * 🏗️ 新架构特性：
 * - ✅ 使用 UnifiedTimelineItemData 类型
 * - ✅ 专注于可持久化保存的部分
 * - ✅ 支持动画配置
 * - ✅ 使用 UUID4 生成器
 * - ✅ 采用 3 状态管理（ready/loading/error）
 * - ✅ 不包含 sprite 生成逻辑，只创建配置信息
 *
 * @param text 文本内容
 * @param style 文本样式配置（部分）
 * @param startTimeFrames 开始时间（帧数）
 * @param trackId 轨道ID
 * @param duration 显示时长（帧数），默认150帧（5秒@30fps）
 * @param videoResolution 视频分辨率配置
 * @param customId 自定义ID（可选）
 * @returns Promise<UnifiedTimelineItemData<'text'>> 统一架构的文本时间轴项目（不含sprite）
 */
export async function createTextTimelineItem(
  text: string,
  style: Partial<TextStyleConfig>,
  startTimeFrames: number,
  trackId: string,
  duration: number = 150,
  videoResolution: { width: number; height: number },
  customId?: string,
): Promise<UnifiedTimelineItemData<'text'>> {
  console.log('🔄 [UnifiedTextTimelineUtils] 开始创建文本时间轴项目（可持久化部分）:', {
    text: text.substring(0, 20) + '...',
    startTimeFrames,
    trackId,
    duration,
    videoResolution,
  })

  try {
    // 1. 验证和补全文本样式
    const completeStyle: TextStyleConfig = {
      ...DEFAULT_TEXT_STYLE,
      ...style,
    }

    // 2. 估算文本尺寸（基于字体大小和文本长度）
    // 使用字体大小作为高度基准，宽度基于字符数估算
    const fontSize = completeStyle.fontSize || 24
    const estimatedWidth = Math.max(text.length * fontSize * 0.6, 100) // 每个字符约0.6倍字体宽度
    const estimatedHeight = fontSize * 1.5 // 行高约为字体大小的1.5倍

    // 3. 计算默认位置（画布中心）
    const canvasWidth = videoResolution.width
    const canvasHeight = videoResolution.height
    const defaultX = (canvasWidth - estimatedWidth) / 2
    const defaultY = (canvasHeight - estimatedHeight) / 2

    // 4. 创建时间范围配置
    const timeRange: UnifiedTimeRange = {
      timelineStartTime: startTimeFrames,
      timelineEndTime: startTimeFrames + duration,
      clipStartTime: -1, // 文本不使用此属性
      clipEndTime: -1, // 文本不使用此属性
    }

    // 5. 创建文本媒体配置（适配新架构）
    const textConfig: TextMediaConfig = {
      // 文本特有属性
      text,
      style: completeStyle,
      // 视觉属性（继承自 VisualMediaProps）
      x: Math.round(defaultX),
      y: Math.round(defaultY),
      width: Math.round(estimatedWidth),
      height: Math.round(estimatedHeight),
      rotation: 0,
      opacity: 1,
      // 等比缩放状态（默认开启）
      proportionalScale: true,
      // 基础属性（继承自 BaseMediaProps）
      zIndex: 1,
    }

    // 6. 创建统一时间轴项目（使用新架构，不包含sprite）
    const timelineItem: UnifiedTimelineItemData<'text'> = reactive({
      id: customId || generateTimelineItemId(),
      mediaItemId: '', // 文本项目不需要媒体库项目，使用空字符串
      trackId,
      mediaType: 'text',
      timeRange,
      config: textConfig,
      animation: undefined, // 新创建的文本项目默认没有动画
      property: {
        config: {
          x: textConfig.x,
          y: textConfig.y,
          width: textConfig.width,
          height: textConfig.height,
          rotation: textConfig.rotation,
          opacity: textConfig.opacity,
          proportionalScale: textConfig.proportionalScale,
          zIndex: textConfig.zIndex,
          text: textConfig.text,
          style: textConfig.style,
        },
        animation: undefined,
      },
      timelineStatus: 'ready', // 文本项目创建后即为就绪状态
      runtime: {}, // 不包含 sprite，需要单独创建
    })

    console.log('✅ [UnifiedTextTimelineUtils] 统一文本时间轴项目创建完成（可持久化部分）:', {
      id: timelineItem.id,
      text: text.substring(0, 20) + '...',
      timeRange: timelineItem.timeRange,
      timelineStatus: timelineItem.timelineStatus,
      hasSprite: false, // 明确标识不包含sprite
      hasAnimation: !!timelineItem.animation,
      config: {
        position: { x: textConfig.x, y: textConfig.y },
        size: { width: textConfig.width, height: textConfig.height },
        style: textConfig.style,
      },
    })

    return timelineItem
  } catch (error) {
    console.error('❌ [UnifiedTextTimelineUtils] 创建文本时间轴项目失败:', error)
    throw new Error(`创建文本项目失败: ${(error as Error).message}`)
  }
}

