'use client';

import { useState } from 'react';
import { FlashMessage, FormGrid } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';

export type SchemaColumn = {
  id: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'time' | 'date';
  width?: number;
  total?: boolean;
};

export type SchemaItem = {
  id: string;
  label: string;
  type?: string;
  done?: boolean;
  value?: string | number | null;
  options?: string[];
  /** Tabla: columnas; los renglones nacen vacíos en cada evento. */
  columns?: SchemaColumn[];
  rows?: unknown[];
  minRows?: number;
  /** No cuenta para el avance si está vacío. */
  optional?: boolean;
};

export type SchemaSection = {
  id: string;
  title: string;
  items: SchemaItem[];
};

type Props = {
  templateId: string;
  initial: { sections?: SchemaSection[] };
  onSaved: () => void;
};

const FIELD_TYPES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'check', label: 'Casilla', hint: 'En el PDF: casilla con nota opcional' },
  { value: 'text', label: 'Texto', hint: 'En el PDF: etiqueta + línea' },
  { value: 'longtext', label: 'Texto largo', hint: 'En el PDF: recuadro de varias líneas (observaciones)' },
  { value: 'number', label: 'Número', hint: 'En el PDF: cantidad' },
  { value: 'date', label: 'Fecha', hint: 'En el PDF: fecha' },
  { value: 'time', label: 'Hora', hint: 'En el PDF: hora (horario de montaje, ingreso…)' },
  { value: 'yesno', label: 'Sí / No', hint: 'En el PDF: SÍ [ ] NO [ ]' },
  { value: 'select', label: 'Opciones', hint: 'Si incluye “Otra”, el checklist pide el nombre' },
  { value: 'table', label: 'Tabla', hint: 'Renglones que se capturan en el evento (rooming, minuto a minuto…); termina una columna con * para sumarla' },
  { value: 'attachment', label: 'Adjunto', hint: 'Archivo o link que vive en el propio formato (rider, layout, artes…)' },
];

export const TYPE_LABELS: Record<string, string> = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function slug(label: string, fallback: string): string {
  const s = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return s || fallback;
}

/** «Nombre, Habitación, Cantidad*» → columnas tipadas; `*` = se suma en el pie. */
export function parseColumns(text: string, previous: SchemaColumn[] = []): SchemaColumn[] {
  const used = new Set<string>();
  return text
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw, i) => {
      const total = raw.endsWith('*');
      const label = total ? raw.slice(0, -1).trim() : raw;
      let id = slug(label, `col_${i + 1}`);
      while (used.has(id)) id = `${id}_${i + 1}`;
      used.add(id);
      const prev = previous.find((c) => c.id === id || c.label === label);
      const type: SchemaColumn['type'] = prev?.type
        ? prev.type
        : /precio|costo|importe|\$/i.test(label)
          ? 'money'
          : total || /cantidad|n[uú]m|no\.|#|parte/i.test(label)
            ? 'number'
            : /^hora/i.test(label)
              ? 'time'
              : /^fecha|check-?in|check-?out/i.test(label)
                ? 'date'
                : 'text';
      return { id, label, type, total: total || (prev?.total && type === 'number') || undefined, width: prev?.width };
    });
}

