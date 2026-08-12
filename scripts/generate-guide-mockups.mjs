#!/usr/bin/env node
/**
 * Generates the guide mockup SVGs used by docs/how-to-use-app-and-web.md.
 *
 * Layout is computed (not hand-placed) so that card outlines always wrap their
 * content: cards are auto-sized from their children, chips wrap inside the card
 * padding, and long labels are truncated to the available width.
 *
 * Usage: node scripts/generate-guide-mockups.mjs
 */
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(repoRoot, 'docs', 'assets', 'screenshots');
// The web guide (/guide) serves its own copy from the Vite public folder.
const publicOutDir = path.join(repoRoot, 'frontend', 'public', 'guide', 'screenshots');

const W = 390;
const H = 844;
const PAGE_PAD = 24;
const CARD_W = W - PAGE_PAD * 2;
const CARD_GAP = 16;
const FONT = 'Inter, Arial, sans-serif';

const SURFACE = {
  slate: { fill: '#151f31', stroke: '#2b3a55' },
  deep: { fill: '#101827', stroke: '#223047' },
  sky: { fill: '#082f49', stroke: '#0ea5e9' },
  teal: { fill: '#0f172a', stroke: '#155e75' },
  violet: { fill: '#171827', stroke: '#7c3aed' },
  blue: { fill: '#101827', stroke: '#2563eb' },
  amber: { fill: '#241804', stroke: '#b45309' },
  input: { fill: '#0b1220', stroke: '#334155' },
};

const CHIP = {
  neutral: { fill: '#111827', stroke: '#334155', text: '#cbd5e1' },
  sky: { fill: '#0f2a3d', stroke: '#38bdf8', text: '#bae6fd' },
  green: { fill: '#052e1a', stroke: '#16a34a', text: '#bbf7d0' },
  amber: { fill: '#3a2605', stroke: '#f59e0b', text: '#fde68a' },
  cyan: { fill: '#063344', stroke: '#22d3ee', text: '#a5f3fc' },
  red: { fill: '#3f1414', stroke: '#ef4444', text: '#fecaca' },
  violet: { fill: '#1e1b4b', stroke: '#7c3aed', text: '#ddd6fe' },
  primary: { fill: '#0ea5e9', stroke: '#38bdf8', text: '#05202f' },
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const charW = (size, weight) => size * (weight >= 800 ? 0.56 : 0.5);
const textWidth = (s, size, weight = 700) => String(s).length * charW(size, weight);

function fit(s, maxW, size, weight = 700) {
  const per = charW(size, weight);
  const max = Math.floor(maxW / per);
  const str = String(s);
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(1, max - 1)).trimEnd()}...`;
}

/** Greedy word wrap into at most `maxLines` lines. */
function wrap(s, maxW, size, weight, maxLines = 3) {
  const words = String(s).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, weight) <= maxW || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines.map((l) => fit(l, maxW, size, weight));
}

/** Shrink font size until the string fits, down to a floor. */
function shrinkToFit(s, maxW, size, weight, min = 12) {
  let current = size;
  while (current > min && textWidth(s, current, weight) > maxW) current -= 1;
  return current;
}

function text(x, y, s, { size = 15, weight = 700, fill = '#f8fafc', anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}

function box(x, y, w, h, r, surface) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${surface.fill}" stroke="${surface.stroke}" stroke-width="2"/>`;
}

function chip(x, y, label, tone = 'neutral', { size = 14, height = 34, minW = 0 } = {}) {
  const c = CHIP[tone] ?? CHIP.neutral;
  const w = Math.max(minW, Math.round(textWidth(label, size, 900) + 28));
  const out =
    box(x, y, w, height, height / 2, c) +
    text(x + w / 2, y + height / 2 + size * 0.36, label, { size, weight: 900, fill: c.text, anchor: 'middle' });
  return { svg: out, width: w, height };
}

/* ------------------------------------------------------------------ *
 * Element renderers: each returns { svg, height } in local card coords
 * ------------------------------------------------------------------ */
