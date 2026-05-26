import type { NekoEvent, NekoEventType, EventOfType } from './types.js'

export type EventHandler<T extends NekoEventType> = (event: EventOfType<T>) => void | Promise<void>

export type Unsubscribe = () => void

export interface EventBus {
  emit<T extends NekoEventType>(event: EventOfType<T>): void
  on<T extends NekoEventType>(type: T, handler: EventHandler<T>): Unsubscribe
  once<T extends NekoEventType>(type: T, handler: EventHandler<T>): Unsubscribe
  off<T extends NekoEventType>(type: T, handler: EventHandler<T>): void
  /** Remove all listeners, optionally for one event type */
  clear(type?: NekoEventType): void
}

export class DefaultEventBus implements EventBus {
  // Store handlers as unknown to avoid the generic dance at the map level
  private readonly handlers = new Map<string, Set<EventHandler<NekoEventType>>>()

  private bucket(type: string): Set<EventHandler<NekoEventType>> {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    return set
  }

  emit<T extends NekoEventType>(event: EventOfType<T>): void {
    const bucket = this.handlers.get(event.type)
    if (!bucket) return
    for (const handler of bucket) {
      // Fire-and-forget async handlers; errors are surfaced via unhandledRejection
      void Promise.resolve(handler(event as never))
    }
  }

  on<T extends NekoEventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    this.bucket(type).add(handler as unknown as EventHandler<NekoEventType>)
    return () => this.off(type, handler)
  }

  once<T extends NekoEventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    const wrapper: EventHandler<T> = (event) => {
      this.off(type, wrapper)
      return handler(event)
    }
    return this.on(type, wrapper)
  }

  off<T extends NekoEventType>(type: T, handler: EventHandler<T>): void {
    this.handlers.get(type)?.delete(handler as unknown as EventHandler<NekoEventType>)
  }

  clear(type?: NekoEventType): void {
    if (type) {
      this.handlers.delete(type)
    } else {
      this.handlers.clear()
    }
  }
}

/** Convenience factory used by session / manager instances */
export function createEventBus(): EventBus {
  return new DefaultEventBus()
}