export function columnsText(columns: SchemaColumn[] = []): string {
  return columns.map((c) => `${c.label}${c.total ? '*' : ''}`).join(', ');
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

function msgVariant(msg: string): 'success' | 'error' | 'warn' | 'info' {
  const m = msg.toLowerCase();
  if (m.includes('error')) return 'error';
  if (m.includes('guardad')) return 'success';
  return 'info';
}

export function TemplateSchemaEditor({ templateId, initial, onSaved }: Props) {
  const [sections, setSections] = useState<SchemaSection[]>(
    (initial.sections || []).map((s) => ({
      ...s,
      items: (s.items || []).map((it) => ({ ...it })),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  function patchSection(idx: number, patch: Partial<SchemaSection>) {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function patchItem(sIdx: number, iIdx: number, patch: Partial<SchemaItem>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i !== sIdx
          ? s
          : { ...s, items: s.items.map((it, j) => (j === iIdx ? { ...it, ...patch } : it)) },
      ),
    );
  }

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await api(`/checklists/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ schemaJson: { sections } }),
      });
      setMsg('Plantilla guardada. En cada evento se genera un PDF embebido al llenar/guardar.');
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tpl-editor">
      <div className="tpl-editor-toolbar panel-head">
        <p className="muted kpi-sub">
          Diseña el formato del <strong>PDF</strong>: bloques y preguntas. Al crear un evento se
          instancia y el PDF se regenera solo al guardar o firmar.
        </p>
        <div className="row">
          <button className="btn ghost" type="button" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Ocultar PDF' : 'Ver hoja PDF'}
          </button>
          <button className="btn" type="button" disabled={saving} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>
      </div>

      {msg ? (
        <FlashMessage variant={msgVariant(msg)} onDismiss={() => setMsg('')}>
          {msg}
        </FlashMessage>
      ) : null}

      <div className={showPreview ? 'tpl-editor-grid' : 'stack'}>
        <div className="stack">
          {sections.map((section, sIdx) => (
            <div className="tpl-block" key={section.id}>
              <div className="tpl-block-head">
                <FormGrid cols={1}>
                  <label>
                    <span className="muted kpi-sub">Bloque {sIdx + 1}</span>
                    <input
                      value={section.title}
                      onChange={(e) => patchSection(sIdx, { title: e.target.value })}
                      placeholder="Nombre del bloque (ej. Hotel, Firmas…)"
                    />
                  </label>
                </FormGrid>
                <div className="row tpl-question__actions">
                  <button
                    className="btn ghost"
                    type="button"
                    title="Subir"
                    disabled={sIdx === 0}
                    onClick={() => setSections((prev) => moveItem(prev, sIdx, sIdx - 1))}
                  >
                    ↑
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    title="Bajar"
                    disabled={sIdx === sections.length - 1}
                    onClick={() => setSections((prev) => moveItem(prev, sIdx, sIdx + 1))}
                  >
                    ↓
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      if (confirm('¿Quitar este bloque y sus preguntas?')) {
                        setSections((prev) => prev.filter((_, i) => i !== sIdx));
                      }
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <div className="tpl-questions">
                {section.items.map((item, iIdx) => {
                  const typeMeta = FIELD_TYPES.find((t) => t.value === (item.type || 'check'));
                  return (
                    <div className="tpl-question" key={item.id}>
                      <div className="row">
                        <span className="tpl-q-num muted">{iIdx + 1}</span>
                        <div className="stack tpl-question__main">
                          <input
                            value={item.label}
                            onChange={(e) => patchItem(sIdx, iIdx, { label: e.target.value })}
                            placeholder="Pregunta o campo (ej. Nombre del hotel)"
                          />
                          <div className="tpl-type-row">
                            {FIELD_TYPES.map((t) => (
                              <button
                                key={t.value}
                                type="button"
                                className={`tpl-type ${(item.type || 'check') === t.value ? 'on' : ''}`}
                                onClick={() =>
                                  patchItem(sIdx, iIdx, {
                                    type: t.value,
                                    options:
                                      t.value === 'select'
                                        ? item.options?.length
                                          ? item.options
                                          : ['Opción A', 'Opción B']
                                        : undefined,
                                    columns:
                                      t.value === 'table'
                                        ? item.columns?.length
                                          ? item.columns
                                          : [
                                              { id: 'concepto', label: 'Concepto', type: 'text' },
                                              { id: 'detalle', label: 'Detalle', type: 'text' },
                                            ]
                                        : undefined,
                                    rows: t.value === 'table' ? [] : undefined,
                                    minRows: t.value === 'table' ? item.minRows ?? 6 : undefined,
                                  })
                                }
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                          <span className="muted kpi-sub">{typeMeta?.hint}</span>
                          {(item.type || 'check') === 'select' ? (
                            <FormGrid cols={1}>
                              <label>
                                <span className="muted kpi-sub">Opciones (separadas por coma)</span>
                                <input
                                  value={(item.options || []).join(', ')}
                                  onChange={(e) =>
                                    patchItem(sIdx, iIdx, {
                                      options: e.target.value
                                        .split(',')
                                        .map((x) => x.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  placeholder="Arema, eTicket, Otra (con Otra pide nombre libre)"
                                />
                              </label>
                            </FormGrid>
                          ) : null}
                          {item.type === 'table' ? (
                            <FormGrid cols={1}>
                              <label>
                                <span className="muted kpi-sub">Columnas (separadas por coma; * al final = se suma)</span>
                                <input
                                  defaultValue={columnsText(item.columns)}
                                  onBlur={(e) =>
                                    patchItem(sIdx, iIdx, { columns: parseColumns(e.target.value, item.columns) })
                                  }
                                  placeholder="Avenida, Primera parte*, Segunda parte*, Tercera parte*"
                                />
                              </label>
                              <span className="muted kpi-sub">
                                {(item.columns || []).map((c) => `${c.label} (${c.type || 'texto'}${c.total ? ', suma' : ''})`).join(' · ') || 'Sin columnas'}
                              </span>
                            </FormGrid>
                          ) : null}
                          {item.type !== 'check' ? (
                            <label className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!item.optional}
                                onChange={(e) => patchItem(sIdx, iIdx, { optional: e.target.checked || undefined })}
                              />
                              <span className="muted kpi-sub">Opcional (vacío no resta avance)</span>
                            </label>
                          ) : null}
                        </div>
                        <div className="stack tpl-question__actions">
                          <button
                            className="btn ghost"
                            type="button"
                            disabled={iIdx === 0}
                            onClick={() =>
                              patchSection(sIdx, { items: moveItem(section.items, iIdx, iIdx - 1) })
                            }
                          >
                            ↑
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            disabled={iIdx === section.items.length - 1}
                            onClick={() =>
                              patchSection(sIdx, { items: moveItem(section.items, iIdx, iIdx + 1) })
                            }
                          >
                            ↓
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              patchSection(sIdx, {
                                items: section.items.filter((_, j) => j !== iIdx),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="btn ghost"
                type="button"
                onClick={() =>
                  patchSection(sIdx, {
                    items: [
                      ...section.items,
                      { id: uid('item'), label: '', type: 'check', done: false },
                    ],
                  })
                }
              >
                + Agregar pregunta
              </button>
            </div>
          ))}

          <button
            className="btn ghost"
            type="button"
            onClick={() =>
              setSections((prev) => [
                ...prev,
                {
                  id: uid('sec'),
                  title: '',
                  items: [{ id: uid('item'), label: '', type: 'check', done: false }],
                },
              ])
            }
          >
            + Agregar bloque
          </button>
        </div>

        {showPreview ? (
          <div className="panel tpl-preview">
            <div className="panel-head">
              <h2>Hoja PDF</h2>
            </div>
            <div className="panel-body">
              <p className="muted kpi-sub">Así queda el documento embebido en el evento (carta / Letter).</p>
              <div className="pdf-sheet">
                <div className="pdf-sheet-brand">ARTA PRODUCCIONES</div>
                <h3>Vista de plantilla</h3>
                <div className="pdf-meta">
                  Evento: (nombre del show)
                  <br />
                  Generado automáticamente al guardar · Firmas al pie
                </div>
                {sections.length ? (
                  sections.map((s) => (
                    <div key={s.id}>
                      <div className="pdf-sec">{s.title || 'Sin título'}</div>
                      {(s.items || []).map((it) => {
                        const t = it.type || 'check';
                        if (t === 'check') {
                          return (
                            <div className="pdf-line" key={it.id}>
                              [ ]&nbsp;&nbsp;{it.label || 'Pregunta'}
                            </div>
                          );
                        }
                        if (t === 'table') {
                          return (
                            <div className="pdf-line" key={it.id}>
                              {it.label || 'Tabla'}:
                              <span className="pdf-meta"> [{(it.columns || []).map((c) => c.label).join(' | ') || 'columnas'}]</span>
                            </div>
                          );
                        }
                        if (t === 'yesno') {
                          return (
                            <div className="pdf-line" key={it.id}>
                              {it.label || 'Campo'}: [ ] SÍ&nbsp;&nbsp;[ ] NO
                            </div>
                          );
                        }
                        return (
                          <div className="pdf-line" key={it.id}>
                            {it.label || 'Campo'}: <span className="pdf-blank" />
                            {t === 'select' && it.options?.length ? (
                              <span className="pdf-meta"> ({it.options.join(' / ')})</span>
                            ) : null}
                            {t === 'attachment' ? <span className="pdf-meta"> (archivo o link)</span> : null}
                            {t === 'longtext' ? <span className="pdf-meta"> (recuadro)</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <p className="muted">Agrega un bloque para ver el PDF.</p>
                )}
                <div className="pdf-sec">Firmas digitales</div>
                <div className="pdf-line">ENTREGADO · ________________</div>
                <div className="pdf-line">AUTORIZADO · ________________</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
