import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, ChevronUp } from 'lucide-react';
import PublicNavigationHeader from '../../../components/layout/PublicNavigationHeader.jsx';
import legalTerms from '../data/legalTerms.v0.3-RC1.json';
import './LegalTermsPage.css';

export default function LegalTermsPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return undefined;
    let active = true;
    let frame;
    // AM: Fuentes y logo pueden desplazar el ancla inicial en Safari al terminar de cargar.
    const images = [...document.querySelectorAll('.legal-terms header img')];
    Promise.allSettled([document.fonts?.ready, ...images.map(image => image.decode?.())]).then(() => {
      if (!active) return;
      frame = requestAnimationFrame(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [hash]);

  return (
    <div className="legal-terms mf-page-gradient min-h-screen text-[var(--mf-text)]">
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <PublicNavigationHeader />
        <main className="mt-8" aria-labelledby="legal-page-title">
          <header className="mb-8 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Documentos legales · Versión {legalTerms.version}</p>
            <h1 id="legal-page-title" className="mf-font-display mt-3 text-4xl leading-tight sm:text-5xl">Términos y condiciones</h1>
            <p className="mt-4 text-base leading-7 text-[var(--mf-text-2)]">Consulta los ocho documentos completos de MASTERFADE y sus condiciones de uso.</p>
            <div className="mt-5 rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] p-4 text-sm leading-6" role="note">
              <p className="font-semibold">{legalTerms.approval_status}</p>
              <p className="mt-1 text-[var(--mf-text-2)]">Contenido para revisión en QA. Pendiente de revisión legal y entrada en vigor.</p>
            </div>
          </header>
          <div className="legal-terms__layout">
            <nav id="indice-legal" aria-label="Índice de documentos legales" className="legal-terms__index mf-glass-surface rounded-2xl border border-[var(--mf-nav-border)] p-4">
              <h2 className="flex items-center gap-2 text-base font-semibold"><BookOpen size={18} aria-hidden="true" className="text-[var(--mf-accent)]" />Índice de documentos</h2>
              <ol className="mt-3 space-y-2">
                {legalTerms.documents.map(document => (
                  <li key={document.id}>
                    <a href={`#${document.id}`} className="legal-terms__index-link"><span className="mr-2 text-[var(--mf-accent)]">{String(document.number).padStart(2, '0')}</span>{document.title}</a>
                    <details className="ml-2 text-xs text-[var(--mf-text-2)]">
                      <summary className="min-h-11 cursor-pointer py-3">Ver apartados ({document.chapters.length})</summary>
                      <ol className="space-y-1 border-l border-[var(--mf-nav-border)] pl-3">{document.chapters.map(chapter => <li key={chapter.number}><a className="legal-terms__index-link" href={`#${document.id}-apartado-${chapter.number}`}>{chapter.title}</a></li>)}</ol>
                    </details>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="min-w-0 space-y-6">
              {legalTerms.documents.map(document => (
                <article key={document.id} id={document.id} aria-labelledby={`${document.id}-titulo`} tabIndex={-1} className="legal-terms__document mf-glass-surface rounded-3xl border border-[var(--mf-nav-border)] p-5 sm:p-8">
                  <header className="border-b border-[var(--mf-nav-border)] pb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">{document.kicker}</p>
                    <h2 id={`${document.id}-titulo`} className="mf-font-display mt-3 text-3xl leading-tight">{document.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">{document.description}</p>
                    <p className="mt-4 text-xs leading-5 text-[var(--mf-text-2)]">{document.notice}</p>
                  </header>
                  <div className="space-y-7 pt-6">{document.chapters.map(chapter => (
                    <section key={chapter.number} id={`${document.id}-apartado-${chapter.number}`} aria-labelledby={`${document.id}-apartado-${chapter.number}-titulo`} className="legal-terms__chapter">
                      <h3 id={`${document.id}-apartado-${chapter.number}-titulo`} className="mb-3 text-lg font-semibold leading-7">{chapter.title}</h3>
                      <div className="space-y-4">{chapter.blocks.map((block, index) => block.type === 'table' ? (
                        <div key={index}><p className="mb-2 text-xs leading-5 text-[var(--mf-text-2)] sm:hidden">Desliza la tabla para consultar todas las columnas.</p><div className="legal-terms__table-scroll" role="region" aria-label="Tabla de cookies y almacenamiento local" tabIndex={0}>
                          <table>
                            <caption className="sr-only">Cookies y almacenamiento local</caption>
                            <thead><tr>{block.headers.map((header, column) => <th key={column} scope="col">{header}</th>)}</tr></thead>
                            <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
                          </table>
                        </div></div>
                      ) : <p key={index} className="legal-terms__paragraph">{block.text}</p>)}</div>
                    </section>
                  ))}</div>
                  <a href="#indice-legal" className="legal-terms__back"><ChevronUp size={16} aria-hidden="true" />Volver al índice</a>
                </article>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
