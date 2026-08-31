'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { FileViewer } from '@/components/files/FileViewer';
import { SheetEditor } from '@/components/files/SheetEditor';
import { PdfEditor } from '@/components/files/PdfEditor';
import {
  buildFinanceCorridaWorkbook,
  financeCorridaFileName,
  workbookToXlsxBlob,
} from '@/lib/finance-sheet-template';
import { replaceEventFile } from '@/lib/file-save';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useSaveHotkey } from '@/lib/use-save-hotkey';
import type { EventDetail, EventFile, FinanceData, FinanceRow } from '@/components/events/event-detail.types';

type EventFinancePanelProps = {
  event: EventDetail;
  financeLocked: boolean;
  canFinance: boolean;
  closed: boolean;
  saving: boolean;
  financeDraft: FinanceData;
  setFinanceDraft: Dispatch<SetStateAction<FinanceData>>;
  /** Importa Excel a la tabla resumen (opcional / legado). */
  onImportExcel: (file: File) => Promise<void>;
  onSaveFinance: () => Promise<void>;
  onPatchRow: (idx: number, patch: Partial<FinanceRow>) => void;
  /** Excel/PDF embebidos de la corrida (`module=finance`). */
  files: EventFile[];
  onUploadFile: (file: File) => Promise<void>;
  onReplaceFile: (fileId: string, file: File) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  onFilesChanged: () => void | Promise<void>;
};

function kindLabel(kind?: string | null) {
  if (kind === 'excel') return 'Excel';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return 'Imagen';
  return kind || 'Archivo';
}

function isSheet(name: string, kind?: string | null) {
  return kind === 'excel' || /\.(xlsx?|csv)$/i.test(name);
}

function isPdf(name: string, kind?: string | null) {
  return kind === 'pdf' || /\.pdf$/i.test(name);
}

