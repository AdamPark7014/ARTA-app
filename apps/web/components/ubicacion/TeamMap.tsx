'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/** Teselas de OpenFreeMap: sin clave ni costo. Estilo claro y neutro, va con el panel. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const PUEBLA: [number, number] = [-98.2063, 19.0414];
const INK = '#141416';
/**
 * MapLibre 6 corre su worker como módulo ES y webpack vuelve su ruta un `file://`: se sirve de `public/maplibre`.
 * Son copia exacta de `node_modules/maplibre-gl/dist`: al subir la versión hay que volver a copiarlos.
 */
const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

export type MapMarker = { id: string; lat: number; lng: number; label: string; time?: string };

function asGeoJson(markers: MapMarker[], route: boolean) {
  const coords = markers.map((m) => [m.lng, m.lat] as [number, number]);
  return {
    line: {
      type: 'FeatureCollection' as const,
      features:
        route && coords.length > 1
          ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }]
          : [],
    },
    points: {
      type: 'FeatureCollection' as const,
      features: markers.map((m, i) => ({
        type: 'Feature' as const,
        properties: { label: m.label, last: route ? i === markers.length - 1 : true },
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] as [number, number] },
      })),
    },
  };
}

/**
 * El mapa de la ubicación: el último punto de cada persona, o el recorrido de una. La librería pesa, así
 * que se carga solo al abrir esta pantalla. Sin WebGL o sin teselas queda la liga a Google Maps.
 */
export function TeamMap({ markers, route = false }: { markers: MapMarker[]; route?: boolean }) {
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import('maplibre-gl') | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const data = useMemo(() => asGeoJson(markers, route), [markers, route]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const last = markers[markers.length - 1];

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      try {
        const lib = await import('maplibre-gl');
        if (cancelled) return;
        lib.setWorkerUrl(WORKER_URL);
        libRef.current = lib;
        const map = new lib.Map({
          container: node,
          style: MAP_STYLE,
          center: PUEBLA,
          zoom: 11,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        mapRef.current = map;
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
        map.on('load', () => {
          if (cancelled) return;
          if (timer) clearTimeout(timer);
          map.addSource('geo-line', { type: 'geojson', data: dataRef.current.line });
          map.addSource('geo-points', { type: 'geojson', data: dataRef.current.points });
          map.addLayer({
            id: 'geo-line',
            type: 'line',
            source: 'geo-line',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': INK, 'line-width': 3, 'line-opacity': 0.75 },
          });
          map.addLayer({
            id: 'geo-points',
            type: 'circle',
            source: 'geo-points',
            paint: {
              'circle-radius': ['case', ['get', 'last'], 7, 4],
              'circle-color': INK,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
          });
          map.addLayer({
            id: 'geo-labels',
            type: 'symbol',
            source: 'geo-points',
            filter: ['==', ['get', 'last'], true],
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-offset': [0, 1.3],
              'text-anchor': 'top',
              'text-font': ['Noto Sans Regular'],
            },
            paint: { 'text-color': INK, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
          });
          setState('ready');
        });
        timer = setTimeout(() => {
          if (!cancelled && !map.loaded()) setState('failed');
        }, 12_000);
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || state !== 'ready') return;
    (map.getSource('geo-line') as GeoJSONSource | undefined)?.setData(data.line);
    (map.getSource('geo-points') as GeoJSONSource | undefined)?.setData(data.points);
    const coords = data.points.features.map((f) => f.geometry.coordinates);
    if (coords.length === 1) map.jumpTo({ center: coords[0], zoom: 15 });
    if (coords.length > 1) {
      const bounds = new lib.LngLatBounds(coords[0], coords[0]);
      for (const c of coords) bounds.extend(c);
      map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 0 });
    }
  }, [data, state]);

  return (
    <div className="geo-map" data-state={state}>
      <div
        ref={host}
        className="geo-map__canvas"
        role="img"
        aria-label={route ? `Recorrido con ${markers.length} puntos` : `Última ubicación de ${markers.length} personas`}
      />
      {state === 'ready' && !markers.length ? <div className="geo-map__note">Sin puntos en este día.</div> : null}
      {state === 'failed' ? (
        <div className="geo-map__note">
          No se pudo dibujar el mapa.
          {last ? (
            <a href={`https://www.google.com/maps?q=${last.lat},${last.lng}`} target="_blank" rel="noreferrer">
              Ver el último punto en Google Maps
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
