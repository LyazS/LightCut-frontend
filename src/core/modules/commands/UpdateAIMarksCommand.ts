import { generateCommandId } from '@/core/utils/idGenerator'
import { cloneAIMarks } from '@/core/utils/timelineMarkerUtils'
import type { SimpleCommand } from './types'
import type { AIMarks, UnifiedTimelineItemData } from '@/core/timelineitem/model/timelineItem'
import type { MediaType } from '@/core/mediaitem/types'
import { historyLabels, type HistoryLabel } from '@/core/modules/historyLabel'

export class UpdateAIMarksCommand implements SimpleCommand {
  public readonly id: string
  public readonly historyLabel: HistoryLabel
  private readonly beforeAIMarks: AIMarks | undefined
  private readonly afterAIMarks: AIMarks | undefined
  private _isDisposed = false

  constructor(
    private readonly timelineItemId: string,
    beforeAIMarks: AIMarks | undefined,
    afterAIMarks: AIMarks | undefined,
    private readonly timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
    },
    historyLabel: HistoryLabel = historyLabels.generateAIMarks(),
  ) {
    this.id = generateCommandId()
    this.beforeAIMarks = cloneAIMarks(beforeAIMarks)
    this.afterAIMarks = cloneAIMarks(afterAIMarks)
    this.historyLabel = historyLabel
  }

  async execute(): Promise<void> {
    this.apply(this.afterAIMarks)
  }

  async undo(): Promise<void> {
    this.apply(this.beforeAIMarks)
  }

  private apply(aiMarks: AIMarks | undefined): void {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }
    item.aiMarks = cloneAIMarks(aiMarks)
  }

  get isDisposed(): boolean {
    return this._isDisposed
  }

  dispose(): void {
    this._isDisposed = true
  }
}
