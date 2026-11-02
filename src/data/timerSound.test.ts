import { afterEach, describe, expect, it, vi } from "vitest";
import { playTimerEndSound } from "./timerSound";

describe("playTimerEndSound", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plays a short two-tone notification", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const oscillator = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start,
      stop,
    };
    const gain = {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    vi.stubGlobal("AudioContext", class {
      currentTime = 0;
      destination = {};
      createOscillator = () => oscillator;
      createGain = () => gain;
      close = vi.fn();
    });

    expect(playTimerEndSound()).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
