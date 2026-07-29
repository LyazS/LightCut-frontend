import { generateCommandId } from '@/core/utils/idGenerator'
import type { SimpleCommand } from '@/core/modules/commands/types'
import type { UnifiedTrackData } from '@/core/track/TrackTypes'
import { historyLabels } from '@/core/modules/historyLabel'

/**
 * 切换轨道静音命令
 * 支持切换轨道静音状态的撤销/重做操作
 * 同时同步该轨道上所有时间轴项目的音频状态
 */
export class ToggleTrackMuteCommand implements SimpleCommand {
  public readonly id: string
  public readonly historyLabel: ReturnType<typeof historyLabels.muteTrack>
  private previousMuteState: boolean // 保存切换前的静音状态
  private targetMuteState?: boolean // 外部指定的目标静音状态
  private _isDisposed = false

  constructor(
    private trackId: string,
    private trackModule: {
      getTrack: (trackId: string) => UnifiedTrackData | undefined
      toggleTrackMute: (trackId: string, targetMuteState?: boolean) => Promise<void>
    },
    targetMuteState?: boolean, // 外部传入的静音设置（可选）
  ) {
    this.id = generateCommandId()
    this.targetMuteState = targetMuteState

    // 获取轨道信息
    const track = this.trackModule.getTrack(trackId)
    if (!track) {
      throw new Error(`找不到轨道: ${trackId}`)
    }

    this.previousMuteState = track.isMuted
    this.targetMuteState = targetMuteState

    // 确定最终的目标状态：如果有外部指定则使用，否则切换当前状态
    const finalTargetState = targetMuteState !== undefined ? targetMuteState : !track.isMuted
    this.historyLabel = finalTargetState
      ? historyLabels.muteTrack(track.name)
      : historyLabels.unmuteTrack(track.name)

    console.log(
      `📋 准备切换轨道静音状态: ${track.name}, 当前状态: ${track.isMuted ? '静音' : '有声'}, 目标状态: ${finalTargetState ? '静音' : '有声'}`,
    )
  }

  /**
   * 执行命令：切换轨道静音状态
   */
  async execute(): Promise<void> {
    try {
      const track = this.trackModule.getTrack(this.trackId)
      if (!track) {
        throw new Error(`轨道不存在: ${this.trackId}`)
      }

      console.log(`🔄 执行切换轨道静音状态操作: ${track.name}...`)

      // 始终使用确定性的目标状态（即使未外部传入，也在构造函数中确定了切换后的状态）
      const targetState =
        this.targetMuteState !== undefined ? this.targetMuteState : !this.previousMuteState

      await this.trackModule.toggleTrackMute(this.trackId, targetState)

      const newMuteState = track.isMuted
      console.log(`✅ 已切换轨道静音状态: ${track.name}, 新状态: ${newMuteState ? '静音' : '有声'}`)
    } catch (error) {
      const track = this.trackModule.getTrack(this.trackId)
      console.error(`❌ 切换轨道静音状态失败: ${track?.name || `轨道 ${this.trackId}`}`, error)
      throw error
    }
  }

  /**
   * 撤销命令：恢复轨道的原始静音状态
   */
  async undo(): Promise<void> {
    try {
      const track = this.trackModule.getTrack(this.trackId)
      if (!track) {
        throw new Error(`轨道不存在: ${this.trackId}`)
      }

      console.log(`🔄 撤销切换轨道静音状态操作：恢复轨道 ${track.name} 的原始状态...`)

      // 如果当前状态与原始状态不同，则再次切换
      if (track.isMuted !== this.previousMuteState) {
        // 撤销时始终使用原始状态作为目标状态，确保完全恢复
        await this.trackModule.toggleTrackMute(this.trackId, this.previousMuteState)
      }

      console.log(
        `↩️ 已撤销切换轨道静音状态: ${track.name}, 恢复状态: ${this.previousMuteState ? '静音' : '有声'}`,
      )
    } catch (error) {
      const track = this.trackModule.getTrack(this.trackId)
      console.error(`❌ 撤销切换轨道静音状态失败: ${track?.name || `轨道 ${this.trackId}`}`, error)
      throw error
    }
  }

  /**
   * 检查命令是否已被清理
   */
  get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * 清理命令持有的资源
   */
  dispose(): void {
    if (this._isDisposed) {
      return
    }

    this._isDisposed = true
    console.log(`🗑️ [ToggleTrackMuteCommand] 命令资源已清理: ${this.id}`)
  }
}
