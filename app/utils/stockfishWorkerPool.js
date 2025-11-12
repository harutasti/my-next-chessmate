const STOCKFISH_PATH = "/stockfish/stockfish-nnue-16-single.js";

function parseInfoMessage(message) {
  const parts = message.split(" ");
  const info = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    switch (part) {
      case "depth":
        info.depth = parseInt(parts[++i], 10);
        break;
      case "nodes":
        info.nodes = parseInt(parts[++i], 10);
        break;
      case "nps":
        info.nps = parseInt(parts[++i], 10);
        break;
      case "score":
        {
          const scoreType = parts[++i];
          if (scoreType === "cp") {
            info.evaluation = parseInt(parts[++i], 10) / 100;
          } else if (scoreType === "mate") {
            info.evaluation = `M${parts[++i]}`;
          }
        }
        break;
      default:
        break;
    }
  }

  return Object.keys(info).length > 0 ? info : null;
}

class StockfishWorkerController {
  constructor({ thinkingTime = 1000, depth = 15, skillLevel = 20, timeoutMs = 5000 } = {}) {
    this.thinkingTime = thinkingTime;
    this.depth = depth;
    this.skillLevel = Math.max(1, Math.min(20, skillLevel));
    this.timeoutMs = timeoutMs;
    this.worker = null;
    this.ready = false;
    this.readyPromise = null;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.currentEvaluation = null;
    this.currentDepth = 0;
    this.timeoutHandle = null;
  }

  async init() {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      throw new Error("Stockfish Worker is only available in browser environments.");
    }

    this.worker = new Worker(STOCKFISH_PATH);

    this.readyPromise = new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const message = event.data;

        if (message === "uciok") {
          this.ready = true;
          this.worker.postMessage(`setoption name Skill Level value ${this.skillLevel}`);
          if (this.skillLevel >= 20) {
            this.worker.postMessage("setoption name Skill Level Maximum Error value 0");
            this.worker.postMessage("setoption name Skill Level Probability value 0");
          }
          resolve();
          this.worker.onerror = (error) => {
            if (this.pendingReject) {
              const reject = this.pendingReject;
              this.pendingReject = null;
              this.pendingResolve = null;
              reject(error);
            } else {
              console.error('Stockfish worker error:', error);
            }
          };
          return;
        }

        // pass through to general handler after ready
        this._handleWorkerMessage(message);
      };

      this.worker.onmessage = (event) => {
        const message = event.data;
        if (!this.ready) {
          handleMessage(event);
        } else {
          this._handleWorkerMessage(message);
        }
      };

      this.worker.onerror = (error) => {
        reject(error);
      };

      this.worker.postMessage("uci");
    });

    await this.readyPromise;
  }

  _handleWorkerMessage(message) {
    if (!message) return;

    if (typeof message === "string" && message.startsWith("info")) {
      const info = parseInfoMessage(message);
      if (info?.evaluation !== undefined) {
        this.currentEvaluation = info.evaluation;
      }
      if (info?.depth !== undefined) {
        this.currentDepth = info.depth;
      }
      return;
    }

    if (typeof message === "string" && message.startsWith("bestmove")) {
      const [, move] = message.split(" ");
      this._resolveCurrentJob(move || null, false);
    }
  }

  _resolveCurrentJob(bestMove, timedOut) {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    if (!this.pendingResolve) return;

    const result = {
      evaluation: this.currentEvaluation,
      bestMove,
      depth: this.currentDepth,
      timedOut,
    };
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.pendingReject = null;
    resolve(result);
  }

  async analyze(fen) {
    await this.readyPromise;

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.currentEvaluation = null;
      this.currentDepth = 0;

      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      this.worker.postMessage("ucinewgame");
      this.worker.postMessage(`position fen ${fen}`);

      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
      }

      this.timeoutHandle = setTimeout(() => {
        this.worker.postMessage("stop");
        this._resolveCurrentJob(null, true);
      }, this.timeoutMs + this.thinkingTime);

      if (this.depth) {
        this.worker.postMessage(`go depth ${this.depth} movetime ${this.thinkingTime}`);
      } else {
        this.worker.postMessage(`go movetime ${this.thinkingTime}`);
      }
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export class StockfishWorkerPool {
  constructor({ size = 4, thinkingTime = 1000, depth = 15, skillLevel = 20, timeoutMs = 5000 } = {}) {
    this.size = Math.max(1, size);
    this.controllers = [];
    this.options = { thinkingTime, depth, skillLevel, timeoutMs };
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    const controllers = [];
    for (let i = 0; i < this.size; i++) {
      const controller = new StockfishWorkerController(this.options);
      await controller.init();
      controllers.push(controller);
    }
    this.controllers = controllers;
    this.initialized = true;
  }

  async analyzeBatch(jobs, { onProgress } = {}) {
    if (!this.initialized) {
      await this.init();
    }

    const results = new Array(jobs.length);
    let nextJobIndex = 0;
    let completed = 0;
    let activeControllers = this.controllers.length;

    if (jobs.length === 0) return results;

    return new Promise((resolve, reject) => {
      const assignJob = (controller) => {
        if (nextJobIndex >= jobs.length) {
          activeControllers -= 1;
          if (activeControllers === 0) {
            resolve(results);
          }
          return;
        }

        const jobIndex = nextJobIndex++;
        const job = jobs[jobIndex];

        controller
          .analyze(job.fen)
          .then((res) => {
            results[jobIndex] = { ...res, job };
            completed += 1;
            if (onProgress) {
              onProgress(completed, jobs.length);
            }
            assignJob(controller);
          })
          .catch((error) => {
            reject(error);
          });
      };

      this.controllers.forEach((controller) => assignJob(controller));
    });
  }

  terminate() {
    this.controllers.forEach((controller) => controller.terminate());
    this.controllers = [];
    this.initialized = false;
  }
}

export { StockfishWorkerController };
