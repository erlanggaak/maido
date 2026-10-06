import type { WebGLRenderer } from 'three';

const enabled = new URLSearchParams(window.location.search).has('profile');
const SAMPLE_LIMIT = 1800;
const WARMUP_MS = 5000;
const STAGES = ['director', 'body', 'effects', 'render', 'total', 'interval'] as const;
type StageName = (typeof STAGES)[number];

/** Opt-in measurements. Times include CPU work and GPU command submission, not GPU execution. */
class FrameProfiler {
  private samples = Object.fromEntries(
    STAGES.map((name) => [name, new Float64Array(SAMPLE_LIMIT)]),
  ) as Record<StageName, Float64Array>;
  private count = 0;
  private startedAt = performance.now();
  private previousFrame = 0;
  private renderer: WebGLRenderer | null = null;
  private model: string | null = null;
  private clips = 0;

  get enabled() {
    return enabled;
  }

  reset() {
    this.count = 0;
    this.previousFrame = 0;
    this.startedAt = performance.now();
  }

  setScene(renderer: WebGLRenderer, model: string | null, clips: number) {
    if (!enabled) return;
    this.renderer = renderer;
    this.model = model;
    this.clips = clips;
    this.reset();
  }

  detach(renderer: WebGLRenderer) {
    if (this.renderer !== renderer) return;
    this.renderer = null;
    this.model = null;
    this.clips = 0;
    this.reset();
  }

  record(times: Record<Exclude<StageName, 'interval'>, number>) {
    if (!enabled) return;
    const now = performance.now();
    if (document.hidden || now - this.startedAt < WARMUP_MS) {
      this.previousFrame = 0;
      return;
    }
    const index = this.count % SAMPLE_LIMIT;
    for (const name of STAGES) {
      if (name !== 'interval') this.samples[name][index] = times[name];
    }
    this.samples.interval[index] = this.previousFrame ? now - this.previousFrame : 0;
    this.previousFrame = now;
    this.count++;
  }

  snapshot() {
    const count = Math.min(this.count, SAMPLE_LIMIT);
    const timings = Object.fromEntries(
      STAGES.map((name) => {
        const values = Array.from(this.samples[name].subarray(0, count))
          .filter((value) => name !== 'interval' || value > 0)
          .sort((a, b) => a - b);
        const average = values.reduce((total, value) => total + value, 0) / (values.length || 1);
        const percentile = (p: number) =>
          values[Math.max(0, Math.ceil(values.length * p) - 1)] || 0;
        return [
          name,
          {
            averageMs: average,
            p50Ms: percentile(0.5),
            p95Ms: percentile(0.95),
            maxMs: values.at(-1) || 0,
          },
        ];
      }),
    ) as Record<StageName, { averageMs: number; p50Ms: number; p95Ms: number; maxMs: number }>;
    const renderer = this.renderer;
    return {
      sampleFrames: count,
      warmupMs: WARMUP_MS,
      visible: !document.hidden,
      model: this.model,
      clips: this.clips,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: renderer?.getPixelRatio(),
      },
      observedFps: timings.interval.averageMs ? 1000 / timings.interval.averageMs : 0,
      timings,
      drawCalls: renderer?.info.render.calls,
      triangles: renderer?.info.render.triangles,
      geometries: renderer?.info.memory.geometries,
      textures: renderer?.info.memory.textures,
      shaderPrograms: renderer?.info.programs?.length,
    };
  }
}

export const frameProfiler = new FrameProfiler();
if (enabled) Object.assign(window, { maidoPerformance: frameProfiler });
