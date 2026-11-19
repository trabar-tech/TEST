// @vitest-environment jsdom
/**
 * The G1 playlist: a protocol a stranger can run without a designer in the room.
 *
 * The gate spec requires three testers, 15–25 minutes, and answers in their own
 * words. What it did not have was anything that could *hold* those answers. This
 * test drives the whole script as a tester would and checks that the reporting
 * artefact is pasteable — because a gate result nobody wrote down did not happen.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { createPlaylist, G1_STEPS } from '@ui/playlist';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const view = createPlaylist(host, { onClose: () => {}, runId: 'test-run' });
  return { host, view };
}

function next(host: HTMLElement): void {
  const b = [...host.querySelectorAll('button')].find((x) =>
    /^(Next →|Finish)$/.test((x.textContent ?? '').trim()),
  );
  if (!b) throw new Error('no next button');
  (b as HTMLButtonElement).click();
}

function type(host: HTMLElement, text: string): void {
  const area = host.querySelector('textarea');
  if (!area) throw new Error('no textarea on this step');
  area.value = text;
  area.dispatchEvent(new Event('input'));
}

describe('the playlist', () => {
  it('puts G1\'s two pass questions in the last two steps, in the gate\'s own words', () => {
    const last = G1_STEPS.slice(-2).map((s) => s.ask ?? '');
    expect(last[0]).toMatch(/G1 Q1/);
    expect(last[1]).toMatch(/G1 Q2/);
    expect(last[1]).toMatch(/describe the shift/i);
  });

  it('starts on step 1 and asks before it shows anything else', () => {
    const { host } = mount();
    expect(host.textContent).toContain('STEP 1 OF');
    expect(host.textContent).toContain('Begin the shift');
    expect(host.textContent).toContain('ANSWER IN YOUR OWN WORDS');
  });

  it('walks the whole script and reaches the completion screen', () => {
    const { host } = mount();
    for (let i = 0; i < G1_STEPS.length; i++) {
      type(host, `answer ${i}`);
      next(host);
    }
    expect(host.textContent).toContain('SESSION COMPLETE');
    expect(host.textContent).toContain('PASTE THIS INTO THE PHASE DOC');
  });

  it('reports the answers verbatim, with both pass questions labelled', () => {
    const { host, view } = mount();
    for (let i = 0; i < G1_STEPS.length; i++) {
      type(host, `answer ${i}`);
      next(host);
    }
    const report = view.report();
    expect(report).toContain('### G1 session · test-run');
    expect(report).toContain('**G1 Q1 (tactics):** answer 5');
    expect(report).toContain('**G1 Q2 (integration):** answer 6');
    expect(report).toContain('| step | task | answer |');
  });

  it('says NOT ANSWERED rather than inventing a result', () => {
    const { host, view } = mount();
    for (let i = 0; i < G1_STEPS.length; i++) next(host);
    const report = view.report();
    expect(report).toContain('NOT ANSWERED');
    expect(report).not.toContain('PASS');
    expect(report).not.toContain('FAIL');
  });

  it('can go back and correct an answer without losing the others', () => {
    const { host, view } = mount();
    type(host, 'first go');
    next(host);
    type(host, 'second');
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent === '← back');
    (back as HTMLButtonElement).click();
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('first go');
    type(host, 'first go, revised');
    expect(view.report()).toContain('first go, revised');
  });

  it('scrubs pipes and newlines so the markdown table survives a tester typing prose', () => {
    const { host, view } = mount();
    type(host, 'a | b\nand then a newline');
    next(host);
    for (let i = 1; i < G1_STEPS.length; i++) next(host);
    const report = view.report();
    expect(report).toContain('a / b and then a newline');
  });

  it('records elapsed times as non-gating data, not as a score', () => {
    const { host, view } = mount();
    for (let i = 0; i < G1_STEPS.length; i++) next(host);
    expect(view.report()).toContain('**Recorded, non-gating:**');
  });
});
