// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import MasterfadeLogo from '../MasterfadeLogo.jsx';

const state = vi.hoisted(() => ({ theme: 'dark' }));
vi.mock('../../../context/ThemeContext.jsx', () => ({
  useTheme: () => ({ variant: state.theme }),
}));

afterEach(() => {
  cleanup();
  state.theme = 'dark';
});

test('sidebar usa recursos recortados con ancho visual y proporcion propios', () => {
  const { rerender } = render(<MasterfadeLogo variant="sidebar" />);
  const wrapper = screen.getByRole('img', { name: 'Masterfade script logo' });
  expect(wrapper).toHaveClass('w-[180px]', 'max-w-full');
  expect(wrapper).toHaveStyle({ aspectRatio: '1221 / 349' });
  expect(screen.getByAltText('Masterfade').getAttribute('src')).toContain('masterfade-script-sidebar-light.png');

  state.theme = 'light';
  rerender(<MasterfadeLogo variant="sidebar" />);
  expect(screen.getByAltText('Masterfade').getAttribute('src')).toContain('masterfade-script-sidebar-dark.png');
});

test('otras variantes conservan sus recursos y proporcion anteriores', () => {
  render(<MasterfadeLogo variant="hero" />);
  const wrapper = screen.getByRole('img', { name: 'Masterfade script logo' });
  expect(wrapper).toHaveClass('w-[300px]');
  expect(wrapper).toHaveStyle({ aspectRatio: '1600 / 475' });
  expect(screen.getByAltText('Masterfade').getAttribute('src')).toContain('masterfade-script-light.png');
  expect(screen.getByAltText('Masterfade').getAttribute('src')).not.toContain('sidebar');
});
