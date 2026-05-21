export class Semaphore {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.running--;
    }
  }
}
