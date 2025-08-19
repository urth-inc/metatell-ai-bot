/**
 * Event queue for batching UI updates
 */
export class EventQueue<T> {
  private queue: T[] = []
  private scheduled = false

  constructor(private readonly onFlush: (batch: T[]) => void) {}

  push(event: T): void {
    this.queue.push(event)
    if (!this.scheduled) {
      this.scheduled = true
      setImmediate(() => {
        const batch = this.queue.splice(0)
        this.scheduled = false
        this.onFlush(batch)
      })
    }
  }

  size(): number {
    return this.queue.length
  }

  clear(): void {
    this.queue = []
  }
}
