import { describe, expect, it } from 'vitest';
import { resolveCliLocale, t } from '../src/i18n.js';

describe('i18n helpers', () => {
  it('uses Chinese for zh locales', () => {
    expect(resolveCliLocale('zh-CN')).toBe('zh');
    expect(t('managedSkills', {}, 'zh')).toBe('托管技能');
    expect(t('promptMoreBelow', { count: 2 }, 'zh')).toBe('↓ 下方还有 2 项');
  });

  it('falls back to English for non-zh locales', () => {
    expect(resolveCliLocale('en-US')).toBe('en');
    expect(resolveCliLocale('fr-FR')).toBe('en');
    expect(t('managedSkills', {}, 'en')).toBe('Managed Skills');
    expect(t('promptSelectedCount', { count: 3 }, 'en')).toBe('Selected: 3');
  });
});
