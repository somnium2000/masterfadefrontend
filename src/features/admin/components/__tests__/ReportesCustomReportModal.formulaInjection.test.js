import { describe, expect, test } from 'vitest';
import {
  buildCsvContent,
  buildExcelHtml,
  isSpreadsheetNumericValue,
  neutralizeSpreadsheetCell,
} from '../ReportesCustomReportModal.jsx';

const payloads = [
  '=1+1',
  '+1+1',
  '-1+1',
  '@SUM(1,1)',
  '=HYPERLINK("https://invalid.example")',
  '  =1+1',
  '\t=1+1',
  '\n=1+1',
  '\ufeff=1+1',
  '\u200b\uff1d1+1',
  '  \t\n@SUM("a,b";1)',
];

function sections(value) {
  return [{ label: value, items: [{ label: value, value }] }];
}

function escapeExpectedCsv(value) {
  return String(value).replace(/"/g, '""');
}

function escapeExpectedHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

describe('protección contra fórmulas en exportación personalizada', () => {
  test.each(payloads)('neutraliza %j sin modificar el valor de origen', (payload) => {
    const original = payload;
    expect(neutralizeSpreadsheetCell(payload)).toBe(`'${payload}`);
    expect(payload).toBe(original);
  });

  test.each(payloads)('CSV neutraliza %j antes de escapar delimitadores', (payload) => {
    const csv = buildCsvContent({ title: 'Reporte', dateFrom: '2026-10-01', dateTo: '2026-10-20', sections: sections(payload) });
    expect(csv).toContain(`'${escapeExpectedCsv(payload)}`);
  });

  test.each(payloads)('Excel neutraliza %j y fuerza las celdas como texto', (payload) => {
    const html = buildExcelHtml({ title: 'Reporte', generatedAt: '2026-10-20', dateFrom: '2026-10-01', dateTo: '2026-10-20', sections: sections(payload) });
    expect(html).toContain(`&#39;${escapeExpectedHtml(payload)}`);
    expect(html).toContain("mso-number-format:'\\@'");
  });

  test.each([123, -123.45, 0, '123.45', '-123.45', '+123.45', '1e3'])('conserva el valor numérico legítimo %j', (value) => {
    expect(isSpreadsheetNumericValue(value)).toBe(true);
    expect(neutralizeSpreadsheetCell(value)).toBe(value);
  });

  test('exportación completa conserva números y neutraliza todas sus secciones', () => {
    const reportSections = [
      { label: 'Ingresos', items: [{ label: '=Indicador', value: -123.45 }] },
      { label: '@Membresías', items: [{ label: 'Total', value: '+1+1' }] },
    ];
    const csv = buildCsvContent({ title: 'Reporte', dateFrom: '2026-10-01', dateTo: '2026-10-20', sections: reportSections });
    const html = buildExcelHtml({ title: 'Reporte', generatedAt: '2026-10-20', dateFrom: '2026-10-01', dateTo: '2026-10-20', sections: reportSections });
    expect(csv).toContain("'=Indicador,-123.45");
    expect(csv).toContain('# @Membresías');
    expect(csv).toContain("Total,'+1+1");
    expect(html).toContain('<td>-123.45</td>');
    expect(html).toContain('&#39;=Indicador');
    expect(html).toContain('<h3>@Membresías</h3>');
    expect(html).toContain('&#39;+1+1');
  });

  test('conserva nombres, fechas, comas, comillas, punto y coma y saltos internos', () => {
    const value = 'Nombre legítimo, "Sucursal"; línea\nsegunda línea';
    const csv = buildCsvContent({ title: 'Reporte', dateFrom: '2026-10-01', dateTo: '2026-10-20', sections: sections(value) });
    const html = buildExcelHtml({ title: 'Reporte', generatedAt: '2026-10-20', dateFrom: '2026-10-01', dateTo: '2026-10-20', sections: sections(value) });
    expect(neutralizeSpreadsheetCell(value)).toBe(value);
    expect(csv).toContain('"Nombre legítimo, ""Sucursal""; línea\nsegunda línea"');
    expect(html).toContain('Nombre legítimo, &quot;Sucursal&quot;; línea\nsegunda línea');
  });
});
