import { IEventBus, EventHandler } from '../interfaces/IEventBus'

export class EventBus implements IEventBus {
  private events = new Map<string, Set<EventHandler>>()

  on<T = any>(event: string, handler: EventHandler<T>): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event)!.add(handler)
  }

  off<T = any>(event: string, handler: EventHandler<T>): void {
    const handlers = this.events.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.events.delete(event)
      }
    }
  }

  emit<T = any>(event: string, data?: T): void {
    const handlers = this.events.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          const result = handler(data)
          if (result instanceof Promise) {
            result.catch(error => {
              console.error(`Error in event handler for "${event}":`, error)
            })
          }
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error)
        }
      })
    }
  }

  once<T = any>(event: string, handler: EventHandler<T>): void {
    const wrappedHandler: EventHandler<T> = (data) => {
      this.off(event, wrappedHandler)
      return handler(data)
    }
    this.on(event, wrappedHandler)
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event)
    } else {
      this.events.clear()
    }
  }
}