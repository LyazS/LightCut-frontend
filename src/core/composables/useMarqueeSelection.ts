import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  triggerRef,
  type CSSProperties,
  type Ref,
} from 'vue'

export interface MarqueePoint {
  x: number
  y: number
}

export interface MarqueeSelectionRect {
  left: number
  top: number
  width: number
  height: number
}

export type MarqueeSelectionMode = 'replace' | 'toggle'

interface ClientPoint {
  clientX: number
  clientY: number
}

interface MarqueeSession<Id extends string> {
  pointerId: number
  pointerTarget: HTMLElement
  startPoint: MarqueePoint
  currentPoint: MarqueePoint
  clientPoint: ClientPoint
  isSelecting: boolean
  initialSelection: Set<Id>
  selectionMode: MarqueeSelectionMode
  candidateElements: HTMLElement[] | null
}

export interface UseMarqueeSelectionOptions<Id extends string> {
  root: Ref<HTMLElement | undefined>
  getCandidateElements: (root: HTMLElement) => HTMLElement[]
  getCandidateId: (element: HTMLElement) => Id | null
  getSelectedIds: () => ReadonlySet<Id>
  applySelection: (ids: Id[]) => void
  canStart?: (event: PointerEvent) => boolean
  getLocalPoint?: (point: ClientPoint, root: HTMLElement) => MarqueePoint
}

const MINIMUM_DRAG_DISTANCE = 4

/**
 * Generic Pointer-based marquee selection. Domain adapters provide the target
 * elements, IDs, and store updates while this composable owns event recovery.
 */
