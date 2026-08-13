import { generateCommandId } from '@/core/utils/idGenerator'
import type { MediaType } from '@/core/mediaitem/types'
import type {
  MusicStructureOverlay,
  UnifiedTimelineItemData,
} from '@/core/timelineitem/model/timelineItem'
import { historyLabels, type HistoryLabel } from '@/core/modules/historyLabel'
import type { SimpleCommand } from './types'

export class UpdateMusicStructureOverlayCommand implements SimpleCommand {
  public readonly id = generateCommandId()
  public readonly historyLabel: HistoryLabel
  private readonly beforeOverlay: MusicStructureOverlay | undefined
  private readonly afterOverlay: MusicStructureOverlay | undefined
  private _isDisposed = false

  constructor(
    private readonly timelineItemId: string,
    beforeOverlay: MusicStructureOverlay | undefined,
    afterOverlay: MusicStructureOverlay | undefined,
    private readonly timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
    },
    historyLabel: HistoryLabel = historyLabels.updateClipProperties(),
  ) {
    this.beforeOverlay = beforeOverlay ? { ...beforeOverlay } : undefined
    this.afterOverlay = afterOverlay ? { ...afterOverlay } : undefined
    this.historyLabel = historyLabel
  }

  async execute(): Promise<void> {
    this.apply(this.afterOverlay)
  }

  async undo(): Promise<void> {
    this.apply(this.beforeOverlay)
  }

  private apply(overlay: MusicStructureOverlay | undefined): void {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }
    item.musicStructureOverlay = overlay ? { ...overlay } : undefined
  }

  get isDisposed(): boolean {
    return this._isDisposed
  }

  dispose(): void {
    this._isDisposed = true
  }
}
