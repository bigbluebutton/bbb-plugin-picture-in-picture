import { describe, it, expect } from 'vitest';
import { getRoleColor, getInitials } from '../../../../../src/plugin-pip/components/chat/utils';

describe('getRoleColor', () => {
  it('returns the moderator color', () => {
    expect(getRoleColor('MODERATOR')).toBe('#3b82f6');
  });

  it('returns the viewer color', () => {
    expect(getRoleColor('VIEWER')).toBe('#8b5cf6');
  });

  it('falls back to the neutral color for an unknown role', () => {
    expect(getRoleColor('PRESENTER')).toBe('#6b7280');
  });

  it('falls back to the neutral color when the role is null', () => {
    expect(getRoleColor(null)).toBe('#6b7280');
  });
});

describe('getInitials', () => {
  it('returns the first two characters of the name', () => {
    expect(getInitials('Alice')).toBe('Al');
  });

  it('returns the whole name when it is a single character', () => {
    expect(getInitials('A')).toBe('A');
  });

  it('returns a placeholder for a null name', () => {
    expect(getInitials(null)).toBe('?');
  });

  it('returns a placeholder for an empty name', () => {
    expect(getInitials('')).toBe('?');
  });
});