export function EventFinancePanel({
  event,
  financeLocked,
  canFinance,
  closed,
  saving,
  financeDraft,
  setFinanceDraft,
  onImportExcel,
  onSaveFinance,
  onPatchRow,
  files,
  onUploadFile,
  onReplaceFile,
  onDeleteFile,
  onFilesChanged,
}: EventFinancePanelProps) {
  const net = Number(financeDraft.totalIncome || 0) - Number(financeDraft.totalExpense || 0);
  const canEditRows = canFinance && !financeLocked && !closed;
  const canEditFiles = canEditRows;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openNewestSheet, setOpenNewestSheet] = useState(false);
  const [showLegacyTable, setShowLegacyTable] = useState(false);

  useSaveHotkey(canEditRows && !saving && showLegacyTable, onSaveFinance);

  useEffect(() => {
    if (!openNewestSheet || !files.length) return;
    const sheets = files
      .filter((f) => isSheet(f.fileName, f.kind))
      .slice()
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    const newest = sheets[0];
    if (newest) {
      setExpandedId(null);
      setEditingId(newest.id);
    }
    setOpenNewestSheet(false);
  }, [files, openNewestSheet]);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function createCorridaSheet() {
    await withBusy(async () => {
      const wb = buildFinanceCorridaWorkbook({
        eventName: event.name,
        venue: event.venue,
        city: event.city,
        startsAt: event.startsAt,
        artist: event.artist,
      });
      const blob = workbookToXlsxBlob(wb);
      const name = financeCorridaFileName(event.name);
      const file = new File([blob], name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await onUploadFile(file);
      setOpenNewestSheet(true);
    });
  }

  function addRow() {
    setFinanceDraft((d) => ({
      ...d,
      rows: [...d.rows, { concept: '', type: 'expense', amount: 0 }],
    }));
  }

  return (
    <div className="stack">
      {financeLocked ? (
        <div className="module-banner module-banner--warn">
          Corrida bloqueada — el evento está cerrado o la corrida fue sellada. Solo lectura.
        </div>
      ) : null}

      {!canFinance ? (
        <div className="module-banner">
          Vista de corrida. Solo finanzas (gerencia y dirección) pueden editar e importar.
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Corrida financiera · Excel · {files.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Sube tu formato Excel o crea una hoja editable aquí (filas, totales). El PDF solo sirve
              para presentar; la corrida viva es la hoja.
            </p>
          </div>
          {canEditFiles ? (
            <div className="panel-head-actions">
              {financeLocked ? <StatusBadge value="Bloqueada" kind="raw" className="warn" /> : null}
              <button
                className="btn btn-sm"
                type="button"
                disabled={busy}
                onClick={() => void createCorridaSheet()}
              >
                Nueva hoja de corrida
              </button>
              <label className="btn ghost btn-sm module-upload">
                {busy ? 'Subiendo…' : 'Subir mi Excel'}
                <input
                  type="file"
                  hidden
                  disabled={busy}
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) withBusy(() => onUploadFile(f));
                  }}
                />
              </label>
            </div>
          ) : null}
        </div>
        <div className="panel-body">
          {!files.length ? (
            <EmptyState
              title="Sin Excel de corrida"
              description={
                canEditFiles
                  ? 'Crea una hoja con ingresos/egresos o sube el Excel que ya usan en Arta. Se edita aquí sin descargar.'
                  : 'Cuando finanzas suba la corrida, se verá aquí embebida.'
              }
            >
              {canEditFiles ? (
                <div className="row row--tight" style={{ marginTop: '0.75rem' }}>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void createCorridaSheet()}
                  >
                    Nueva hoja de corrida
                  </button>
                </div>
              ) : null}
            </EmptyState>
          ) : (
            <div className="campaign-files">
              {files.map((f) => {
                const open = expandedId === f.id;
                const editing = editingId === f.id;
                const editable = isSheet(f.fileName, f.kind) || isPdf(f.fileName, f.kind);
                return (
                  <div
                    key={f.id}
                    className={`campaign-file ${open || editing ? 'campaign-file--open' : ''}`}
                  >
                    <div className="campaign-file__head">
                      <div className="campaign-file__meta">
                        <strong>{f.fileName}</strong>
                        <StatusBadge value={kindLabel(f.kind)} kind="raw" />
                        {f.createdAt ? (
                          <span className="muted kpi-sub">
                            {new Date(f.createdAt).toLocaleDateString('es-MX')}
                          </span>
                        ) : null}
                      </div>
                      <div className="panel-head-actions">
                        {editable ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => {
                              setExpandedId(null);
                              setEditingId(editing ? null : f.id);
                            }}
                          >
                            {editing
                              ? 'Cerrar editor'
                              : isSheet(f.fileName, f.kind)
                                ? 'Editar hoja'
                                : 'Anotar PDF'}
                          </button>
                        ) : null}
                        <button
                          className={open ? 'btn btn-sm' : 'btn ghost btn-sm'}
                          type="button"
                          aria-expanded={open}
                          onClick={() => {
                            setEditingId(null);
                            setExpandedId(open ? null : f.id);
                          }}
                        >
                          {open ? 'Contraer' : 'Vista previa'}
                        </button>
                        {canEditFiles ? (
                          <label className="btn ghost btn-sm module-upload">
                            Actualizar
                            <input
                              type="file"
                              hidden
                              disabled={busy}
                              accept=".xlsx,.xls,.csv,.pdf"
                              onChange={(e) => {
                                const next = e.target.files?.[0];
                                e.target.value = '';
                                if (next) withBusy(() => onReplaceFile(f.id, next));
                              }}
                            />
                          </label>
                        ) : null}
                        <a className="btn ghost btn-sm" href={f.url} target="_blank" rel="noreferrer">
                          Descargar
                        </a>
                        {canEditFiles ? (
                          <button
                            className="btn ghost btn-sm btn-danger"
                            type="button"
                            disabled={busy}
                            onClick={() => withBusy(() => onDeleteFile(f.id))}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {open ? (
                      <div className="campaign-file__body">
                        <FileViewer
                          url={f.url}
                          fileName={f.fileName}
                          kind={f.kind}
                          cacheKey={f.createdAt}
                        />
                      </div>
                    ) : null}
                    {editing ? (
                      <div className="campaign-file__body">
                        {isSheet(f.fileName, f.kind) ? (
                          <SheetEditor
                            key={f.id}
                            url={f.url}
                            fileName={f.fileName}
                            canEdit={canEditFiles}
                            variant="finance"
                            onSave={replaceEventFile(f.id)}
                            onSaved={onFilesChanged}
                          />
                        ) : (
                          <div className="stack">
                            <div className="module-banner">
                              Prefiere Excel para la corrida editable. El PDF solo admite anotaciones.
                            </div>
                            <PdfEditor
                              key={f.id}
                              url={f.url}
                              fileName={f.fileName}
                              canEdit={canEditFiles}
                              onSave={replaceEventFile(f.id)}
                              onSaved={onFilesChanged}
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Resumen rápido (opcional)</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              KPIs y tabla simple. La corrida oficial es el Excel de arriba.
            </p>
          </div>
          <div className="panel-head-actions">
            <button
              className="btn ghost btn-sm"
              type="button"
              onClick={() => setShowLegacyTable((v) => !v)}
            >
              {showLegacyTable ? 'Ocultar tabla' : 'Mostrar tabla simple'}
            </button>
            {canEditRows && showLegacyTable ? (
              <>
                <label className="btn ghost btn-sm module-upload">
                  Importar a tabla
                  <input
                    type="file"
                    hidden
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImportExcel(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={saving}
                  onClick={onSaveFinance}
                  title="Ctrl+S / ⌘S"
                >
                  {saving ? 'Guardando…' : 'Guardar resumen'}
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="panel-body stack">
          <FormGrid cols={3}>
            <div className="kpi">
              <div className="label">Ingresos</div>
              <div className="value value--money">
                ${Number(financeDraft.totalIncome || 0).toLocaleString('es-MX')}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Egresos</div>
              <div className="value value--money">
                ${Number(financeDraft.totalExpense || 0).toLocaleString('es-MX')}
              </div>
            </div>
            <div className={`kpi ${net < 0 ? 'kpi--danger' : ''}`}>
              <div className="label">Neto</div>
              <div className="value value--money">${net.toLocaleString('es-MX')}</div>
              <div className="kpi-sub muted">{net >= 0 ? 'Resultado positivo' : 'Resultado negativo'}</div>
            </div>
          </FormGrid>

          {showLegacyTable ? (
            !financeDraft.rows.length ? (
              <EmptyState
                title="Sin filas en el resumen"
                description="Agrega conceptos o importa a la tabla. Mejor: usa el Excel embebido arriba."
              >
                {canEditRows ? (
                  <div className="row row--tight" style={{ marginTop: '0.75rem' }}>
                    <button className="btn btn-sm" type="button" onClick={addRow}>
                      + Agregar concepto
                    </button>
                  </div>
                ) : null}
              </EmptyState>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th>Tipo</th>
                        <th>Monto</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {financeDraft.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              disabled={!canEditRows}
                              value={row.concept}
                              onChange={(e) => onPatchRow(idx, { concept: e.target.value })}
                              className="field"
                              placeholder="Concepto…"
                            />
                          </td>
                          <td>
                            <select
                              className="field"
                              disabled={!canEditRows}
                              value={row.type}
                              onChange={(e) =>
                                onPatchRow(idx, { type: e.target.value as 'income' | 'expense' })
                              }
                            >
                              <option value="income">Ingreso</option>
                              <option value="expense">Egreso</option>
                            </select>
                          </td>
                          <td>
                            <input
                              className="field"
                              type="number"
                              disabled={!canEditRows}
                              value={row.amount}
                              onChange={(e) => onPatchRow(idx, { amount: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            {canEditRows ? (
                              <button
                                className="btn ghost btn-sm btn-danger"
                                type="button"
                                onClick={() =>
                                  setFinanceDraft((prev) => ({
                                    ...prev,
                                    rows: prev.rows.filter((_, i) => i !== idx),
                                  }))
                                }
                              >
                                Quitar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canEditRows ? (
                  <button className="btn ghost btn-sm" type="button" onClick={addRow}>
                    + Agregar concepto
                  </button>
                ) : null}
              </>
            )
          ) : (
            <p className="muted kpi-sub">
              Los KPIs se actualizan si usas «Importar a tabla» o editas el resumen. El Excel de
              arriba no se sobrescribe con esta tabla.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
