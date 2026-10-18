import { toCsv } from '../../server/src/modules/exports/helpers.js';
import { cliAssertText } from './assert.js';

export interface SeededFinding {
  id: string;
  path: string;
  line: number;
  severity: 'suggestion' | 'warning' | 'critical';
  title: string;
}

export async function assertCsvDownload(downloaded: string, seeded: SeededFinding[]) {
  const expected = toCsv(
    seeded.map((f) => ({ ...f, runId: 'seed-run' })),
  );
  await cliAssertText(downloaded, expected);
}
