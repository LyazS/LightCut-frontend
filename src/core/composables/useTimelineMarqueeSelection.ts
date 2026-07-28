import type { Ref } from 'vue'
import { LayoutConstants } from '@/constants/LayoutConstants'
import { useMarqueeSelection } from '@/core/composables/useMarqueeSelection'
import { useUnifiedStore } from '@/core/unifiedStore'
import { buildClipSelectionId, type TimelineSelectionId } from '@/core/types/timelineSelection'

/** Adapts the shared marquee engine to timeline clips. */
export function useTimelineMarqueeSelection(timelineBody: Ref<HTMLElement | undefined>) {
  const unifiedStore = useUnifiedStore()

  const marqueeSelection = useMarqueeSelection<TimelineSelectionId>({
    root: timelineBody,
    getCandidateElements: (body) =>
      Array.from(
        body.querySelectorAll<HTMLElement>('.unified-timeline-clip[data-timeline-item-id]'),
      ),
    getCandidateId: (element) => {
      const timelineItemId = element.dataset.timelineItemId
      return timelineItemId ? buildClipSelectionId(timelineItemId) : null
    },
    getSelectedIds: () => unifiedStore.selectedTimelineSelectionIds,
    applySelection: (ids) => unifiedStore.selectTimelineSelections(ids, 'replace'),
    canStart: (event) => event.target === event.currentTarget,
    getLocalPoint: (point, body) => {
      const bounds = body.getBoundingClientRect()
      return {
        x: Math.min(
          Math.max(point.clientX - bounds.left, LayoutConstants.TRACK_CONTROL_WIDTH),
          bounds.width,
        ),
        y: Math.min(Math.max(point.clientY - bounds.top, 0), bounds.height),
      }
    },
  })

  return {
    ...marqueeSelection,
    consumeTrackContentClick: marqueeSelection.consumeClick,
  }
}
