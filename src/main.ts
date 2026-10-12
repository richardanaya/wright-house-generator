import { generatePlan } from './grammar/plan';
import { paramsFromSearch } from './params';
import { createView } from './scene';
import { createHud } from './ui';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
if (!canvas) throw new Error('missing canvas');

const view = createView(canvas);
const initial = paramsFromSearch(window.location.search);

const hud = createHud(initial, (params, frame) => {
  const plan = generatePlan(params);
  view.show(plan, frame);
  hud.setPlan(plan);
});

const first = generatePlan(hud.current());
view.show(first, true);
hud.setPlan(first);
