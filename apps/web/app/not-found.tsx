import Link from 'next/link';

/** Una dirección que no existe: se dice claro y se ofrece la salida. */
export default function NotFound() {
  return (
    <main className="nf">
      <p className="nf__code">404</p>
      <h1 className="nf__title">Esta página no existe</h1>
      <p className="nf__text">Puede que el enlace sea viejo o que el contenido se haya movido.</p>
      <Link className="nf__action" href="/dashboard">
        Ir al inicio
      </Link>
    </main>
  );
}
