/**
 * A history entry can become invalid when a non-history operation changes the same resource.
 * The history module handles this as a warning and discards only the invalid entry.
 */
export class HistoryPreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HistoryPreconditionError'
  }
}
