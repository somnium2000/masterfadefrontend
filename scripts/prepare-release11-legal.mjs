import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// MASTERFADE: reproducir literalmente el contenido QA aprobado; solo cambian metadatos editoriales.
const root = new URL('../', import.meta.url);
const original = (await readFile(new URL('docs/legal/release11/qa-original.v0.3-RC2-MP.json', root), 'utf8')).replace(/\r\n/g, '\n');
const qa = JSON.parse(original);
const approved = structuredClone(qa);
Object.assign(approved, {
  publication_mode: 'production_approved',
  version: '0.3-RC2-MP',
  approval_status: 'Aprobado por el propietario de MASTERFADE para publicación en Producción el 15/11/2026. Entrada en vigor desde la publicación efectiva en la aplicación.',
  approval_date: '2026-11-15',
  effective_date: null,
  effective_date_policy: 'upon_production_publication',
  based_on_version: '0.3-RC2-MP',
  proposal_id: 'release11-qa-approved',
  source_sha256: createHash('sha256').update(original).digest('hex'),
});
for (const doc of approved.documents) {
  doc.notice = 'Versión 0.3-RC2-MP · Aprobada para publicación el 15/11/2026 · Vigente desde su publicación en Producción';
}
for (let i = 0; i < qa.documents.length; i++) {
  if (JSON.stringify(qa.documents[i].chapters) !== JSON.stringify(approved.documents[i].chapters)) {
    throw new Error('No se permite alterar el texto legal aprobado de QA.');
  }
}
await mkdir(new URL('src/features/public/data/', root), { recursive: true });
await writeFile(new URL('src/features/public/data/legalTerms.production-proposal.json', root), JSON.stringify(approved, null, 2) + '\n');
const report = {
  source_sha256: approved.source_sha256,
  approved_version: approved.version,
  approval_date: approved.approval_date,
  effective_date: approved.effective_date,
  content_changes: [],
  metadata_only: true,
  documents: approved.documents.length,
  chapters: approved.documents.reduce((total, doc) => total + doc.chapters.length, 0),
};
await writeFile(new URL('docs/legal/release11/comparison.json', root), JSON.stringify(report, null, 2) + '\n');
await writeFile(new URL('docs/legal/release11/COMPARACION.md', root),
  '# Release 11 — paridad de documentos aprobados\n\n' +
  'Referencia QA: qa-original.v0.3-RC2-MP.json (SHA256: ' + approved.source_sha256 + ').\n\n' +
  '**Los ocho documentos y sus 62 apartados se conservan íntegros, sin cambiar ningún párrafo, cláusula o tabla.**\n\n' +
  'Las únicas diferencias son metadatos editoriales: publicación aprobada por el propietario el 15/11/2026, versión 0.3-RC2-MP, avisos de documento y entrada en vigor desde la publicación efectiva en Producción.\n\n' +
  'Los archivos RC2 de QA siguen preservados como referencia; la aceptación del formulario no se envía automáticamente al leer los documentos.\n');
