/**
 * Pantallas de ejemplo de la plataforma con que Arta lleva cada fecha. Son dibujos con datos
 * inventados y así lo dice el pie: no enseñan números de ningún show real.
 */
const TIMELINE = [
  { time: '10:00', label: 'Montaje de escenario', state: 'done' },
  { time: '15:30', label: 'Prueba de sonido', state: 'done' },
  { time: '18:30', label: 'Apertura de puertas', state: 'now' },
  { time: '20:30', label: 'Inicia el show', state: 'next' },
  { time: '23:00', label: 'Desmontaje', state: 'next' },
];

const BUDGET = [
  { label: 'Producción', share: 82 },
  { label: 'Artista', share: 100 },
  { label: 'Campaña', share: 64 },
  { label: 'Hospitalidad', share: 47 },
];

const ORDERS = [
  { label: 'Audio e iluminación', state: 'Pagada', tone: 'ok' },
  { label: 'Plantas de luz', state: 'Autorizada', tone: 'ok' },
  { label: 'Catering de camerinos', state: 'Por firmar', tone: 'wait' },
];

const CAMPAIGN = [
  { label: 'Espectaculares', count: 6 },
  { label: 'Pendones', count: 40 },
  { label: 'Radio', count: 3 },
  { label: 'Redes', count: 18 },
];

export function SystemShowcase() {
  return (
    <>
      <ul className="sa-sys">
        <li className="sa-sys__card sa-sys__card--big" data-reveal>
          <h3>Minuto a minuto</h3>
          <p>Todo el equipo ve lo mismo, a la misma hora.</p>
          <ol className="sa-sys__timeline">
            {TIMELINE.map((step) => (
              <li key={step.time} className={`is-${step.state}`}>
                <time>{step.time}</time>
                <span>{step.label}</span>
                {step.state === 'now' ? <em>Ahora</em> : null}
              </li>
            ))}
          </ol>
        </li>
        <li className="sa-sys__card" data-reveal>
          <h3>Corrida financiera</h3>
          <p>Cuánto se ha ejercido, por rubro y en vivo.</p>
          <ul className="sa-sys__bars">
            {BUDGET.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <b style={{ width: `${row.share}%` }} />
              </li>
            ))}
          </ul>
        </li>
        <li className="sa-sys__card" data-reveal>
          <h3>Órdenes de compra</h3>
          <p>Nada se paga sin su firma.</p>
          <ul className="sa-sys__rows">
            {ORDERS.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <em className={`is-${row.tone}`}>{row.state}</em>
              </li>
            ))}
          </ul>
        </li>
        <li className="sa-sys__card" data-reveal>
          <h3>Campaña con testigos</h3>
          <p>Cada anuncio, con su foto de que salió.</p>
          <ul className="sa-sys__grid">
            {CAMPAIGN.map((row) => (
              <li key={row.label}>
                <strong>{row.count}</strong>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="sa-sys__card" data-reveal>
          <h3>Equipo en sitio</h3>
          <p>Apps para iPhone y Android, con el equipo en un mapa.</p>
          <div className="sa-sys__map" aria-hidden="true">
            <i style={{ left: '22%', top: '34%' }} />
            <i style={{ left: '48%', top: '58%' }} />
            <i style={{ left: '63%', top: '30%' }} />
            <i style={{ left: '78%', top: '66%' }} />
          </div>
        </li>
      </ul>
      <p className="sa-sys__note">Pantallas de ejemplo, con datos ilustrativos.</p>
    </>
  );
}
