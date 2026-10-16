'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RegPlate } from '@/components/reg-plate';
import { parseCsv, isBlankRow, toCsv } from '@/lib/csv';
import { FIELD_GROUPS, autoMap, buildRows, type FieldKey, type Mapping, type RowIssue } from '@/lib/import';
import { ukDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { importBatch, type BatchResult } from './actions';

const BATCH = 250;
const MAX_ROWS = 20000;

type Totals = Omit<BatchResult, 'errors'> & { errors: RowIssue[] };
const emptyTotals: Totals = { customers_created: 0, customers_matched: 0, vehicles_created: 0, vehicles_updated: 0, skipped: 0, errors: [] };

export function ImportWizard() {
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][]; firstLine: number } | null>(null);
  const [map, setMap] = useState<Mapping>({});
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<(Totals & { failed?: string }) | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const built = useMemo(() => (file ? buildRows(file.rows, map, file.firstLine) : null), [file, map]);
  const hasCustomer = map.name != null || map.first_name != null || map.last_name != null || map.mobile != null || map.phone != null || map.email != null;
  const ready = !!built?.rows.length && (hasCustomer || map.registration != null);

  async function readFile(f: File) {
    setReadError('');
    if (/\.(xlsx|xls|numbers|ods)$/i.test(f.name)) {
      setReadError('That is a spreadsheet file. Open it in Excel (or Google Sheets), choose File → Save As → CSV, then upload the CSV.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) { setReadError('That file is over 10 MB. Split it into smaller files.'); return; }
    let text = await f.text();
    if (text.includes('�')) {
      // Older Excel exports are Windows-1252, not UTF-8
      text = new TextDecoder('windows-1252').decode(await f.arrayBuffer());
    }
    const all = parseCsv(text);
    const headerIdx = all.findIndex((r) => !isBlankRow(r));
    if (headerIdx < 0 || all.length - headerIdx < 2) { setReadError('No rows found. The first row should be column headings.'); return; }
    const rows = all.slice(headerIdx + 1);
    if (rows.length > MAX_ROWS) { setReadError(`That file has ${rows.length.toLocaleString()} rows. Import up to ${MAX_ROWS.toLocaleString()} at a time.`); return; }
    const headers = all[headerIdx].map((h, i) => h.trim() || `Column ${i + 1}`);
    setFile({ name: f.name, headers, rows, firstLine: headerIdx + 2 });
    setMap(autoMap(headers));
    setResult(null);
  }

  async function run() {
    if (!built) return;
    const rows = built.rows;
    const totals: Totals = { ...emptyTotals, errors: [] };
    setProgress({ done: 0, total: rows.length });
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const r = await importBatch(chunk, consent, i + BATCH >= rows.length);
      if ('error' in r) {
        setResult({ ...totals, failed: `Stopped at row ${chunk[0].line}: ${r.error}. Rows before this were imported; running the same file again will not create duplicates.` });
        setProgress(null);
        return;
      }
      totals.customers_created += r.customers_created;
      totals.customers_matched += r.customers_matched;
      totals.vehicles_created += r.vehicles_created;
      totals.vehicles_updated += r.vehicles_updated;
      totals.skipped += r.skipped;
      totals.errors.push(...r.errors.map((e) => ({ line: e.row, message: e.message })));
      setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
    }
    setResult(totals);
    setProgress(null);
  }

  function downloadProblems(issues: RowIssue[]) {
    const csv = toCsv([['Row', 'Problem', ...file!.headers], ...issues.map((p) => [p.line, p.message, ...(file!.rows[p.line - file!.firstLine] ?? [])])]);
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'import-problems.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() { setFile(null); setMap({}); setResult(null); setConsent(false); if (input.current) input.current.value = ''; }

  /* ---------- Finished ---------- */
  if (result) {
    const problems = [...(built?.issues ?? []), ...result.errors].sort((a, b) => a.line - b.line);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {result.failed ? <AlertTriangle className="size-5 text-destructive" /> : <CheckCircle2 className="size-5 text-emerald-600" />}
            {result.failed ? 'Import stopped' : 'Import finished'}
          </CardTitle>
          {result.failed && <CardDescription className="text-destructive">{result.failed}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="New customers" value={result.customers_created} />
            <Stat label="Matched existing" value={result.customers_matched} hint="Same phone or email" />
            <Stat label="New vehicles" value={result.vehicles_created} />
            <Stat label="Vehicles updated" value={result.vehicles_updated} hint="Blanks filled in" />
          </dl>
          {problems.length > 0 && <Problems issues={problems} onDownload={() => downloadProblems(problems)} />}
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/customers">View customers</Link></Button>
            <Button variant="outline" asChild><Link href="/reminders">See MOT reminders</Link></Button>
            <Button variant="ghost" onClick={reset}>Import another file</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ---------- Importing ---------- */
  if (progress) {
    const pct = Math.round((progress.done / progress.total) * 100);
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="font-medium">Importing {progress.total.toLocaleString()} rows…</p>
          <div className="mx-auto h-2 max-w-sm overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">{progress.done.toLocaleString()} done. Keep this page open.</p>
        </CardContent>
      </Card>
    );
  }

  /* ---------- Choose file ---------- */
  if (!file) {
    return (
      <div className="space-y-4">
        <Card
          className={cn('border-2 border-dashed py-0 transition-colors', dragging && 'border-primary bg-primary/5')}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
        >
          <label className="flex cursor-pointer flex-col items-center gap-3 px-4 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Upload className="size-6" /></span>
            <span className="font-medium">Drop a CSV file here, or click to choose</span>
            <span className="max-w-md text-sm text-muted-foreground">
              One row per vehicle, with the owner’s details on the same row. Customers with several vehicles can appear on several rows.
            </span>
            <input suppressHydrationWarning ref={input} type="file" accept=".csv,text/csv,.txt" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
          </label>
        </Card>
        {readError && <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{readError}</p>}
        <Card>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
            <Tip title="From another system">Most garage systems can export customers or vehicles to CSV or Excel. Ask your old provider if you can’t find it.</Tip>
            <Tip title="From Excel">Save the sheet as CSV first (File → Save As → CSV). Column names don’t need to match ours, you’ll pick them next.</Tip>
            <Tip title="Safe to repeat">Customers are matched by phone or email and vehicles by registration, so importing twice won’t create duplicates.</Tip>
          </CardContent>
        </Card>
        <Button variant="outline" asChild>
          <a href="/import-template.csv" download><Download /> Download a template</a>
        </Button>
      </div>
    );
  }

  /* ---------- Match columns and preview ---------- */
  const used = new Map<number, FieldKey>();
  for (const [k, v] of Object.entries(map)) if (v != null) used.set(v, k as FieldKey);
  const issues = built?.issues ?? [];
  const withVehicle = built?.rows.filter((r) => r.registration).length ?? 0;
  const withMot = built?.rows.filter((r) => r.mot_due).length ?? 0;
  const sample = (k: FieldKey) => {
    const i = map[k];
    if (i == null) return '';
    return file.rows.map((r) => r[i]?.trim()).find(Boolean) ?? '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <FileSpreadsheet className="size-5 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
        <Badge variant="secondary">{built?.rows.length.toLocaleString()} rows to import</Badge>
        <Button variant="ghost" size="sm" onClick={reset}><X /> Choose another</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Match your columns</CardTitle>
          <CardDescription>We’ve matched what we could from your column headings. Check them and pick any we missed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 lg:grid-cols-2">
          {FIELD_GROUPS.map((g) => (
            <div key={g.label} className="space-y-2">
              <h3 className="text-sm font-semibold">{g.label}</h3>
              {g.fields.map((f) => (
                <div key={f.key} className="grid grid-cols-[8.5rem_1fr] items-start gap-3">
                  <Label htmlFor={`map-${f.key}`} className="pt-2 text-sm leading-tight font-normal text-muted-foreground">{f.label}</Label>
                  <div className="min-w-0">
                    <NativeSelect id={`map-${f.key}`} className="h-8"
                      value={map[f.key] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Number(e.target.value);
                        setMap((m) => {
                          const next = { ...m };
                          for (const k of Object.keys(next) as FieldKey[]) if (next[k] === v) delete next[k];
                          if (v == null) delete next[f.key]; else next[f.key] = v;
                          return next;
                        });
                      }}>
                      <option value="">Don’t import</option>
                      {file.headers.map((h, i) => (
                        <option key={i} value={i}>{h}{used.has(i) && used.get(i) !== f.key ? ' (in use)' : ''}</option>
                      ))}
                    </NativeSelect>
                    {map[f.key] != null && sample(f.key) && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">e.g. {sample(f.key)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            {withVehicle.toLocaleString()} vehicles, {withMot.toLocaleString()} with an MOT due date.
            {issues.length > 0 && ` ${issues.length} values will be left blank (listed below).`}
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12">Row</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>MOT due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {built?.rows.slice(0, 8).map((r) => (
                <TableRow key={r.line}>
                  <TableCell className="text-muted-foreground">{r.line}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name ?? <span className="text-muted-foreground">—</span>}</div>
                    {r.postcode && <div className="text-xs text-muted-foreground">{r.postcode}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>{r.phone}</div><div>{r.email}</div>
                  </TableCell>
                  <TableCell>
                    {r.registration ? (
                      <div className="flex items-center gap-2">
                        <RegPlate reg={r.registration} />
                        <span className="text-xs text-muted-foreground">{[r.make, r.model].filter(Boolean).join(' ')}</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{r.mot_due ? ukDate(r.mot_due) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {issues.length > 0 && <Problems issues={issues} onDownload={() => downloadProblems(issues)} />}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Switch id="consent" checked={consent} onCheckedChange={setConsent} className="mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="consent">These customers agreed to MOT and service reminders</Label>
              <p className="text-sm text-muted-foreground">
                Only turn this on if they agreed when you took their details.
                {map.consent != null ? ' Otherwise the “Reminder consent” column is used for each customer.' : ' Otherwise they won’t get reminders until you tick consent on their record.'}
              </p>
            </div>
          </div>
          {!ready && (
            <p className="text-sm text-destructive">Match at least a registration, or a customer name, phone or email.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={!ready}>
              <Upload /> Import {built?.rows.length.toLocaleString()} rows
            </Button>
            <p className="text-xs text-muted-foreground">Existing customers and vehicles are never overwritten, only blank details are filled in.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

function Problems({ issues, onDownload }: { issues: RowIssue[]; onDownload: () => void }) {
  return (
    <Card className="gap-0 border-amber-500/40 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <AlertTriangle className="size-4 text-amber-600" />
        <span className="flex-1 text-sm font-medium">{issues.length} {issues.length === 1 ? 'problem' : 'problems'} to check</span>
        <Button variant="outline" size="sm" onClick={onDownload}><Download /> Download list</Button>
      </div>
      <ul className="max-h-60 divide-y overflow-y-auto text-sm">
        {issues.slice(0, 100).map((p, i) => (
          <li key={i} className="flex gap-3 px-4 py-2">
            <span className="w-14 shrink-0 text-muted-foreground">Row {p.line}</span>
            <span>{p.message}</span>
          </li>
        ))}
        {issues.length > 100 && <li className="px-4 py-2 text-muted-foreground">…and {issues.length - 100} more in the download</li>}
      </ul>
    </Card>
  );
}