const ELEMENTS = {
  eyebrow: (el, w) => ({
    svg: text(0, 12, fit(el.text.toUpperCase(), w, 13, 900), { size: 13, weight: 900, fill: el.color ?? '#67e8f9' }),
    height: 16,
  }),
  title: (el, w) => {
    const size = shrinkToFit(el.text, w, el.size ?? 22, 900, 14);
    return {
      svg: text(0, size * 0.82, fit(el.text, w, size, 900), { size, weight: 900, fill: el.color ?? '#f8fafc' }),
      height: Math.round(size * 1.08),
    };
  },
  body: (el, w) => {
    const size = el.size ?? 14;
    const lines = wrap(el.text, w, size, 700, el.maxLines ?? 2);
    const lineH = Math.round(size * 1.35);
    const svg = lines
      .map((line, i) => text(0, size * 0.85 + i * lineH, line, { size, weight: 700, fill: el.color ?? '#94a3b8' }))
      .join('');
    return { svg, height: (lines.length - 1) * lineH + Math.round(size * 1.25) };
  },
  field: (el, w) => {
    const h = 42;
    return {
      svg: box(0, 0, w, h, 12, el.tone === 'sky' ? SURFACE.sky : SURFACE.input) +
        text(16, h / 2 + 5, fit(el.text, w - 32, 14, 700), {
          size: 14,
          weight: el.tone === 'sky' ? 900 : 700,
          fill: el.tone === 'sky' ? '#bae6fd' : '#94a3b8',
        }),
      height: h,
    };
  },
  chips: (el, w) => {
    const size = el.size ?? 14;
    const height = el.height ?? 34;
    const gap = 10;
    let x = 0;
    let y = 0;
    let out = '';
    for (const item of el.items) {
      const label = fit(item.label, w - 28, size, 900);
      const probe = chip(0, 0, label, item.tone, { size, height });
      if (x > 0 && x + probe.width > w) {
        x = 0;
        y += height + gap;
      }
      out += chip(x, y, label, item.tone, { size, height }).svg;
      x += probe.width + gap;
    }
    return { svg: out, height: y + height };
  },
  button: (el, w) => {
    const h = 48;
    const bw = el.full === false ? Math.min(w, Math.round(textWidth(el.text, 16, 900) + 48)) : w;
    const c = CHIP[el.tone ?? 'sky'];
    return {
      svg: box(0, 0, bw, h, 16, c) +
        text(bw / 2, h / 2 + 6, fit(el.text, bw - 24, 16, 900), { size: 16, weight: 900, fill: c.text, anchor: 'middle' }),
      height: h,
    };
  },
  stats: (el, w) => {
    const n = el.items.length;
    const gap = 12;
    const tw = Math.floor((w - gap * (n - 1)) / n);
    const h = 72;
    let out = '';
    el.items.forEach((item, i) => {
      const x = i * (tw + gap);
      const valueSize = shrinkToFit(item.value, tw - 28, 24, 900, 14);
      out +=
        box(x, 0, tw, h, 18, SURFACE.slate) +
        text(x + 14, 26, fit(item.label.toUpperCase(), tw - 28, 11, 900), { size: 11, weight: 900, fill: '#94a3b8' }) +
        text(x + 14, 56, item.value, { size: valueSize, weight: 900, fill: '#f8fafc' });
    });
    return { svg: out, height: h };
  },
  tiles: (el, w) => {
    const cols = el.cols ?? 3;
    const gap = 10;
    const tw = Math.floor((w - gap * (cols - 1)) / cols);
    const th = 54;
    let out = '';
    el.items.forEach((item, i) => {
      const x = (i % cols) * (tw + gap);
      const y = Math.floor(i / cols) * (th + gap);
      const tone = CHIP[item.tone ?? 'neutral'];
      out +=
        box(x, y, tw, th, 14, { fill: tone.fill, stroke: tone.stroke }) +
        text(x + 12, y + 24, fit(item.code, tw - 24, 16, 900), { size: 16, weight: 900, fill: '#f8fafc' }) +
        text(x + 12, y + 42, fit(item.note ?? '', tw - 24, 10, 700), { size: 10, weight: 700, fill: '#94a3b8' });
    });
    const rows = Math.ceil(el.items.length / cols);
    return { svg: out, height: rows * th + (rows - 1) * gap };
  },
  listRow: (el, w) => {
    const h = 64;
    const statusColor = el.statusColor ?? '#22c55e';
    const statusW = textWidth(el.status ?? '', 12, 900) + 8;
    const nameW = w - 40 - statusW - 20;
    return {
      svg:
        box(0, 0, w, h, 16, SURFACE.deep) +
        text(16, h / 2 + 5, el.index, { size: 16, weight: 900, fill: '#94a3b8' }) +
        text(44, 27, fit(el.name, nameW, 18, 900), { size: 18, weight: 900, fill: '#f8fafc' }) +
        text(44, 48, fit(el.detail, nameW, 12, 700), { size: 12, weight: 700, fill: '#94a3b8' }) +
        text(w - 16, h / 2 + 5, el.status, { size: 12, weight: 900, fill: statusColor, anchor: 'end' }),
      height: h,
    };
  },
  fixture: (el, w) => {
    const h = 52;
    return {
      svg:
        box(0, 0, w, h, 14, SURFACE.input) +
        text(16, h / 2 + 6, fit(el.home, w * 0.3, 16, 900), { size: 16, weight: 900, fill: '#f8fafc' }) +
        text(w / 2, h / 2 + 6, el.score, { size: 16, weight: 900, fill: '#7dd3fc', anchor: 'middle' }) +
        text(w - 16, h / 2 + 6, fit(el.away, w * 0.3, 16, 900), { size: 16, weight: 900, fill: '#f8fafc', anchor: 'end' }),
      height: h,
    };
  },
  spacer: (el) => ({ svg: '', height: el.height ?? 8 }),
};

