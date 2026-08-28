'use client';

import type { Dispatch, SetStateAction } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { FinanceData, FinanceRow } from '@/components/events/event-detail.types';

type EventFinancePanelProps = {
  financeLocked: boolean;
  canFinance: boolean;
  closed: boolean;
  saving: boolean;
  financeDraft: FinanceData;
  setFinanceDraft: Dispatch<SetStateAction<FinanceData>>;
  onImportExcel: (file: File) => Promise<void>;
  onSaveFinance: () => Promise<void>;
  onPatchRow: (idx: number, patch: Partial<FinanceRow>) => void;
};

export function EventFinancePanel({
  financeLocked,
  canFinance,
  closed,
  saving,
  financeDraft,
  setFinanceDraft,
  onImportExcel,
  onSaveFinance,
  onPatchRow,
}: EventFinancePanelProps) {
  const net = Number(financeDraft.totalIncome || 0) - Number(financeDraft.totalExpense || 0);
  const canEditRows = canFinance && !financeLocked && !closed;

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
            <h2>Corrida financiera</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Ingresos menos egresos del show. Importa Excel con columnas Concepto / Tipo / Monto.
            </p>
          </div>
          <div className="panel-head-actions">
            {financeLocked ? <StatusBadge value="Bloqueada" kind="raw" className="warn" /> : null}
            {canEditRows ? (
              <>
                <label className="btn ghost btn-sm module-upload">
                  Importar Excel
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
                <button className="btn btn-sm" type="button" disabled={saving} onClick={onSaveFinance}>
                  {saving ? 'Guardando…' : 'Guardar corrida'}
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

          {!financeDraft.rows.length ? (
            <EmptyState
              title="Sin filas en la corrida"
              description="Agrega conceptos manualmente o importa un Excel con ingresos y egresos."
            />
          ) : (
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
                          onChange={(e) => onPatchRow(idx, { type: e.target.value as 'income' | 'expense' })}
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
          )}

          {canEditRows ? (
            <button
              className="btn ghost btn-sm"
              type="button"
              onClick={() =>
                setFinanceDraft((prev) => ({
                  ...prev,
                  rows: [...prev.rows, { concept: '', type: 'expense', amount: 0 }],
                }))
              }
            >
              + Agregar concepto
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