export function useMarqueeSelection<Id extends string>(options: UseMarqueeSelectionOptions<Id>) {
  const marqueeSession = shallowRef<MarqueeSession<Id> | null>(null)
  const suppressNextClick = ref(false)
  let selectionUpdateFrame: number | undefined

  const isPointerActive = computed(() => marqueeSession.value !== null)
  const isSelecting = computed(() => marqueeSession.value?.isSelecting ?? false)

  const marqueeRect = computed<MarqueeSelectionRect | null>(() => {
    const session = marqueeSession.value
    if (!session?.isSelecting) {
      return null
    }

    const left = Math.min(session.startPoint.x, session.currentPoint.x)
    const top = Math.min(session.startPoint.y, session.currentPoint.y)

    return {
      left,
      top,
      width: Math.abs(session.currentPoint.x - session.startPoint.x),
      height: Math.abs(session.currentPoint.y - session.startPoint.y),
    }
  })

  const marqueeStyle = computed<CSSProperties>(() => {
    const rect = marqueeRect.value
    if (!rect) return {}

    return {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    }
  })

  function getLocalPoint(point: ClientPoint, root: HTMLElement): MarqueePoint {
    if (options.getLocalPoint) {
      return options.getLocalPoint(point, root)
    }

    const bounds = root.getBoundingClientRect()
    return {
      x: Math.min(Math.max(point.clientX - bounds.left, 0), bounds.width),
      y: Math.min(Math.max(point.clientY - bounds.top, 0), bounds.height),
    }
  }

  function hasExceededDragThreshold(start: MarqueePoint, current: MarqueePoint): boolean {
    return Math.hypot(current.x - start.x, current.y - start.y) >= MINIMUM_DRAG_DISTANCE
  }

  function intersects(selectionRect: DOMRect, candidateRect: DOMRect): boolean {
    return (
      selectionRect.left < candidateRect.right &&
      selectionRect.right > candidateRect.left &&
      selectionRect.top < candidateRect.bottom &&
      selectionRect.bottom > candidateRect.top
    )
  }

  function cacheCandidateElements(session: MarqueeSession<Id>, root: HTMLElement) {
    session.candidateElements = options.getCandidateElements(root)
  }

  function getIntersectingIds(
    session: MarqueeSession<Id>,
    root: HTMLElement,
    rect: MarqueeSelectionRect,
  ): Id[] {
    const rootRect = root.getBoundingClientRect()
    const selectionRect = new DOMRect(
      rootRect.left + rect.left,
      rootRect.top + rect.top,
      rect.width,
      rect.height,
    )

    return (session.candidateElements ?? []).flatMap((element) => {
      const id = options.getCandidateId(element)
      if (
        !element.isConnected ||
        !id ||
        !intersects(selectionRect, element.getBoundingClientRect())
      ) {
        return []
      }

      return [id]
    })
  }

  function resolveNextSelection(session: MarqueeSession<Id>, intersectingIds: Id[]): Set<Id> {
    const nextSelection = new Set<Id>(
      session.selectionMode === 'replace' ? intersectingIds : session.initialSelection,
    )

    if (session.selectionMode === 'toggle') {
      intersectingIds.forEach((id) => {
        if (nextSelection.has(id)) {
          nextSelection.delete(id)
        } else {
          nextSelection.add(id)
        }
      })
    }

    return nextSelection
  }

  function setsEqual(first: ReadonlySet<Id>, second: ReadonlySet<Id>): boolean {
    return first.size === second.size && Array.from(first).every((id) => second.has(id))
  }

  function applyMarqueeSelection(
    session: MarqueeSession<Id>,
    root: HTMLElement,
    rect: MarqueeSelectionRect,
  ) {
    if (!session.candidateElements) {
      cacheCandidateElements(session, root)
    }

    const nextSelection = resolveNextSelection(session, getIntersectingIds(session, root, rect))
    if (!setsEqual(nextSelection, options.getSelectedIds())) {
      options.applySelection(Array.from(nextSelection))
    }
  }

  function scheduleSelectionUpdate(session: MarqueeSession<Id>, root: HTMLElement) {
    if (selectionUpdateFrame !== undefined) {
      return
    }

    selectionUpdateFrame = window.requestAnimationFrame(() => {
      selectionUpdateFrame = undefined
      const rect = marqueeRect.value
      if (marqueeSession.value === session && rect) {
        applyMarqueeSelection(session, root, rect)
      }
    })
  }

  function cancelScheduledSelectionUpdate() {
    if (selectionUpdateFrame === undefined) {
      return
    }

    window.cancelAnimationFrame(selectionUpdateFrame)
    selectionUpdateFrame = undefined
  }

  function clearSession() {
    cancelScheduledSelectionUpdate()
    marqueeSession.value = null
  }

  function updateSessionPoint(session: MarqueeSession<Id>, point: ClientPoint, root: HTMLElement) {
    session.clientPoint = { clientX: point.clientX, clientY: point.clientY }
    session.currentPoint = getLocalPoint(session.clientPoint, root)
    triggerRef(marqueeSession)
  }

  function completeSelection(session: MarqueeSession<Id>, root: HTMLElement) {
    const rect = marqueeRect.value
    const didSelect = Boolean(rect)

    if (rect) {
      cancelScheduledSelectionUpdate()
      applyMarqueeSelection(session, root, rect)
    }

    const pointerTarget = session.pointerTarget
    const pointerId = session.pointerId
    if (didSelect) {
      suppressNextClick.value = true
    }
    clearSession()

    if (pointerTarget.hasPointerCapture(pointerId)) {
      pointerTarget.releasePointerCapture(pointerId)
    }
  }

  function abortSelection(pointerId?: number) {
    const session = marqueeSession.value
    if (!session || (pointerId !== undefined && session.pointerId !== pointerId)) {
      return
    }

    if (!setsEqual(session.initialSelection, options.getSelectedIds())) {
      options.applySelection(Array.from(session.initialSelection))
    }

    const pointerTarget = session.pointerTarget
    const capturedPointerId = session.pointerId
    clearSession()

    if (pointerTarget.hasPointerCapture(capturedPointerId)) {
      pointerTarget.releasePointerCapture(capturedPointerId)
    }
  }

  function handlePointerDown(event: PointerEvent) {
    const root = options.root.value
    const pointerTarget = event.currentTarget as HTMLElement
    if (
      !root ||
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      (options.canStart ? !options.canStart(event) : event.target !== pointerTarget)
    ) {
      return
    }

    abortSelection()
    const startPoint = getLocalPoint(event, root)
    marqueeSession.value = {
      pointerId: event.pointerId,
      pointerTarget,
      startPoint,
      currentPoint: startPoint,
      clientPoint: { clientX: event.clientX, clientY: event.clientY },
      isSelecting: false,
      initialSelection: new Set(options.getSelectedIds()),
      selectionMode: event.ctrlKey || event.metaKey ? 'toggle' : 'replace',
      candidateElements: null,
    }
    pointerTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function handlePointerMove(event: PointerEvent) {
    const session = marqueeSession.value
    const root = options.root.value
    if (!session || !root || session.pointerId !== event.pointerId) {
      return
    }

    updateSessionPoint(session, event, root)
    if (
      !session.isSelecting &&
      hasExceededDragThreshold(session.startPoint, session.currentPoint)
    ) {
      session.isSelecting = true
      cacheCandidateElements(session, root)
      triggerRef(marqueeSession)
    }

    if (session.isSelecting) {
      event.preventDefault()
      scheduleSelectionUpdate(session, root)
    }
  }

  function handlePointerUp(event: PointerEvent) {
    const session = marqueeSession.value
    const root = options.root.value
    if (!session || !root || session.pointerId !== event.pointerId) {
      return
    }

    updateSessionPoint(session, event, root)
    completeSelection(session, root)
  }

  function handlePointerCancel(event: PointerEvent) {
    abortSelection(event.pointerId)
  }

  function handleLostPointerCapture(event: PointerEvent) {
    const session = marqueeSession.value
    const root = options.root.value
    if (!session || !root || session.pointerId !== event.pointerId) {
      return
    }

    completeSelection(session, root)
  }

  function refreshPointerPosition() {
    const session = marqueeSession.value
    const root = options.root.value
    if (!session || !root || !session.isSelecting) {
      return
    }

    updateSessionPoint(session, session.clientPoint, root)
    scheduleSelectionUpdate(session, root)
  }

  function handleWindowBlur() {
    abortSelection()
  }

  function handleWindowPointerDown() {
    suppressNextClick.value = false
  }

  function consumeClick(): boolean {
    if (!suppressNextClick.value) {
      return false
    }

    suppressNextClick.value = false
    return true
  }

  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('pointerdown', handleWindowPointerDown, true)

  onScopeDispose(() => {
    abortSelection()
    cancelScheduledSelectionUpdate()
    window.removeEventListener('blur', handleWindowBlur)
    window.removeEventListener('pointerdown', handleWindowPointerDown, true)
  })

  return {
    marqueeRect,
    marqueeStyle,
    isPointerActive,
    isSelecting,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    refreshPointerPosition,
    consumeClick,
  }
}