const GAP_AFTER = {
  eyebrow: 8,
  title: 10,
  body: 10,
  field: 12,
  chips: 14,
  button: 14,
  stats: 14,
  tiles: 12,
  listRow: 10,
  fixture: 10,
  spacer: 0,
};

function renderCard(card, y) {
  const pad = card.pad ?? 20;
  const innerW = CARD_W - pad * 2;

  let badgeSvg = '';
  let badgeReserve = 0;
  if (card.badge) {
    const label = fit(card.badge.label, innerW * 0.5, 13, 900);
    const c = chip(0, 0, label, card.badge.tone ?? 'green', { size: 13, height: 30 });
    badgeReserve = c.width + 14;
    badgeSvg = `<g transform="translate(${PAGE_PAD + CARD_W - pad - c.width},${y + pad})">${c.svg}</g>`;
  }

  let cy = 0;
  let body = '';
  card.children.forEach((el, i) => {
    // The first element shares its line with the badge, so it gets less width.
    const availW = i === 0 ? innerW - badgeReserve : innerW;
    const rendered = ELEMENTS[el.t](el, availW);
    body += `<g transform="translate(0,${cy})">${rendered.svg}</g>`;
    cy += rendered.height;
    if (i < card.children.length - 1) cy += GAP_AFTER[el.t] ?? 12;
  });

  const height = Math.max(cy + pad * 2, badgeReserve ? 30 + pad * 2 : 0);
  const surface = SURFACE[card.tone ?? 'slate'];
  const svg =
    box(PAGE_PAD, y, CARD_W, height, card.radius ?? 22, surface) +
    badgeSvg +
    `<g transform="translate(${PAGE_PAD + pad},${y + pad})">${body}</g>`;

  return { svg, height };
}

