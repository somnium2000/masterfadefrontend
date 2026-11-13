// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import LegalTermsPage from '../LegalTermsPage.jsx';
import legalTerms from '../../data/legalTerms.v0.3-RC2-MP.json';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';
import App from '../../../../App.jsx';

vi.mock('../../../../hooks/usePrivateCommerce.js', () => ({ default: () => ({ booking: false, vipPurchase: false }) }));
vi.mock('../../../../context/AuthContext.jsx', async importOriginal => ({
  ...await importOriginal(), useAuth: () => ({ isAuthenticated: false, isHydrated: true, isHydrating: false, user: null, roles: [], branchIds: [], empresaId: null }),
}));
afterEach(cleanup);
const mount = () => render(<ThemeProvider><MemoryRouter><LegalTermsPage /></MemoryRouter></ThemeProvider>);

test('conserva íntegro RC1 y usa versión QA 0.3-RC2-MP con estructura 8/62/115/1', () => {
  const raw = readFileSync('src/features/public/data/legalTerms.v0.3-RC1.json');
  expect(createHash('sha256').update(raw).digest('hex')).toBe('a03303b016034d13edd868c2876389d201af272242ed7dfbc395a740994fd9ef');
  expect(legalTerms.version).toBe('0.3-RC2-MP');
  expect(legalTerms.publication_mode).toBe('qa_review_only');
  const rewards = legalTerms.documents.find(document => document.id === 'masterpuntos');
  const rewardText = rewards.chapters.flatMap(chapter => chapter.blocks).map(block => block.text || '').join(' ');
  expect(rewardText).toMatch(/pago válido|pago y reserva/);
  expect(rewardText).toMatch(/reagendar|reagendamiento/);
  expect(rewardText).toMatch(/acompañantes/);
  expect(rewardText).not.toMatch(/se complete efectivamente/);
  expect(legalTerms.documents).toHaveLength(8);
  const chapters = legalTerms.documents.flatMap(doc => doc.chapters);
  expect(chapters).toHaveLength(62);
  expect(chapters.flatMap(ch => ch.blocks).filter(b => b.type === 'paragraph')).toHaveLength(115);
  expect(chapters.flatMap(ch => ch.blocks).filter(b => b.type === 'table')).toHaveLength(1);
});

test('renderiza cada título, párrafo y celda sin reescribir ni omitir contenido', () => {
  mount();
  expect(screen.getAllByRole('article')).toHaveLength(8);
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(62);
  expect(screen.queryByText(/Borrador 0.3-RC1/)).not.toBeInTheDocument();
  expect(screen.queryByText(/revisión en QA|pendiente de revisión legal|entrada en vigor.{0,40}pendiente|0\.3-RC1/i)).not.toBeInTheDocument();
  for (const doc of legalTerms.documents) {
    const article = document.getElementById(doc.id);
    expect(within(article).getByRole('heading', { level: 2 }).textContent).toBe(doc.title);
    const metadata = [...article.querySelector('header').querySelectorAll('p')].map(node => node.textContent);
    expect(metadata).toEqual([doc.kicker, doc.description]);
    for (const chapter of doc.chapters) {
      const section = document.getElementById(`${doc.id}-apartado-${chapter.number}`);
      expect(within(section).getByRole('heading', { level: 3 }).textContent).toBe(chapter.title);
      expect([...section.querySelectorAll('.legal-terms__paragraph')].map(p => p.textContent)).toEqual(chapter.blocks.filter(b => b.type === 'paragraph').map(b => b.text));
      for (const block of chapter.blocks.filter(b => b.type === 'table')) {
        const table = within(section).getByRole('table');
        expect([...table.querySelectorAll('th')].map(cell => cell.textContent)).toEqual(block.headers);
        expect([...table.querySelectorAll('tbody tr')].map(row => [...row.cells].map(cell => cell.textContent))).toEqual(block.rows);
      }
    }
  }
});

test('todos los enlaces del índice tienen un destino único y existe el ancla de privacidad', () => {
  mount();
  const nav = screen.getByRole('navigation', { name: 'Índice de documentos legales' });
  expect(within(nav).getAllByRole('link', { hidden: true })).toHaveLength(70);
  for (const link of within(nav).getAllByRole('link', { hidden: true })) {
    const id = link.getAttribute('href').slice(1);
    expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
  }
  expect(document.getElementById('politica-de-privacidad')).toBeInTheDocument();
});

test('la ruta real de App es pública y conserva el destino de privacidad sin sesión', async () => {
  render(<ThemeProvider><MemoryRouter initialEntries={['/terminos-y-condiciones#politica-de-privacidad']}><App /></MemoryRouter></ThemeProvider>);
  expect(await screen.findByRole('heading', { level: 1, name: 'Términos y condiciones' })).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(8);
});

test('el ancla inicial espera las fuentes y se alinea sin animación después de cargar', async () => {
  let ready;
  const fontReady = new Promise(resolve => { ready = resolve; });
  const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  const previousScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  const scroll = vi.fn();
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fontReady } });
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  try {
    render(<ThemeProvider><MemoryRouter initialEntries={['/terminos-y-condiciones#politica-de-privacidad']}><LegalTermsPage /></MemoryRouter></ThemeProvider>);
    await act(async () => {});
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => ready());
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' }));
    expect(scroll.mock.contexts[0].id).toBe('politica-de-privacidad');
  } finally {
    cleanup();
    if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts); else delete document.fonts;
    if (previousScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', previousScroll); else delete Element.prototype.scrollIntoView;
  }
});
