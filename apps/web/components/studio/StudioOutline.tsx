'use client';

import { useState } from 'react';
import { BLOCK_META, type BlockType, type LayoutBlock } from '@/lib/site-blocks';

export type OutlineCount = { total: number; drafts: number };

type StudioOutlineProps = {
  blocks: LayoutBlock[];
  selected: string;
  counts: Record<string, OutlineCount | undefined>;
  drafts: Set<string>;
  /** Etiqueta con que se ve una sección en la lista. */
  labelOf: (block: LayoutBlock) => string;
  busy: boolean;
  onSelect: (id: string) => void;
  onMove: (index: number, delta: number) => void;
  onToggle: (block: LayoutBlock) => void;
  onRemove: (block: LayoutBlock) => void;
  onAdd: (type: BlockType) => void;
};

const NOUNS: Partial<Record<BlockType | 'portada', [string, string]>> = {
  portada: ['foto', 'fotos'],
  cartelera: ['show', 'shows'],
  historias: ['historia', 'historias'],
  noticias: ['noticia', 'noticias'],
  galeria: ['foto', 'fotos'],
  aliados: ['aliado', 'aliados'],
};

function countLabel(kind: BlockType | 'portada', count?: OutlineCount) {
  const noun = NOUNS[kind];
  if (!count || !noun) return 'Textos y fotos';
  if (!count.total) return `Sin ${noun[1]} todavía`;
  const label = `${count.total} ${count.total === 1 ? noun[0] : noun[1]}`;
  return count.drafts ? `${label} · ${count.drafts} sin publicar` : label;
}

/** La maqueta: la página de arriba a abajo, tal como sale en el sitio. */
export function StudioOutline({
  blocks,
  selected,
  counts,
  drafts,
  labelOf,
  busy,
  onSelect,
  onMove,
  onToggle,
  onRemove,
  onAdd,
}: StudioOutlineProps) {
  const [adding, setAdding] = useState(false);
  const customTypes = (Object.keys(BLOCK_META) as BlockType[]).filter((t) => BLOCK_META[t].custom);

  return (
    <nav className="st-outline" aria-label="Maqueta del sitio">
      <p className="st-outline__cap">La página, de arriba a abajo</p>
      <ol>
        <li className={`st-block ${selected === 'portada' ? 'is-selected' : ''}`.trim()}>
          <button type="button" className="st-block__main" aria-current={selected === 'portada'} onClick={() => onSelect('portada')}>
            <strong>Portada</strong>
            <span>{countLabel('portada', counts.portada)}</span>
          </button>
          <span className="st-block__fixed">Siempre arriba</span>
        </li>
        {blocks.map((block, index) => {
          const meta = BLOCK_META[block.type];
          const label = labelOf(block);
          return (
            <li
              key={block.id}
              className={`st-block ${selected === block.id ? 'is-selected' : ''} ${block.visible ? '' : 'is-off'}`.trim()}
            >
              <button type="button" className="st-block__main" aria-current={selected === block.id} onClick={() => onSelect(block.id)}>
                <strong>{label}</strong>
                <span>
                  {!block.visible ? 'Quitada del sitio' : drafts.has(block.id) ? 'Borrador sin publicar' : countLabel(block.type, counts[block.id])}
                </span>
              </button>
              <div className="st-order">
                <button type="button" disabled={busy || index === 0} aria-label={`Subir ${label}`} onClick={() => onMove(index, -1)}>
                  Subir
                </button>
                <button
                  type="button"
                  disabled={busy || index === blocks.length - 1}
                  aria-label={`Bajar ${label}`}
                  onClick={() => onMove(index, 1)}
                >
                  Bajar
                </button>
                <button type="button" disabled={busy} aria-label={`${block.visible ? 'Quitar del sitio' : 'Poner en el sitio'} ${label}`} onClick={() => onToggle(block)}>
                  {block.visible ? 'Quitar' : 'Poner'}
                </button>
                {meta.custom ? (
                  <button type="button" disabled={busy} aria-label={`Borrar ${label}`} onClick={() => onRemove(block)}>
                    Borrar
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {adding ? (
        <div className="st-outline__add">
          {customTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setAdding(false);
                onAdd(type);
              }}
            >
              <strong>{BLOCK_META[type].label}</strong>
              <span>{BLOCK_META[type].description}</span>
            </button>
          ))}
          <button type="button" className="btn-quiet" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="btn ghost btn-sm st-outline__addbtn" disabled={busy} onClick={() => setAdding(true)}>
          + Poner sección nueva
        </button>
      )}
      <button
        type="button"
        className={`st-block__main st-outline__settings ${selected === 'ajustes' ? 'is-selected' : ''}`.trim()}
        aria-current={selected === 'ajustes'}
        onClick={() => onSelect('ajustes')}
      >
        <strong>Datos del sitio</strong>
        <span>{drafts.has('ajustes') ? 'Borrador sin publicar' : 'Correo, teléfono, redes y lema'}</span>
      </button>
    </nav>
  );
}
