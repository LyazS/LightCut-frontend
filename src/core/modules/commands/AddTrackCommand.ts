/**
 * 添加轨道命令
 * 支持添加轨道的撤销/重做操作
 * 采用简单的添加/删除逻辑，不涉及WebAV对象重建
 */

import { generateCommandId } from '@/core/utils/idGenerator'
import type { SimpleCommand } from '@/core/modules/commands/types'

// ==================== 新架构类型导入 ====================
import type { UnifiedTrackData, UnifiedTrackType } from '@/core/track/TrackTypes'
import { createUnifiedTrackData } from '@/core/track/TrackTypes'
import { i18n } from '@/locales'

/**
 * 添加轨道命令
 * 支持添加轨道的撤销/重做操作
 * 采用简单的添加/删除逻辑，不涉及WebAV对象重建
 */
export class AddTrackCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  private newTrackId: string | undefined = undefined // 新创建的轨道ID
  private trackData: UnifiedTrackData // 保存轨道数据

  constructor(
    private trackType: UnifiedTrackType, // 轨道类型
    private position: number | undefined, // 插入位置（可选）
    private trackModule: {
      addTrack: (trackData: UnifiedTrackData, position?: number) => UnifiedTrackData
      removeTrack: (trackId: string) => Promise<void>
      getTrack: (trackId: string) => UnifiedTrackData | undefined
    },
  ) {
    this.id = generateCommandId()

    // 根据轨道类型获取i18n翻译名称
    const trackTypeName = i18n.global.t(`timeline.${trackType}Track`)
    this.description = `添加轨道: ${trackTypeName}${position !== undefined ? ` (位置: ${position})` : ''}`

    // 在构造函数中创建完整的轨道数据，使用i18n名称
    this.trackData = createUnifiedTrackData(trackType, {
      name: trackTypeName,
    })

    this.newTrackId = this.trackData.id
  }

  /**
   * 执行命令：添加轨道
   */
  async execute(): Promise<void> {
    try {
      console.log(`🔄 执行添加轨道操作...`)

      // 调用trackModule的addTrack方法，传入预先创建好的轨道数据和位置参数
      const newTrack = this.trackModule.addTrack(this.trackData, this.position)

      // 保存轨道数据用于撤销（此时轨道数据已经完整）
      this.newTrackId = newTrack.id

      console.log(
        `✅ 已添加轨道: ${newTrack.name} (ID: ${newTrack.id}, 类型: ${newTrack.type}, 位置: ${this.position ?? '末尾'})`,
      )
    } catch (error) {
      console.error(`❌ 添加轨道失败: ${this.trackType}轨道`, error)
      throw error
    }
  }

  /**
   * 撤销命令：删除添加的轨道
   */
  async undo(): Promise<void> {
    try {
      console.log(`🔄 撤销添加轨道操作：删除轨道 ${this.trackData.name}...`)

      // 删除添加的轨道
      // 注意：这里传入空的timelineItems和回调，因为新添加的轨道上不应该有任何项目
      if (this.newTrackId) {
        await this.trackModule.removeTrack(this.newTrackId)
        console.log(`↩️ 已撤销添加轨道: ${this.trackData.name}`)
      } else {
        throw new Error(`无法撤销添加轨道操作：轨道ID不存在 (轨道名称: ${this.trackData.name})`)
      }
    } catch (error) {
      console.error(`❌ 撤销添加轨道失败: ${this.trackData.name}`, error)
      throw error
    }
  }
}
