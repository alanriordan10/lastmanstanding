import fs from 'fs';
import path from 'path';

const dir = 'docs/assets/screenshots';
let bad = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const cards = [...s.matchAll(/<rect x="24" y="(\d+)" width="342" height="(\d+)"/g)].map((m) => ({
    y: +m[1],
    h: +m[2],
  }));
  const tokens = s.match(/<g transform="translate\(([-\d.]+),([-\d.]+)\)">|<\/g>|<rect[^>]*>/g) || [];
  const stack = [{ x: 0, y: 0 }];
  const shapes = [];
  for (const t of tokens) {
    if (t.startsWith('<g')) {
      const m = t.match(/translate\(([-\d.]+),([-\d.]+)\)/);
      const top = stack[stack.length - 1];
      stack.push({ x: top.x + +m[1], y: top.y + +m[2] });
    } else if (t === '</g>') {
      stack.pop();
    } else {
      const g = stack[stack.length - 1];
      const num = (re) => +(t.match(re)?.[1] ?? 0);
      const x = num(/ x="([-\d.]+)"/);
      const y = num(/ y="([-\d.]+)"/);
      const w = num(/ width="([-\d.]+)"/);
      const h = num(/ height="([-\d.]+)"/);
      shapes.push({ x1: g.x + x, y1: g.y + y, x2: g.x + x + w, y2: g.y + y + h, inGroup: stack.length > 1 });
    }
  }
  for (const sh of shapes) {
    if (sh.x1 < 0 || sh.y1 < 0 || sh.x2 > 390 || sh.y2 > 844) {
      console.log(`${f}: outside canvas`, sh);
      bad++;
    }
    if (!sh.inGroup) continue;
    const card = cards.find((c) => sh.y1 >= c.y - 1 && sh.y1 <= c.y + c.h + 1);
    if (!card) {
      console.log(`${f}: no parent card`, sh);
      bad++;
      continue;
    }
    if (sh.y2 > card.y + card.h - 1 || sh.x1 < 23 || sh.x2 > 367) {
      console.log(`${f}: spills card`, sh, card);
      bad++;
    }
  }
}
console.log(bad === 0 ? 'OK: no overflow detected' : `${bad} problems`);

