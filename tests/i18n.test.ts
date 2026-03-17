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

  it('prefers locale-related environment variables when no explicit locale is passed', () => {
    const originalLang = process.env.LANG;
    const originalLcAll = process.env.LC_ALL;
    const originalLcMessages = process.env.LC_MESSAGES;

    try {
      process.env.LANG = 'zh-CN';
      delete process.env.LC_ALL;
      delete process.env.LC_MESSAGES;
      expect(resolveCliLocale()).toBe('zh');

      process.env.LC_MESSAGES = 'en-US';
      expect(resolveCliLocale()).toBe('en');

      process.env.LC_ALL = 'zh-TW';
      expect(resolveCliLocale()).toBe('zh');
    } finally {
      if (originalLang === undefined) {
        delete process.env.LANG;
      } else {
        process.env.LANG = originalLang;
      }

      if (originalLcAll === undefined) {
        delete process.env.LC_ALL;
      } else {
        process.env.LC_ALL = originalLcAll;
      }

      if (originalLcMessages === undefined) {
        delete process.env.LC_MESSAGES;
      } else {
        process.env.LC_MESSAGES = originalLcMessages;
      }
    }
  });
});
