/**
 * Minimal DOM helpers. The UI is built by hand rather than with a framework
 * because the whole app is one screen per phase, and a framework would be a
 * second mental model to keep in sync with the sim.
 *
 * Everything here is inline-styled: the preview runs in a sandboxed iframe with
 * no network, so no external CSS, fonts or images are allowed anywhere.
 */

export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const FONT_SERIF = 'Iowan Old Style, Palatino, Georgia, serif';

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style?: string | Partial<CSSStyleDeclaration>,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (typeof style === 'string') node.style.cssText = style;
  else if (style) Object.assign(node.style, style);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  opts: { style?: string; title?: string; disabled?: boolean } = {},
): HTMLButtonElement {
  const b = el('button', opts.style ?? '');
  b.type = 'button';
  b.textContent = label;
  if (opts.title) b.title = opts.title;
  if (opts.disabled) b.disabled = true;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) onClick();
  });
  return b;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** A panel in the game's HUD language: dark, thin rule, letterspaced label. */
export function panel(style = ''): HTMLDivElement {
  return el(
    'div',
    [
      'position:absolute',
      'padding:10px 12px',
      'background:rgba(9,12,15,.9)',
      'border:1px solid rgba(120,140,160,.24)',
      'border-radius:3px',
      `font:11px/1.5 ${FONT_MONO}`,
      'color:#c9d3dd',
      style,
    ].join(';'),
  );
}

export function label(text: string, style = ''): HTMLDivElement {
  return el(
    'div',
    `color:#7f8d9b;letter-spacing:.14em;text-transform:uppercase;font-size:9.5px;${style}`,
    text,
  );
}

/** Three-band exposure readout: shape + word, never colour alone. */
export function bandChip(band: 'safe' | 'thin' | 'hanging'): HTMLSpanElement {
  const spec = {
    safe: { text: '○ SAFE', colour: '#a9c79a', border: 'rgba(169,199,154,.45)' },
    thin: { text: '◑ THIN', colour: '#d8b06a', border: 'rgba(216,176,106,.5)' },
    hanging: { text: '● HANGING', colour: '#e2a19a', border: 'rgba(226,161,154,.55)' },
  }[band];
  return el(
    'span',
    [
      'display:inline-block',
      'padding:1px 7px',
      'border-radius:2px',
      `border:1px solid ${spec.border}`,
      `color:${spec.colour}`,
      'letter-spacing:.1em',
      'font-size:10px',
      'white-space:nowrap',
    ].join(';'),
    spec.text,
  );
}

/** Dim, indented supporting text. */
export function note(text: string): HTMLDivElement {
  return el('div', 'color:#6f7d8b;font-size:10.5px;line-height:1.55;margin-top:3px', text);
}
