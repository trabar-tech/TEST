/**
 * Small DOM helpers shared by the UI tests.
 *
 * Exists because every UI test was rewriting the same two lines: find a button by its
 * label, click it. Button labels repeat across the app (there are three "Clear"s), so
 * these match on exact trimmed text and fail loudly with the available labels listed —
 * a test that silently clicks the wrong button is worse than one that does not compile.
 */

import { expect } from 'vitest';

export function buttons(root: ParentNode): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('button')];
}

/** Click the button whose label exactly matches. Throws with the available labels. */
export function click(root: ParentNode, label: string): void {
  const found = buttons(root).find((b) => (b.textContent ?? '').trim() === label);
  if (!found) {
    const available = buttons(root).map((b) => (b.textContent ?? '').trim());
    throw new Error(`no button labelled "${label}". Available: ${JSON.stringify(available)}`);
  }
  found.click();
}

/** Click the nth button, when labels genuinely repeat. */
export function clickIndex(root: ParentNode, index: number): void {
  const found = buttons(root)[index];
  expect(found, `button #${index} exists`).toBeTruthy();
  found!.click();
}
