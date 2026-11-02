/**
 * Mapa por dirección, sin llave de API: la versión anterior dependía de una clave de Google Maps
 * que no estaba configurada y enseñaba «Mapa pendiente de API key». La dirección se edita en Studio.
 */
export function VenueMap({ address }: { address: string }) {
  return (
    <div className="sa-map">
      <iframe
        title={`Mapa: ${address}`}
        src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

export function directionsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
