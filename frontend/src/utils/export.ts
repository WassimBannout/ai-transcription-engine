export interface ExportData {
  rawText: string;
  cleanedText: string | null;
  preset: string;
  timestamp: Date;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAsMarkdown(data: ExportData): void {
  const { rawText, cleanedText, preset, timestamp } = data;
  const dateStr = timestamp.toLocaleString();
  const slug = timestamp.getTime();

  const lines: string[] = [
    `# Transcript`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Generated | ${dateStr} |`,
    `| Domain | ${preset} |`,
    ``,
  ];

  if (cleanedText) {
    lines.push(
      `## Cleaned Transcript`,
      ``,
      cleanedText,
      ``,
      `---`,
      ``,
      `## Raw Transcript`,
      ``,
      rawText,
    );
  } else {
    lines.push(`## Transcript`, ``, rawText);
  }

  downloadFile(lines.join('\n'), `transcript-${slug}.md`, 'text/markdown');
}

export function exportAsText(data: ExportData): void {
  const content = data.cleanedText ?? data.rawText;
  downloadFile(content, `transcript-${data.timestamp.getTime()}.txt`, 'text/plain');
}

export function exportAsJson(data: ExportData): void {
  const payload = {
    generatedAt: data.timestamp.toISOString(),
    domain: data.preset,
    rawText: data.rawText,
    cleanedText: data.cleanedText ?? null,
  };
  downloadFile(
    JSON.stringify(payload, null, 2),
    `transcript-${data.timestamp.getTime()}.json`,
    'application/json',
  );
}
