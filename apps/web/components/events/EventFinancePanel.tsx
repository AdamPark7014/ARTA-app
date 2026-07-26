'use client';

import type { Dispatch, SetStateAction } from 'react';
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
    <div className="panel">
      <div className="panel-head">
        <h2>Corrida financiera</h2>
        <div className="row">
          {financeLocked ? <span className="badge">LOCKED</span> : null}
          <span className="badge warn">Melissa · Chacho · Arturo</span>
          {canEditRows ? (
            <>
              <label className="btn ghost" style={{ cursor: 'pointer' }}>
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
              <button className="btn" type="button" disabled={saving} onClick={onSaveFinance}>
                {saving ? 'Guardando…' : 'Guardar corrida'}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="panel-body stack">
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Excel: columnas Concepto / Tipo (ingreso|egreso) / Monto. Si no hay encabezado, usa las primeras 3
          columnas.
        </p>
        <div className="row" style={{ gap: 24 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Ingresos
            </div>
            <strong>${Number(financeDraft.totalIncome || 0).toLocaleString('es-MX')}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Egresos
            </div>
            <strong>${Number(financeDraft.totalExpense || 0).toLocaleString('es-MX')}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Neto
            </div>
            <strong style={{ color: net >= 0 ? 'var(--ok, #2a7)' : 'var(--danger)' }}>
              ${net.toLocaleString('es-MX')}
            </strong>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Tipo</th>
              <th>Monto</th>
              <th></th>
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
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <select
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
                    type="number"
                    disabled={!canEditRows}
                    value={row.amount}
                    onChange={(e) => onPatchRow(idx, { amount: Number(e.target.value) })}
                  />
                </td>
                <td>
                  {canEditRows ? (
                    <button
                      className="btn ghost"
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
        {canEditRows ? (
          <button
            className="btn ghost"
            type="button"
            onClick={() =>
              setFinanceDraft((prev) => ({
                ...prev,
                rows: [...prev.rows, { concept: '', type: 'expense', amount: 0 }],
              }))
            }
          >
            + Fila
          </button>
        ) : null}
      </div>
    </div>
  );
}
