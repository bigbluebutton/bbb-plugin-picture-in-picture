import { describe, it, expect } from 'vitest';
import { getBackgroundColor, getIcon } from '../../../../../src/plugin-pip/components/ui/toast';

describe('getBackgroundColor', () => {
  it('maps each toast type to its background color', () => {
    expect(getBackgroundColor('default')).toBe('#303030');
    expect(getBackgroundColor('success')).toBe('#10b981');
    expect(getBackgroundColor('error')).toBe('#ef4444');
    expect(getBackgroundColor('warning')).toBe('#f59e0b');
    expect(getBackgroundColor('info')).toBe('#3b82f6');
  });
});

describe('getIcon', () => {
  it('returns an icon for the semantic toast types', () => {
    expect(getIcon('success')).toBe('✓');
    expect(getIcon('error')).toBe('✕');
    expect(getIcon('warning')).toBe('⚠');
    expect(getIcon('info')).toBe('ℹ');
  });

  it('returns no icon for the default type', () => {
    expect(getIcon('default')).toBeUndefined();
  });
});
