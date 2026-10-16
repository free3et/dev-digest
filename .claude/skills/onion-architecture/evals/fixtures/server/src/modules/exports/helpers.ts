export interface ExportRow {
  id: string;
  runId: string;
  path: string;
  line: number;
  severity: string;
  title: string;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: ExportRow[]): string {
  const header = 'id,path,line,severity,title';
  const lines = rows.map((r) =>
    [r.id, r.path, r.line, r.severity, r.title].map(csvCell).join(','),
  );
  return [header, ...lines].join('\n');
}

export function toSarif(rows: ExportRow[]): string {
  return JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'devdigest' } },
        results: rows.map((r) => ({
          ruleId: r.severity,
          message: { text: r.title },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: r.path },
                region: { startLine: r.line },
              },
            },
          ],
        })),
      },
    ],
  });
}
