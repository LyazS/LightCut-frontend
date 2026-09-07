import { generateCommandId } from '@/core/utils/idGenerator'
import type { MediaType } from '@/core/mediaitem/types'
import type {
  TimelineAnchorSource,
  UnifiedTimelineItemData,
} from '@/core/timelineitem/model/timelineItem'
import { historyLabels, type HistoryLabel } from '@/core/modules/historyLabel'
import type { SimpleCommand } from './types'

export class UpdateTimelineAnchorSourceCommand implements SimpleCommand {
  public readonly id = generateCommandId()
  public readonly historyLabel: HistoryLabel
  private _isDisposed = false

  constructor(
    private readonly timelineItemId: string,
    private readonly beforeSource: TimelineAnchorSource | undefined,
    private readonly afterSource: TimelineAnchorSource | undefined,
    private readonly timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
    },
    historyLabel: HistoryLabel = historyLabels.updateClipProperties(),
  ) {
    this.historyLabel = historyLabel
  }

  async execute(): Promise<void> {
    this.apply(this.afterSource)
  }

  async undo(): Promise<void> {
    this.apply(this.beforeSource)
  }

  private apply(source: TimelineAnchorSource | undefined): void {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }
    item.anchorSource = source
  }

  get isDisposed(): boolean {
    return this._isDisposed
  }

  dispose(): void {
    this._isDisposed = true
  }
}
