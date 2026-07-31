import { generateCommandId } from '@/core/utils/idGenerator'
import { cloneTimelineMarkers, normalizeTimelineMarkers } from '@/core/utils/timelineMarkerUtils'
import type { SimpleCommand } from './types'
import type { TimelineMarker, UnifiedTimelineItemData } from '@/core/timelineitem/model/timelineItem'
import type { MediaType } from '@/core/mediaitem/types'
import { historyLabels, type HistoryLabel } from '@/core/modules/historyLabel'

export class UpdateTimelineMarkersCommand implements SimpleCommand {
  public readonly id: string
  public readonly historyLabel: HistoryLabel
  private readonly beforeMarkers: TimelineMarker[]
  private readonly afterMarkers: TimelineMarker[]
  private _isDisposed = false

  constructor(
    private readonly timelineItemId: string,
    beforeMarkers: TimelineMarker[] | undefined,
    afterMarkers: TimelineMarker[] | undefined,
    private readonly timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
    },
    historyLabel?: HistoryLabel,
  ) {
    this.id = generateCommandId()
    this.beforeMarkers = normalizeTimelineMarkers(beforeMarkers)
    this.afterMarkers = normalizeTimelineMarkers(afterMarkers)
    this.historyLabel =
      historyLabel ??
      (this.afterMarkers.length > this.beforeMarkers.length
        ? historyLabels.addMarker()
        : historyLabels.removeMarker())
  }

  async execute(): Promise<void> {
    this.apply(this.afterMarkers)
  }

  async undo(): Promise<void> {
    this.apply(this.beforeMarkers)
  }

  private apply(markers: TimelineMarker[]): void {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }
    item.markers = cloneTimelineMarkers(markers)
  }

  get isDisposed(): boolean {
    return this._isDisposed
  }

  dispose(): void {
    this._isDisposed = true
  }
}
