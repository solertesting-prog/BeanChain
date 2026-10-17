import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-4xl">Página no encontrada</h1>
      <p className="mt-2 text-muted">La dirección no existe o se ha movido.</p>
      <Link href="/" className="btn-primary mt-6">
        Volver al inicio
      </Link>
    </div>
  );
}
