import { reactive } from 'vue'
import { TextVisibleSprite } from '@/core/visiblesprite/TextVisibleSprite'
import { webavToProjectCoords, projectToWebavCoords } from '@/core/utils/coordinateUtils'
import { generateUUID4 } from '@/core/utils/idGenerator'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { TextMediaConfig } from '@/core/timelineitem/type'
import type { TextStyleConfig } from '@/core/timelineitem/texttype'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { DEFAULT_TEXT_STYLE } from '@/core/timelineitem/texttype'
import type { TimeRange as TimeRangeN } from '@/core/mediabunny/types'

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
 * 创建文本精灵（统一架构）
 *
 * 专门负责创建和配置文本精灵，包括样式设置、时间范围、位置和坐标转换
 *
 * @param text 文本内容
 * @param style 文本样式配置（部分）
 * @param startTimeFrames 开始时间（帧数）
 * @param duration 显示时长（帧数）
 * @param videoResolution 视频分辨率配置
 * @returns Promise<TextVisibleSprite> 配置完成的文本精灵
 */
export async function createTextSprite(
  text: string,
  style: Partial<TextStyleConfig>,
  startTimeFrames: number,
  duration: number,
  videoResolution: { width: number; height: number },
): Promise<TextVisibleSprite> {
  console.log('🔄 [UnifiedTextTimelineUtils] 开始创建文本精灵:', {
    text: text.substring(0, 20) + '...',
    startTimeFrames,
    duration,
    videoResolution,
  })

  try {
    // 1. 验证和补全文本样式
    const completeStyle = {
      ...DEFAULT_TEXT_STYLE,
      ...style,
    }

    // 2. 创建文本精灵（复用现有TextVisibleSprite）
    const textSprite = await TextVisibleSprite.create(text, completeStyle)
    console.log('✅ [UnifiedTextTimelineUtils] 文本精灵创建成功')

    // 3. 设置时间范围
    textSprite.setTimeRange({
      timelineStartTime: startTimeFrames,
      timelineEndTime: startTimeFrames + duration,
      clipStartTime: -1, // 文本不使用此属性
      clipEndTime: -1, // 文本不使用此属性
    })
    console.log('✅ [UnifiedTextTimelineUtils] 时间范围设置完成:', {
      startTime: startTimeFrames,
      duration: duration,
      endTime: startTimeFrames + duration,
    })

    // 4. 设置默认位置（画布中心）
    const canvasWidth = videoResolution.width
    const canvasHeight = videoResolution.height
    textSprite.rect.x = (canvasWidth - textSprite.rect.w) / 2
    textSprite.rect.y = (canvasHeight - textSprite.rect.h) / 2
    console.log('✅ [UnifiedTextTimelineUtils] 默认位置设置完成:', {
      webavX: textSprite.rect.x,
      webavY: textSprite.rect.y,
      width: textSprite.rect.w,
      height: textSprite.rect.h,
    })

    return textSprite
  } catch (error) {
    console.error('❌ [UnifiedTextTimelineUtils] 创建文本精灵失败:', error)
    throw new Error(`创建文本精灵失败: ${(error as Error).message}`)
  }
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
 * - ⚠️ 不包含 sprite 生成逻辑，需要单独调用 createTextSprite
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
  duration: number = TextVisibleSprite.DEFAULT_DURATION,
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

  let tempSprite: TextVisibleSprite | null = null

  try {
    // 1. 验证和补全文本样式
    const completeStyle = {
      ...DEFAULT_TEXT_STYLE,
      ...style,
    }

    // 2. 创建临时精灵用于获取尺寸信息（仅用于配置生成）
    tempSprite = await TextVisibleSprite.create(text, completeStyle)

    // 3. 计算默认位置（画布中心）
    const canvasWidth = videoResolution.width
    const canvasHeight = videoResolution.height
    const defaultX = (canvasWidth - tempSprite.rect.w) / 2
    const defaultY = (canvasHeight - tempSprite.rect.h) / 2

    // 4. 坐标系转换（WebAV -> 项目坐标系）
    const projectCoords = webavToProjectCoords(
      defaultX,
      defaultY,
      tempSprite.rect.w,
      tempSprite.rect.h,
      canvasWidth,
      canvasHeight,
    )

    // 5. 提取需要的配置信息（在销毁精灵前）
    const spriteConfig = {
      width: tempSprite.rect.w,
      height: tempSprite.rect.h,
      opacity: tempSprite.opacity,
      zIndex: tempSprite.zIndex,
      textStyle: tempSprite.getTextStyle(),
    }

    // 6. 销毁临时精灵，释放资源
    tempSprite.destroy()
    tempSprite = null
    console.log('✅ [UnifiedTextTimelineUtils] 临时精灵已销毁')

    // 7. 创建时间范围配置
    const timeRange: UnifiedTimeRange = {
      timelineStartTime: startTimeFrames,
      timelineEndTime: startTimeFrames + duration,
      clipStartTime: -1, // 文本不使用此属性
      clipEndTime: -1, // 文本不使用此属性
    }
    const timeRangeN: TimeRangeN = {
      timelineStart: BigInt(startTimeFrames),
      timelineEnd: BigInt(startTimeFrames + duration),
      clipStart: -1n,
      clipEnd: -1n,
    }

    // 8. 创建文本媒体配置（适配新架构）
    const textConfig: TextMediaConfig = {
      // 文本特有属性
      text,
      style: spriteConfig.textStyle,
      // 视觉属性（继承自 VisualMediaProps）
      x: Math.round(projectCoords.x),
      y: Math.round(projectCoords.y),
      width: spriteConfig.width,
      height: spriteConfig.height,
      rotation: 0,
      opacity: spriteConfig.opacity,
      // 原始尺寸（对于文本，原始尺寸就是渲染后的尺寸）
      originalWidth: spriteConfig.width,
      originalHeight: spriteConfig.height,
      // 等比缩放状态（默认开启）
      proportionalScale: true,
      // 基础属性（继承自 BaseMediaProps）
      zIndex: spriteConfig.zIndex,
    }

    // 9. 创建统一时间轴项目（使用新架构，不包含sprite）
    const timelineItem: UnifiedTimelineItemData<'text'> = reactive({
      id: customId || generateTimelineItemId(),
      mediaItemId: '', // 文本项目不需要媒体库项目，使用空字符串
      trackId,
      mediaType: 'text',
      timeRange,
      timeRangeN,
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
    // 确保在异常情况下也销毁临时精灵
    if (tempSprite) {
      tempSprite.destroy()
      console.log('⚠️ [UnifiedTextTimelineUtils] 异常情况下销毁临时精灵')
    }
    console.error('❌ [UnifiedTextTimelineUtils] 创建文本时间轴项目失败:', error)
    throw new Error(`创建文本项目失败: ${(error as Error).message}`)
  }
}

/**
 * 为文本时间轴项目创建精灵
 *
 * 根据时间轴项目的配置创建对应的文本精灵
 *
 * @param timelineItem 文本时间轴项目
 * @returns Promise<TextVisibleSprite> 配置完成的文本精灵
 */
export async function createSpriteForTextTimelineItem(
  timelineItem: UnifiedTimelineItemData<'text'>,
): Promise<TextVisibleSprite> {
  console.log('🔄 [UnifiedTextTimelineUtils] 为时间轴项目创建精灵:', {
    id: timelineItem.id,
    text: timelineItem.config.text.substring(0, 20) + '...',
  })

  try {
    // 1. 获取画布分辨率
    const { useUnifiedStore } = await import('@/core/unifiedStore')
    const unifiedStore = useUnifiedStore()
    const canvasWidth = unifiedStore.videoResolution.width
    const canvasHeight = unifiedStore.videoResolution.height

    // 2. 创建文本精灵
    const textSprite = await TextVisibleSprite.create(
      timelineItem.config.text,
      timelineItem.config.style,
    )

    // 3. 设置时间范围
    textSprite.setTimeRange(timelineItem.timeRange)

    // 4. 应用变换属性（使用坐标转换）
    const config = timelineItem.config

    // 使用坐标转换将项目坐标系转换为 WebAV 坐标系
    const webavCoords = projectToWebavCoords(
      config.x,
      config.y,
      config.width,
      config.height,
      canvasWidth,
      canvasHeight,
    )
    textSprite.rect.x = webavCoords.x
    textSprite.rect.y = webavCoords.y

    // 设置尺寸和其他属性
    textSprite.rect.w = config.width
    textSprite.rect.h = config.height
    textSprite.rect.angle = config.rotation
    textSprite.opacity = config.opacity
    textSprite.zIndex = config.zIndex

    console.log('✅ [UnifiedTextTimelineUtils] 精灵创建完成:', {
      id: timelineItem.id,
      position: { x: textSprite.rect.x, y: textSprite.rect.y },
      size: { width: textSprite.rect.w, height: textSprite.rect.h },
      webavCoords,
      projectCoords: { x: config.x, y: config.y },
    })

    return textSprite
  } catch (error) {
    console.error('❌ [UnifiedTextTimelineUtils] 为时间轴项目创建精灵失败:', error)
    throw new Error(`创建精灵失败: ${(error as Error).message}`)
  }
}
