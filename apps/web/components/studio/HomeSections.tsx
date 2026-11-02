'use client';

import { useState } from 'react';
import { BLOCK_META, pageMeta, type BlockType, type LayoutBlock, type LayoutPage } from '@/lib/site-blocks';

type HomeSectionsProps = {
  blocks: LayoutBlock[];
  pages: LayoutPage[];
  drafts: Set<string>;
  labelOf: (block: LayoutBlock) => string;
  busy: boolean;
  onOpen: (block: LayoutBlock) => void;
  onMove: (index: number, delta: number) => void;
  onToggle: (block: LayoutBlock) => void;
  onRemove: (block: LayoutBlock) => void;
  onAdd: (type: BlockType) => void;
};

/** Lo que Inicio resume, de arriba a abajo. Cada sección lleva a la página donde se edita su contenido. */
export function HomeSections({ blocks, pages, drafts, labelOf, busy, onOpen, onMove, onToggle, onRemove, onAdd }: HomeSectionsProps) {
  const [adding, setAdding] = useState(false);
  const customTypes = (Object.keys(BLOCK_META) as BlockType[]).filter((t) => BLOCK_META[t].custom);

  return (
    <div className="st-home">
      <h3 className="st-subtitle">Secciones de Inicio</h3>
      <p className="st-note">Inicio resume el sitio de arriba a abajo: acomódalo aquí. Lo de cada sección se edita en su página.</p>
      <ol className="st-home__list">
        {blocks.map((block, index) => {
          const meta = BLOCK_META[block.type];
          const label = labelOf(block);
          const pageOff = pages.some((page) => page.key === meta.page && !page.visible);
          return (
            <li key={block.id} className={`st-home__row ${block.visible && !pageOff ? '' : 'is-off'}`.trim()}>
              <button type="button" className="st-home__open" onClick={() => onOpen(block)}>
                <strong>{label}</strong>
                <span>
                  {pageOff
                    ? 'No sale: su página está quitada del sitio'
                    : !block.visible
                    ? 'Quitada de Inicio'
                    : drafts.has(block.id)
                      ? 'Borrador sin publicar'
                      : meta.custom
                        ? meta.label
                        : `Se edita en ${pageMeta(meta.page as NonNullable<typeof meta.page>).label}`}
                </span>
              </button>
              <div className="st-order">
                <button type="button" disabled={busy || index === 0} aria-label={`Subir ${label}`} onClick={() => onMove(index, -1)}>
                  Subir
                </button>
                <button type="button" disabled={busy || index === blocks.length - 1} aria-label={`Bajar ${label}`} onClick={() => onMove(index, 1)}>
                  Bajar
                </button>
                <button type="button" disabled={busy} aria-label={`${block.visible ? 'Quitar de Inicio' : 'Poner en Inicio'} ${label}`} onClick={() => onToggle(block)}>
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
        <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => setAdding(true)}>
          + Poner sección nueva
        </button>
      )}
    </div>
  );
}
