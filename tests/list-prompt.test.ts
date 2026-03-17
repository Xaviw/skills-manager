import { describe, expect, it } from 'vitest';
import {
  fitOptionText,
  formatOverflowSummary,
  isListPromptCancel,
  listPromptCancelSymbol,
  measureDisplayWidth,
  summarizeSelectedLabels,
  truncateDisplayText,
} from '../src/list-prompt.js';

describe('list prompt helpers', () => {
  it('treats non-ascii characters conservatively when measuring width', () => {
    expect(measureDisplayWidth('abc')).toBe(3);
    expect(measureDisplayWidth('选择')).toBe(4);
    expect(measureDisplayWidth('a选b')).toBe(4);
  });

  it('truncates text to the requested visible width', () => {
    expect(truncateDisplayText('abcdefghijklmnopqrstuvwxyz', 10)).toBe(
      'abcdefg...',
    );
    expect(truncateDisplayText('选择要安装的技能', 8)).toBe('选择...');
  });

  it('keeps the label and truncates the hint separately when space is limited', () => {
    expect(
      fitOptionText(
        'agent-browser',
        'Browser automation for websites and forms',
        32,
      ),
    ).toEqual({
      label: 'agent-browser',
      hint: 'Browser autom...',
    });
    expect(fitOptionText('very-long-skill-name', 'short hint', 12)).toEqual({
      label: 'very-long...',
    });
  });

  it('localizes overflow summaries', () => {
    expect(formatOverflowSummary(2, 5, 'en')).toBe(
      '↑ 2 more above · ↓ 5 more below',
    );
    expect(formatOverflowSummary(1, 3, 'zh')).toBe(
      '↑ 上方还有 1 项 · ↓ 下方还有 3 项',
    );
  });

  it('summarizes selected labels with localized overflow text', () => {
    expect(summarizeSelectedLabels([], 'zh')).toBe('（无）');
    expect(summarizeSelectedLabels(['a', 'b', 'c', 'd'], 'en')).toBe(
      'a, b, c +1 more',
    );
  });

  it('detects the custom cancel symbol', () => {
    expect(isListPromptCancel(listPromptCancelSymbol)).toBe(true);
    expect(isListPromptCancel(Symbol('other'))).toBe(false);
  });
});
