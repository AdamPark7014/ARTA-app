'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  lat?: number;
  lng?: number;
  title?: string;
  address?: string;
};

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: object) => unknown;
        Marker: new (opts: object) => unknown;
      };
    };
    __artaMapsLoading?: Promise<void>;
  }
}

function loadMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__artaMapsLoading) return window.__artaMapsLoading;
  window.__artaMapsLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });
  return window.__artaMapsLoading;
}

export function VenueMap({
  lat = Number(process.env.NEXT_PUBLIC_VENUE_LAT || 19.0414),
  lng = Number(process.env.NEXT_PUBLIC_VENUE_LNG || -98.2063),
  title = 'arta PRODUCCIONES · Puebla',
  address = process.env.NEXT_PUBLIC_VENUE_ADDRESS || 'Puebla, México',
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (!apiKey) {
      setError('Mapa pendiente de API key');
      return;
    }
    let cancelled = false;
    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !ref.current || !window.google?.maps) return;
        const map = new window.google.maps.Map(ref.current, {
          center: { lat, lng },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#1a1f1c' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f1c' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#a8a196' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a322e' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#09090b' }] },
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          ],
        });
        new window.google.maps.Marker({
          position: { lat, lng },
          map,
          title,
        });
        setReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error de mapa'));
    return () => {
      cancelled = true;
    };
  }, [apiKey, lat, lng, title]);

  const embedFallback = `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;

  return (
    <div className="venue-map-wrap">
      {apiKey && !error ? (
        <div ref={ref} className="venue-map" role="img" aria-label={title} />
      ) : (
        <iframe
          title={title}
          className="venue-map"
          src={embedFallback}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
      <div className="venue-map-meta">
        <strong>{title}</strong>
        <span>{address}</span>
        {!ready && apiKey && !error ? <span className="muted">Cargando mapa…</span> : null}
        {error ? <span className="muted">{error}</span> : null}
      </div>
    </div>
  );
}
