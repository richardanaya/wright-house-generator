import { describePlan } from './grammar/plan';
import { clampParams, paramsToQuery } from './params';
import type { HousePlan, Params, Style } from './types';

export interface Hud {
  setPlan(plan: HousePlan): void;
  current(): Params;
}

export function createHud(initial: Params, onChange: (params: Params, frame: boolean) => void): Hud {
  const seedInput = required<HTMLInputElement>('#seed');
  const regenerate = required<HTMLButtonElement>('#regenerate');
  const size = required<HTMLInputElement>('#size');
  const wings = required<HTMLInputElement>('#wings');
  const overhang = required<HTMLInputElement>('#overhang');
  const readout = required<HTMLParagraphElement>('#readout');
  const subtitle = required<HTMLParagraphElement>('#subtitle');
  const planCanvas = required<HTMLCanvasElement>('#plan');
  const styleButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-style]')];

  let params = clampParams(initial);
  syncControls(params);

  const emit = (frame: boolean) => {
    params = readControls();
    const url = new URL(window.location.href);
    url.search = paramsToQuery(params);
    history.replaceState(null, '', url);
    onChange(params, frame);
  };

  seedInput.addEventListener('change', () => emit(true));
  regenerate.addEventListener('click', () => {
    seedInput.value = String(1 + Math.floor(Math.random() * 999_999_998));
    emit(true);
  });
  for (const input of [size, wings, overhang]) {
    input.addEventListener('input', () => {
      required<HTMLOutputElement>(`#${input.id}-value`).value =
        input.id === 'wings' ? input.value : Number(input.value).toFixed(input.id === 'size' ? 2 : 1);
      emit(false);
    });
  }
  for (const button of styleButtons) {
    button.addEventListener('click', () => {
      params = { ...readControls(), style: button.dataset.style as Style };
      syncControls(params);
      emit(true);
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r' && event.target === document.body) {
      regenerate.click();
    }
  });

  return {
    setPlan(plan) {
      const text = describePlan(plan);
      readout.textContent = text;
      subtitle.textContent = plan.style === 'prairie'
        ? 'Hearth, then a pinwheel of low hips.'
        : 'One hearth, a flat parasol roof, a carport.';
      if (plan.planType === 'l') subtitle.textContent = plan.style === 'prairie' ? 'An L of stucco under a low hip.' : 'An L around the masonry core.';
      if (plan.planType === 't') subtitle.textContent = 'A T grown off the chimney mass.';
      if (plan.planType === 'cruciform') subtitle.textContent = 'Four wings, centered on the hearth.';
      drawPlan(planCanvas, plan);
      document.title = `${text} · ${plan.seed}`;
    },
    current: () => readControls(),
  };

  function readControls(): Params {
    return clampParams({
      seed: Number(seedInput.value),
      style: styleButtons.find((button) => button.getAttribute('aria-pressed') === 'true')?.dataset.style as Style,
      size: Number(size.value),
      wings: Number(wings.value),
      overhang: Number(overhang.value),
    });
  }

  function syncControls(next: Params): void {
    seedInput.value = String(next.seed);
    size.value = String(next.size);
    wings.value = String(next.wings);
    overhang.value = String(next.overhang);
    for (const button of styleButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.style === next.style));
    }
    required<HTMLOutputElement>('#size-value').value = next.size.toFixed(2);
    required<HTMLOutputElement>('#wings-value').value = String(next.wings);
    required<HTMLOutputElement>('#overhang-value').value = next.overhang.toFixed(1);
  }
}

function drawPlan(canvas: HTMLCanvasElement, plan: HousePlan): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const pad = 10;
  const bounds = plan.plinth;
  const scale = Math.min((width - pad * 2) / bounds.w, (height - pad * 2) / bounds.d);
  const ox = (width - bounds.w * scale) / 2;
  const oy = (height - bounds.d * scale) / 2;
  const map = (x: number, z: number) => ({
    x: ox + (x - bounds.x) * scale,
    y: height - (oy + (z - bounds.z) * scale),
  });
  const rect = (x: number, z: number, w: number, d: number, fill: string) => {
    const a = map(x, z + d);
    ctx.fillStyle = fill;
    ctx.fillRect(a.x, a.y, w * scale, d * scale);
  };
  rect(bounds.x, bounds.z, bounds.w, bounds.d, 'rgba(232, 224, 210, 0.35)');
  for (const terrace of plan.terraces) rect(terrace.x, terrace.z, terrace.w, terrace.d, '#8ea584');
  for (const volume of plan.volumes) {
    if (volume.kind === 'upper') continue;
    const fill = volume.kind === 'hearth' ? '#8d4034' : volume.kind === 'carport' ? '#c4a36a' : '#e7d7c3';
    rect(volume.x, volume.z, volume.w, volume.d, fill);
  }
  const hearth = plan.volumes.find((volume) => volume.kind === 'hearth');
  if (hearth && plan.volumes.some((volume) => volume.kind === 'upper')) {
    rect(hearth.x + 1.2, hearth.z + 1.2, hearth.w - 2.4, hearth.d - 2.4, '#6e3228');
  }
  ctx.strokeStyle = 'rgba(40, 28, 20, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(map(bounds.x, bounds.z + bounds.d).x, map(bounds.x, bounds.z + bounds.d).y, bounds.w * scale, bounds.d * scale);
}

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}
