import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The repo has no DOM test library, so client views are rendered with
// renderToStaticMarkup and a small hook runtime that keeps state between passes
// and runs effects. `hooksModule` is used from vi.mock('react', ...) in a test;
// `renderClient` renders, runs effects, waits for the fetches, and renders again
// until the view stops changing. Fetch is always stubbed by the test (fixtures only).
type Cleanup = void | (() => void);
type EffectSlot = { deps?: unknown[]; cleanup?: Cleanup };
type StateSlot = { box: { value: unknown }; set: (next: unknown) => void };

let slots: unknown[] = [];
let index = 0;
let dirty = false;
let queue: Array<() => void> = [];

const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

export function hooksModule(actual: typeof import('react')): typeof import('react') {
  const useState = (initial: unknown) => {
    const at = index++;
    if (!(at in slots)) {
      const box = { value: typeof initial === 'function' ? (initial as () => unknown)() : initial };
      const set = (next: unknown) => {
        const value = typeof next === 'function' ? (next as (v: unknown) => unknown)(box.value) : next;
        if (!Object.is(value, box.value)) { box.value = value; dirty = true; }
      };
      slots[at] = { box, set } satisfies StateSlot;
    }
    const { box, set } = slots[at] as StateSlot;
    return [box.value, set];
  };
  const useRef = (initial: unknown) => {
    const at = index++;
    if (!(at in slots)) slots[at] = { current: initial };
    return slots[at];
  };
  const useEffect = (run: () => Cleanup, deps?: unknown[]) => {
    const at = index++;
    const previous = slots[at] as EffectSlot | undefined;
    if (previous && same(previous.deps, deps)) return;
    const entry: EffectSlot = previous || (slots[at] = {});
    queue.push(() => {
      if (typeof entry.cleanup === 'function') entry.cleanup();
      entry.cleanup = run();
    });
    entry.deps = deps;
  };
  const useMemo = (make: () => unknown) => { index++; return make(); };
  const useCallback = (fn: unknown) => { index++; return fn; };
  return { ...actual, useState, useRef, useEffect, useMemo, useCallback } as unknown as typeof import('react');
}

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };

export async function renderClient(View: ComponentType): Promise<string> {
  slots = []; dirty = false; queue = [];
  let html = '';
  for (let pass = 0; pass < 10; pass++) {
    index = 0;
    html = renderToStaticMarkup(<View />);
    const pending = queue; queue = [];
    pending.forEach((run) => run());
    await settle();
    if (!pending.length && !dirty) break;
    dirty = false;
  }
  return html;
}
