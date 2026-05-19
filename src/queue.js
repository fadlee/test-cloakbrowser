// Simple serial queue: ensures only one task runs at a time.
// New tasks wait for the current task to finish before starting.

export class SerialQueue {
  constructor() {
    this._tail = Promise.resolve();
  }

  /**
   * Enqueue a task. Returns a promise that resolves with the task's result
   * (or rejects with its error). Tasks always run in submission order.
   *
   * @param {() => Promise<any>} task
   * @returns {Promise<any>}
   */
  run(task) {
    const result = this._tail.then(() => task());
    // Swallow errors on the chain so one failure doesn't break the queue,
    // but propagate them on the returned promise.
    this._tail = result.catch(() => {});
    return result;
  }
}