function renderScreen({ title, subtitle, cards }) {
  const headW = W - 84 - PAGE_PAD;
  const titleSize = shrinkToFit(title, headW, 24, 900, 16);
  const subSize = shrinkToFit(subtitle, headW, 13, 700, 10);
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n` +
    `<rect width="${W}" height="${H}" fill="#07111f"/>\n` +
    `<circle cx="340" cy="40" r="95" fill="#172554" opacity="0.35"/>\n` +
    `<circle cx="48" cy="155" r="55" fill="#082f49" opacity="0.45"/>\n` +
    box(PAGE_PAD, 28, 48, 48, 14, SURFACE.slate) +
    text(84, 60, title, { size: titleSize, weight: 900 }) +
    text(84, 84, subtitle, { size: subSize, weight: 700, fill: '#94a3b8' }) +
    '\n';

  let y = 108;
  for (const card of cards) {
    const { svg, height } = renderCard(card, y);
    out += `${svg}\n`;
    y += height + CARD_GAP;
  }
  out += '</svg>\n';
  return { svg: out, bottom: y - CARD_GAP };
}

/* ------------------------------------------------------------------ *
 * Screen definitions
 * ------------------------------------------------------------------ */
const screens = {
  'guide-player-competitions': {
    title: 'Competitions',
    subtitle: 'Browse, private invites, and your entries',
    cards: [
      {
        children: [
          {
            t: 'chips',
            items: [
              { label: 'Browse 2', tone: 'sky' },
              { label: 'My Competitions 4', tone: 'neutral' },
            ],
          },
          { t: 'field', text: 'Search competitions...' },
        ],
      },
      {
        tone: 'sky',
        children: [
          { t: 'title', text: 'Join a private competition', size: 20 },
          { t: 'body', text: 'Enter an invite code from your organiser.', color: '#cbd5e1' },
          { t: 'field', text: 'INVITE CODE' },
          { t: 'button', text: 'Join with code', tone: 'primary', full: false },
        ],
      },
      {
        badge: { label: '1', tone: 'sky' },
        children: [
          { t: 'title', text: 'Joinable Competitions', size: 20 },
          { t: 'body', text: '1 competition available to join' },
        ],
      },
      {
        tone: 'teal',
        children: [
          { t: 'eyebrow', text: 'My Competitions' },
          { t: 'title', text: 'Solohead LMS', size: 24 },
          {
            t: 'chips',
            items: [
              { label: 'Active', tone: 'green' },
              { label: 'Pick due', tone: 'amber' },
              { label: 'Open', tone: 'sky' },
            ],
          },
        ],
      },
    ],
  },

  'guide-player-competition-detail': {
    title: 'Competition',
    subtitle: 'Competition lobby and gameweeks',
    cards: [
      {
        tone: 'blue',
        children: [
          { t: 'chips', items: [{ label: 'ACTIVE', tone: 'green' }] },
          { t: 'title', text: 'Solohead LMS', size: 30 },
          {
            t: 'stats',
            items: [
              { label: 'Players', value: '102' },
              { label: 'Active', value: '42' },
              { label: 'Prize', value: 'EUR 200' },
            ],
          },
        ],
      },
      {
        tone: 'violet',
        children: [
          { t: 'eyebrow', text: 'Pulse latest: GW2', color: '#a78bfa' },
          { t: 'title', text: 'Gameweek pressure rising', size: 22 },
          { t: 'body', text: '7 out so far, 42 alive.', size: 15, color: '#cbd5e1' },
        ],
      },
      {
        tone: 'sky',
        children: [
          { t: 'eyebrow', text: 'Next action' },
          { t: 'title', text: 'Make your pick before lock', size: 20 },
        ],
      },
      {
        children: [
          { t: 'title', text: 'Gameweek display', size: 18 },
          {
            t: 'chips',
            items: [
              { label: 'Cards', tone: 'sky' },
              { label: 'My Route', tone: 'neutral' },
            ],
          },
        ],
      },
      {
        tone: 'teal',
        children: [
          { t: 'title', text: 'Gameweek 3', size: 24 },
          { t: 'body', text: 'Your pick: MEX', size: 15, color: '#7dd3fc' },
          { t: 'body', text: 'Locks Saturday 14:00', size: 13 },
        ],
      },
    ],
  },

  'guide-player-my-route': {
    title: 'My Route',
    subtitle: 'Plan picks across gameweeks',
    cards: [
      {
        tone: 'sky',
        badge: { label: 'Lifeline', tone: 'cyan' },
        children: [
          { t: 'eyebrow', text: 'Your route' },
          { t: 'title', text: 'MEX', size: 34 },
          { t: 'body', text: 'Mexico vs South Africa', size: 15, color: '#cbd5e1' },
        ],
      },
      {
        children: [
          {
            t: 'stats',
            items: [
              { label: 'Available', value: '14' },
              { label: 'Used', value: '3' },
              { label: 'Reserved', value: '2' },
            ],
          },
        ],
      },
      {
        children: [
          { t: 'title', text: 'Used before', size: 16 },
          {
            t: 'chips',
            items: [
              { label: 'KOR', tone: 'amber' },
              { label: 'USA', tone: 'amber' },
              { label: 'BRA', tone: 'amber' },
            ],
          },
          { t: 'title', text: 'Reserved in another gameweek', size: 16 },
          {
            t: 'chips',
            items: [
              { label: 'ESP', tone: 'cyan' },
              { label: 'FRA', tone: 'cyan' },
            ],
          },
        ],
      },
      {
        children: [
          { t: 'title', text: 'Available teams this gameweek', size: 16 },
          {
            t: 'tiles',
            cols: 3,
            items: [
              { code: 'MEX', note: 'Tap pick' },
              { code: 'RSA', note: 'Tap pick' },
              { code: 'CAN', note: 'Tap pick' },
              { code: 'BIH', note: 'Tap pick' },
              { code: 'QAT', note: 'Tap pick' },
              { code: 'SUI', note: 'Tap pick' },
            ],
          },
        ],
      },
    ],
  },

  'guide-player-survivor-table': {
    title: 'Survivor Table',
    subtitle: 'Standings, filters, and picks',
    cards: [
      {
        badge: { label: 'Active', tone: 'green' },
        children: [
          { t: 'title', text: 'Table View', size: 20 },
          { t: 'field', text: 'Search participant...' },
        ],
      },
      {
        tone: 'deep',
        pad: 14,
        children: [
          { t: 'listRow', index: '1', name: 'alan', detail: 'MEX > ESP >', status: 'ACTIVE' },
          { t: 'listRow', index: '2', name: 'mary', detail: 'RSA > FRA >', status: 'ACTIVE' },
          { t: 'listRow', index: '3', name: 'john', detail: 'KOR x', status: 'ELIM GW2', statusColor: '#f87171' },
          {
            t: 'listRow',
            index: '4',
            name: 'sarah',
            detail: 'CAN > GER',
            status: 'LIFELINE GW1',
            statusColor: '#facc15',
          },
        ],
      },
      {
        children: [
          {
            t: 'chips',
            items: [
              { label: 'Previous', tone: 'neutral' },
              { label: 'Next', tone: 'neutral' },
              { label: 'Eliminated GW', tone: 'neutral' },
            ],
          },
        ],
      },
    ],
  },

  'guide-admin-dashboard': {
    title: 'Club Admin',
    subtitle: 'Setup, payments, branding, competitions',
    cards: [
      {
        children: [
          { t: 'title', text: 'Manage competitions', size: 20 },
          { t: 'body', text: 'Create and run club competitions.' },
          { t: 'button', text: '+ New Competition', tone: 'sky' },
        ],
      },
      {
        tone: 'sky',
        badge: { label: 'Slot credits: 1', tone: 'cyan' },
        children: [
          { t: 'eyebrow', text: 'Competition slots' },
          { t: 'body', text: 'First competition free, extras need a slot.', color: '#cbd5e1' },
          { t: 'button', text: 'Buy competition slot', tone: 'primary', full: false },
        ],
      },
      {
        badge: { label: '2/3', tone: 'sky' },
        children: [
          { t: 'title', text: 'Setup Checklist', size: 20 },
          { t: 'body', text: '2/3 setup milestones complete.' },
        ],
      },
      {
        badge: { label: 'READY', tone: 'green' },
        children: [
          { t: 'title', text: 'Manual Payments', size: 20 },
          { t: 'body', text: 'Track offline payment confirmations.' },
        ],
      },
      {
        children: [
          { t: 'eyebrow', text: 'Club branding', color: '#cbd5e1' },
          { t: 'body', text: 'Logo and colour scheme.' },
          {
            t: 'chips',
            items: [
              { label: '#1017cb', tone: 'neutral' },
              { label: '#c7d2d6', tone: 'neutral' },
              { label: 'Upload logo', tone: 'sky' },
            ],
          },
        ],
      },
    ],
  },

  'guide-admin-billing-slots': {
    title: 'Competition Slots',
    subtitle: 'First free, then one slot per competition',
    cards: [
      {
        tone: 'sky',
        badge: { label: 'Slot credits: 0', tone: 'cyan' },
        children: [
          { t: 'eyebrow', text: 'Club billing' },
          { t: 'title', text: 'First competition is free', size: 20 },
          { t: 'body', text: 'Used once per club, for life.', color: '#cbd5e1' },
        ],
      },
      {
        children: [
          { t: 'title', text: 'Need another competition?', size: 18 },
          { t: 'body', text: 'Buy a one-time slot to unlock creation.' },
          { t: 'button', text: 'Buy competition slot', tone: 'primary' },
          { t: 'body', text: 'Opens Stripe Checkout in a secure window.', size: 13 },
        ],
      },
      {
        tone: 'deep',
        children: [
          { t: 'eyebrow', text: 'How credits work', color: '#cbd5e1' },
          { t: 'body', text: '1 purchase = 1 credit.' },
          { t: 'body', text: '1 competition created = 1 credit used.' },
          { t: 'body', text: 'Credits never expire and stay with the club.', maxLines: 1 },
        ],
      },
      {
        tone: 'amber',
        children: [
          { t: 'eyebrow', text: 'Not the same as entry fees', color: '#fbbf24' },
          { t: 'body', text: 'Slots are a platform fee. You still collect player entry fees.', color: '#fde68a' },
        ],
      },
      {
        children: [
          {
            t: 'chips',
            items: [
              { label: 'Payment successful', tone: 'green' },
              { label: 'Cancelled: no charge', tone: 'neutral' },
            ],
          },
        ],
      },
    ],
  },

  'guide-admin-create-competition': {
    title: 'New Competition',
    subtitle: 'Rules, payments, visibility',
    cards: [
      {
        children: [
          { t: 'title', text: 'Competition details', size: 20 },
          { t: 'field', text: 'Name: Summer LMS' },
          { t: 'field', text: 'Start: 12 Aug 2026 - Premier League' },
        ],
      },
      {
        children: [
          { t: 'title', text: 'Visibility', size: 16 },
          {
            t: 'chips',
            items: [
              { label: 'Public', tone: 'sky' },
              { label: 'Private', tone: 'neutral' },
            ],
          },
          { t: 'title', text: 'Payment mode', size: 16 },
          {
            t: 'chips',
            items: [
              { label: 'Free', tone: 'green' },
              { label: 'Manual', tone: 'amber' },
            ],
          },
        ],
      },
      {
        children: [
          { t: 'title', text: 'Rules', size: 16 },
          { t: 'field', text: 'Max entries per user: 1' },
          { t: 'field', text: '[x] Enable lifeline', tone: 'sky' },
        ],
      },
      {
        tone: 'sky',
        children: [
          { t: 'eyebrow', text: 'Slot required' },
          { t: 'body', text: 'This is not your first competition, so 1 slot credit will be used.', color: '#cbd5e1' },
          { t: 'button', text: 'Create Competition', tone: 'primary' },
        ],
      },
    ],
  },

  'guide-admin-participants-payments': {
    title: 'Participants',
    subtitle: 'Entries and manual payments',
    cards: [
      {
        badge: { label: '48', tone: 'sky' },
        children: [
          { t: 'title', text: 'Participants', size: 20 },
          {
            t: 'chips',
            items: [
              { label: 'All', tone: 'sky' },
              { label: 'Awaiting', tone: 'amber' },
              { label: 'Paid', tone: 'green' },
            ],
          },
          { t: 'field', text: 'Search entries...' },
        ],
      },
      {
        tone: 'deep',
        pad: 14,
        children: [
          { t: 'listRow', index: '1', name: 'alan (Entry #1)', detail: 'Awaiting payment', status: 'MARK PAID', statusColor: '#fbbf24' },
          { t: 'listRow', index: '2', name: 'alan (Entry #2)', detail: 'Paid 12 Aug', status: 'REVERT', statusColor: '#7dd3fc' },
          { t: 'listRow', index: '3', name: 'mary', detail: 'Paid - active', status: 'ACTIVE' },
          { t: 'listRow', index: '4', name: 'john', detail: 'Paid - out GW2', status: 'ELIMINATED', statusColor: '#f87171' },
        ],
      },
      {
        children: [
          {
            t: 'chips',
            items: [
              { label: 'Export CSV', tone: 'neutral' },
              { label: 'Add Entry', tone: 'sky' },
              { label: 'Declare winner', tone: 'green' },
            ],
          },
        ],
      },
    ],
  },

  'guide-admin-pause-announcements': {
    title: 'Pause & Announce',
    subtitle: 'Control competition communication',
    cards: [
      {
        badge: { label: 'RUNNING', tone: 'green' },
        children: [
          { t: 'title', text: 'Pause competition', size: 20 },
          { t: 'body', text: 'Stops joins, payments, picks, and automation.' },
          { t: 'field', text: 'Reason: Fixture issue' },
          { t: 'button', text: 'Pause Competition', tone: 'amber' },
        ],
      },
      {
        tone: 'sky',
        children: [
          { t: 'title', text: 'Send announcement', size: 20 },
          { t: 'field', text: 'Title: Deadline reminder' },
          { t: 'field', text: 'Message: Picks lock tonight.' },
          { t: 'button', text: 'Send to Participants', tone: 'primary' },
        ],
      },
      {
        tone: 'deep',
        children: [
          { t: 'eyebrow', text: 'Users see announcements', color: '#cbd5e1' },
          { t: 'body', text: 'Displayed on Competitions with dismiss.' },
        ],
      },
    ],
  },

  'guide-admin-results': {
    title: 'Process Results',
    subtitle: 'Resolve, correct, or void gameweeks',
    cards: [
      {
        children: [
          { t: 'title', text: 'Select competition', size: 18 },
          { t: 'field', text: 'Summer LMS - Gameweek 2' },
        ],
      },
      {
        tone: 'deep',
        children: [
          { t: 'fixture', home: 'MEX', score: '2 - 0', away: 'RSA' },
          { t: 'fixture', home: 'CAN', score: '1 - 1', away: 'BIH' },
          { t: 'fixture', home: 'QAT', score: 'PP', away: 'SUI' },
        ],
      },
      {
        tone: 'amber',
        children: [
          { t: 'eyebrow', text: 'Paused competition', color: '#fbbf24' },
          { t: 'body', text: 'Processing results will void this gameweek.', color: '#fde68a' },
          { t: 'button', text: 'Void Gameweek', tone: 'amber' },
        ],
      },
      {
        tone: 'deep',
        children: [{ t: 'body', text: 'Normal active competitions process eliminations.' }],
      },
    ],
  },
};

let failed = false;
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(publicOutDir, { recursive: true });
for (const [name, def] of Object.entries(screens)) {
  const { svg, bottom } = renderScreen(def);
  if (bottom > H - 16) {
    console.error(`ERROR: ${name}.svg content overflows canvas (bottom=${bottom}, max=${H - 16})`);
    failed = true;
  }
  fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
  fs.writeFileSync(path.join(publicOutDir, `${name}.svg`), svg);
  console.log(`wrote ${name}.svg (content bottom ${bottom}px)`);
}

process.exit(failed ? 1 : 0);










