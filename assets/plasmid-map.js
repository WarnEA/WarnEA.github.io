// The site drawn as a plasmid map: pAW26, with each section as a gene feature on the ring.
(() => {
  const SIZE = 4000; // bp, a drawing convention rather than a real construct
  const FEATURES = [
    { id: 'about', label: 'About', href: 'about.html', from: 140, to: 860 },
    { id: 'research', label: 'Research', href: 'projects.html', from: 1080, to: 2060 },
    { id: 'writing', label: 'Writing', href: 'writing.html', from: 2280, to: 3120 },
    { id: 'cv', label: 'CV', href: 'CV.html', from: 3340, to: 3860 }
  ];
  const NS = 'http://www.w3.org/2000/svg';
  const offset = document.querySelector('meta[name="quarto:offset"]')?.content || './';

  const angle = (bp) => bp / SIZE * Math.PI * 2 - Math.PI / 2;
  const xy = (r, a, c) => [c + r * Math.cos(a), c + r * Math.sin(a)].map((n) => +n.toFixed(2));
  const point = (r, a, c) => xy(r, a, c).join(' ');
  const number = (bp) => bp.toLocaleString('en-GB');

  // An arrowed feature: outer arc, pointed tip, inner arc back.
  const featurePath = (f, c, r, w) => {
    const a0 = angle(f.from), a1 = angle(f.to), tip = Math.min(.09, (a1 - a0) / 3);
    const ro = r + w / 2, ri = r - w / 2, large = a1 - tip - a0 > Math.PI ? 1 : 0;
    return `M${point(ro, a0, c)}A${ro} ${ro} 0 ${large} 1 ${point(ro, a1 - tip, c)}L${point(r, a1, c)}L${point(ri, a1 - tip, c)}A${ri} ${ri} 0 ${large} 0 ${point(ri, a0, c)}Z`;
  };

  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (parent) parent.appendChild(node);
    return node;
  };

  const current = () => {
    const path = location.pathname;
    if (/\/posts\//.test(path)) return 'writing';
    return FEATURES.find((f) => path.endsWith('/' + f.href))?.id || null;
  };

  // mode: 'full' (home, labelled and linked), 'mini' (page header), 'deletion' (404)
  const draw = (mode, active) => {
    const full = mode !== 'mini';
    const c = full ? 260 : 24, r = full ? 150 : 17, w = full ? 22 : 6;
    const svg = el('svg', { viewBox: `0 0 ${c * 2} ${c * 2}`, class: `pmap pmap--${mode}`, 'aria-hidden': 'true', focusable: 'false' });
    const turn = el('g', { class: 'pmap-turn' }, svg);
    el('circle', { cx: c, cy: c, r: r + w / 2 + (full ? 6 : 2), class: 'pmap-strand' }, turn);
    if (mode === 'deletion') {
      el('path', { d: `M${point(r, angle(1080), c)}A${r} ${r} 0 1 0 ${point(r, angle(2060), c)}`, class: 'pmap-backbone' }, svg);
    } else {
      el('circle', { cx: c, cy: c, r, class: 'pmap-backbone' }, svg);
    }
    if (full) {
      for (let bp = 0; bp < SIZE; bp += 250) {
        const major = bp % 1000 === 0, a = angle(bp);
        const [x1, y1] = xy(r - w / 2 - 6, a, c), [x2, y2] = xy(r - w / 2 - (major ? 16 : 11), a, c);
        el('line', { x1, y1, x2, y2, class: 'pmap-tick' }, svg);
        if (major && bp) {
          const [x, y] = xy(r - w / 2 - 30, a, c);
          el('text', { x, y, class: 'pmap-kb', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg).textContent = `${bp / 1000} kb`;
        }
      }
      // Origin of replication at 0 bp, where the fork sets out from.
      const [ox, oy] = xy(r, angle(0), c);
      el('rect', { x: ox - 3, y: oy - 9, width: 6, height: 18, class: 'pmap-ori' }, svg);
      const [lx, ly] = xy(r + w / 2 + 24, angle(0), c);
      el('text', { x: lx, y: ly, class: 'pmap-ori-label', 'text-anchor': 'middle' }, svg).textContent = 'ori';
    }
    for (const f of FEATURES) {
      if (mode === 'deletion' && f.id === 'research') continue;
      const host = mode === 'full' ? el('a', { href: offset + f.href, tabindex: '-1', class: `pmap-feature f-${f.id}` }, svg) : el('g', { class: `pmap-feature f-${f.id}` }, svg);
      if (f.id === active) host.classList.add('is-current');
      el('path', { d: featurePath(f, c, r, w), class: 'pmap-arc' }, host);
      if (!full) continue;
      const mid = angle((f.from + f.to) / 2), [x, y] = xy(r + w / 2 + 30, mid, c);
      const anchor = Math.abs(Math.cos(mid)) < .25 ? 'middle' : Math.cos(mid) > 0 ? 'start' : 'end';
      const label = el('text', { x, y, 'text-anchor': anchor, class: 'pmap-label' }, host);
      label.textContent = f.label;
      el('tspan', { x, dy: '1.35em', class: 'pmap-bp' }, label).textContent = `${number(f.from)} to ${number(f.to)} bp`;
    }
    if (mode !== 'mini') {
      // The fork lives on its own layer, so turning it never repaints the map.
      const layer = el('svg', { viewBox: `0 0 ${c * 2} ${c * 2}`, class: 'pmap-fork-layer', 'aria-hidden': 'true', focusable: 'false' });
      svg.forkLayer = layer;
      const fork = el('g', { class: 'pmap-fork' }, layer);
      el('path', { d: `M${point(r, angle(-90), c)}A${r} ${r} 0 0 1 ${point(r, angle(0), c)}`, class: 'pmap-fork-trail' }, fork);
      const [fx, fy] = xy(r, angle(0), c);
      el('circle', { cx: fx, cy: fy, r: 4.5, class: 'pmap-fork-dot' }, fork);
      const name = el('text', { x: c, y: c - 4, 'text-anchor': 'middle', class: 'pmap-name' }, svg);
      name.textContent = 'pAW26';
      el('text', { x: c, y: c + 20, 'text-anchor': 'middle', class: 'pmap-size' }, svg).textContent = mode === 'deletion' ? 'Δ 1,080 to 2,060' : `${number(SIZE)} bp`;
    }
    return svg;
  };

  const mount = () => {
    document.querySelectorAll('[data-pmap]').forEach((host) => {
      if (host.querySelector('svg')) return;
      const svg = draw(host.dataset.pmap, current()), stack = document.createElement('div');
      stack.className = 'pmap-stack';
      stack.append(svg, svg.forkLayer);
      host.prepend(stack);
    });
    // Inner pages carry their locus: a mini map with this page lit, and its coordinates.
    const active = current(), title = document.querySelector('#title-block-header .quarto-title');
    if (active && title && !title.querySelector('.pmap-locus')) {
      const f = FEATURES.find((item) => item.id === active);
      const locus = document.createElement('p');
      locus.className = 'pmap-locus';
      locus.setAttribute('aria-hidden', 'true');
      locus.append(draw('mini', active), `pAW26 · ${f.label} · ${number(f.from)} to ${number(f.to)} bp`);
      title.prepend(locus);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
