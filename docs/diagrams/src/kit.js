/* Tiny SVG diagram kit in the Readi "Margin" palette. */
const P = {
  ink: '#374151', frame: '#4B5563', muted: '#6B7280', border: '#E5E7EB',
  paper: '#FFFFFF', surface: '#F3F4F6', accent: '#FFF7ED', highlight: '#FFEDD5',
  pen: '#C2410C', pen2: '#EA580C', ok: '#15803D', warn: '#B45309', bad: '#B91C1C',
  sans: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let OUT = [];
const push = (s) => OUT.push(s);

function defs() {
  return `<defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${P.frame}"/></marker>
    <marker id="ap" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${P.pen}"/></marker>
    <marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${P.muted}"/></marker>
  </defs>`;
}

/* band: a labelled dashed container */
function band(x, y, w, h, label, opts = {}) {
  const fill = opts.fill || 'none';
  push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${P.border}" stroke-width="1.5" stroke-dasharray="6 5"/>`);
  if (label) push(`<text x="${x + 12}" y="${y + 19}" font-family="${P.sans}" font-size="11.5" font-weight="700" letter-spacing="1.1" fill="${P.muted}">${esc(label.toUpperCase())}</text>`);
}

/* box: {x,y,w,h,title,lines[],state:'built'|'planned'|'ext'|'data'|'accent', tag} */
function box(o) {
  const st = o.state || 'built';
  let stroke = P.frame, fill = P.paper, dash = '', tcol = P.ink, scol = P.muted, sw = 1.6;
  if (st === 'planned') { stroke = '#9CA3AF'; fill = '#FAFAFA'; dash = ' stroke-dasharray="5 4"'; tcol = P.muted; scol = '#9CA3AF'; }
  if (st === 'ext') { fill = P.surface; stroke = '#9CA3AF'; sw = 1.3; }
  if (st === 'data') { fill = '#EEF2F7'; }
  if (st === 'accent') { fill = P.accent; stroke = P.pen; }
  if (st === 'pen') { fill = P.highlight; stroke = P.pen; }
  const h = o.h || (o.lines ? 30 + 15 * o.lines.length : 40);
  push(`<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
  const cx = o.x + o.w / 2;
  const ts = o.ts || 13.5;
  let ty = o.y + (o.lines && o.lines.length ? 21 : h / 2 + 4.5);
  push(`<text x="${cx}" y="${ty}" text-anchor="middle" font-family="${P.sans}" font-size="${ts}" font-weight="650" fill="${tcol}">${esc(o.title)}</text>`);
  (o.lines || []).forEach((l, i) => {
    push(`<text x="${cx}" y="${ty + 16 + i * 14.5}" text-anchor="middle" font-family="${P.sans}" font-size="11.5" fill="${scol}">${esc(l)}</text>`);
  });
  if (o.tag) {
    const tw = o.tag.length * 6.2 + 12;
    const tc = o.tagColor || (st === 'planned' ? P.muted : P.ok);
    push(`<rect x="${o.x + o.w - tw - 6}" y="${o.y - 8}" width="${tw}" height="16" rx="8" fill="${P.paper}" stroke="${tc}" stroke-width="1.2"/>`);
    push(`<text x="${o.x + o.w - tw / 2 - 6}" y="${o.y + 3.5}" text-anchor="middle" font-family="${P.sans}" font-size="9.5" font-weight="700" letter-spacing="0.6" fill="${tc}">${esc(o.tag)}</text>`);
  }
  return { ...o, h, cx, cy: o.y + h / 2, top: o.y, bottom: o.y + h, left: o.x, right: o.x + o.w };
}

function label(x, y, text, o = {}) {
  push(`<text x="${x}" y="${y}" text-anchor="${o.anchor || 'middle'}" font-family="${o.serif ? P.serif : P.sans}" font-size="${o.size || 11.5}" font-weight="${o.weight || 400}" fill="${o.fill || P.muted}"${o.style ? ` font-style="${o.style}"` : ''}>${esc(text)}</text>`);
}

/* arrow between points; opts: {label, color, dash, curve, both, labelDy, labelSide} */
function arrow(x1, y1, x2, y2, o = {}) {
  const col = o.color === 'pen' ? P.pen : o.color === 'mute' ? P.muted : P.frame;
  const mk = o.color === 'pen' ? 'ap' : o.color === 'mute' ? 'ag' : 'a';
  const dash = o.dash ? ` stroke-dasharray="${o.dash}"` : '';
  let d;
  if (o.curve) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    d = `M ${x1} ${y1} Q ${mx + (o.curve || 0)} ${my} ${x2} ${y2}`;
  } else if (o.elbow === 'h') {
    const mx = o.mid ?? (x1 + x2) / 2;
    d = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
  } else if (o.elbow === 'v') {
    const my = o.mid ?? (y1 + y2) / 2;
    d = `M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`;
  } else {
    d = `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${o.w || 1.5}"${dash} marker-end="url(#${mk})"${o.both ? ` marker-start="url(#${mk})"` : ''}/>`);
  if (o.label) {
    const lx = o.lx ?? (x1 + x2) / 2, ly = o.ly ?? (y1 + y2) / 2;
    const pad = o.label.length * 3.3 + 6;
    push(`<rect x="${lx - pad}" y="${ly - 8}" width="${pad * 2}" height="15" rx="3" fill="${P.paper}" opacity="0.95"/>`);
    push(`<text x="${lx}" y="${ly + 3.5}" text-anchor="middle" font-family="${P.sans}" font-size="10.5" fill="${o.color === 'pen' ? P.pen : P.muted}">${esc(o.label)}</text>`);
  }
}

function render(id, w, h, title, sub, body) {
  OUT = [];
  body();
  const inner = OUT.join('\n');
  const head = title
    ? `<text x="0" y="16" font-family="${P.serif}" font-size="17" font-weight="600" fill="${P.ink}">${esc(title)}</text>` +
      (sub ? `<text x="0" y="35" font-family="${P.sans}" font-size="11.5" fill="${P.muted}">${esc(sub)}</text>` : '')
    : '';
  const off = title ? (sub ? 50 : 30) : 0;
  document.write(
    `<div class="wrap"><div class="d" id="${id}"><svg width="${w}" height="${h + off}" viewBox="0 0 ${w} ${h + off}" xmlns="http://www.w3.org/2000/svg">${defs()}<g transform="translate(0,0)">${head}</g><g transform="translate(0,${off})">${inner}</g></svg></div><div class="cap">${id}</div></div>`
  );
}
