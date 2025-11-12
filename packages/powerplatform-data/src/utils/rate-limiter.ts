/**
 * Rate Limiter Module
 *
 * Implements rate limiting with exponential backoff for PowerPlatform API calls.
 * Prevents API throttling errors (429) and manages concurrent request limits.
 */

export interface RateLimiterOptions {
  maxRequestsPerMinute?: number;
  maxConcurrentRequests?: number;
  retryAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
}

export interface RequestQueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  retryCount: number;
}

/**
 * Rate Limiter Class
 */
export class RateLimiter {
  private options: Required<RateLimiterOptions>;
  private requestTimestamps: number[] = [];
  private activeRequests: number = 0;
  private queue: RequestQueueItem<any>[] = [];
  private processing: boolean = false;

  constructor(options: RateLimiterOptions = {}) {
    this.options = {
      maxRequestsPerMinute: options.maxRequestsPerMinute || 60,
      maxConcurrentRequests: options.maxConcurrentRequests || 10,
      retryAttempts: options.retryAttempts || 3,
      initialBackoffMs: options.initialBackoffMs || 1000,
      maxBackoffMs: options.maxBackoffMs || 60000,
      backoffMultiplier: options.backoffMultiplier || 2
    };
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject,
        retryCount: 0
      });

      this.processQueue();
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Wait if we've hit the concurrent request limit
      while (this.activeRequests >= this.options.maxConcurrentRequests) {
        await this.sleep(100);
      }

      // Wait if we've hit the rate limit
      while (!this.canMakeRequest()) {
        await this.sleep(1000);
      }

      const item = this.queue.shift();
      if (!item) break;

      // Execute the request
      this.executeRequest(item);
    }

    this.processing = false;
  }

  /**
   * Execute a single request with retry logic
   */
  private async executeRequest<T>(item: RequestQueueItem<T>): Promise<void> {
    this.activeRequests++;
    this.recordRequest();

    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error: any) {
      // Check if it's a rate limit error (429)
      const isRateLimitError = this.isRateLimitError(error);

      if (isRateLimitError && item.retryCount < this.options.retryAttempts) {
        // Retry with exponential backoff
        const backoffMs = this.calculateBackoff(item.retryCount);

        console.error(
          `[RATE-LIMITER] Rate limit hit, retrying in ${backoffMs}ms (attempt ${item.retryCount + 1}/${this.options.retryAttempts})`
        );

        await this.sleep(backoffMs);

        // Re-queue the request
        item.retryCount++;
        this.queue.unshift(item);
      } else {
        // Max retries exceeded or non-retriable error
        item.reject(error);
      }
    } finally {
      this.activeRequests--;

      // Continue processing queue
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Check if we can make a request without exceeding rate limits
   */
  private canMakeRequest(): boolean {
    this.cleanupOldTimestamps();
    return this.requestTimestamps.length < this.options.maxRequestsPerMinute;
  }

  /**
   * Record a request timestamp
   */
  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Remove timestamps older than 1 minute
   */
  private cleanupOldTimestamps(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
  }

  /**
   * Calculate backoff time for retry
   */
  private calculateBackoff(retryCount: number): number {
    const backoff = this.options.initialBackoffMs * Math.pow(this.options.backoffMultiplier, retryCount);
    return Math.min(backoff, this.options.maxBackoffMs);
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    // Check for 429 status code
    if (error.status === 429 || error.statusCode === 429) {
      return true;
    }

    // Check for rate limit in error message
    const errorMessage = error.message?.toLowerCase() || '';
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('throttl') ||
      errorMessage.includes('too many requests')
    );
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limiter stats
   */
  getStats(): {
    activeRequests: number;
    queuedRequests: number;
    requestsLastMinute: number;
    maxRequestsPerMinute: number;
    maxConcurrentRequests: number;
    utilizationPercentage: number;
  } {
    this.cleanupOldTimestamps();

    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.queue.length,
      requestsLastMinute: this.requestTimestamps.length,
      maxRequestsPerMinute: this.options.maxRequestsPerMinute,
      maxConcurrentRequests: this.options.maxConcurrentRequests,
      utilizationPercentage: (this.requestTimestamps.length / this.options.maxRequestsPerMinute) * 100
    };
  }

  /**
   * Wait until rate limiter has capacity
   */
  async waitForCapacity(): Promise<void> {
    while (!this.canMakeRequest() || this.activeRequests >= this.options.maxConcurrentRequests) {
      await this.sleep(100);
    }
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    // Reject all queued requests
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.clearQueue();
    this.requestTimestamps = [];
    this.activeRequests = 0;
    this.processing = false;
  }

  /**
   * Update rate limiter options
   */
  updateOptions(options: Partial<RateLimiterOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
  }
}

// Export singleton instance with default settings
export const rateLimiter = new RateLimiter({
  maxRequestsPerMinute: 60,
  maxConcurrentRequests: 10,
  retryAttempts: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 60000,
  backoffMultiplier: 2
});

/**
 * Helper function to wrap API calls with rate limiting
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return rateLimiter.execute(fn);
}

/**
 * Batch execution with rate limiting
 * Processes an array of functions with rate limiting
 */
export async function batchExecute<T>(
  fns: (() => Promise<T>)[],
  options?: {
    onProgress?: (completed: number, total: number) => void;
    onError?: (error: any, index: number) => void;
  }
): Promise<T[]> {
  const results: T[] = [];
  const errors: { index: number; error: any }[] = [];

  for (let i = 0; i < fns.length; i++) {
    try {
      const result = await rateLimiter.execute(fns[i]);
      results.push(result);

      if (options?.onProgress) {
        options.onProgress(i + 1, fns.length);
      }
    } catch (error) {
      errors.push({ index: i, error });

      if (options?.onError) {
        options.onError(error, i);
      }

      // Re-throw if all requests have failed
      if (errors.length === fns.length) {
        throw new Error(`All batch requests failed: ${errors.length} errors`);
      }
    }
  }

  return results;
}
