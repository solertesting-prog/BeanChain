import type { Metadata } from 'next';
import { Prose } from '@/components/prose';

export const metadata: Metadata = { title: 'Términos de uso' };

export default function TermsPage() {
  return (
    <Prose>
      <h1 className="text-4xl">Términos de uso</h1>
      <p className="text-muted">[Documento pendiente de redacción por el despacho de abogados.]</p>
      <h2>Contenido mínimo</h2>
      <ul>
        <li>Identificación de la sociedad emisora y, en su caso, del proveedor de servicios de financiación participativa.</li>
        <li>Naturaleza jurídica de los tokens y derechos que confieren.</li>
        <li>Proceso de inversión, pagos, reservas y devoluciones.</li>
        <li>Custodia de wallets y recuperación de acceso.</li>
        <li>Limitación de responsabilidad, ley aplicable y jurisdicción.</li>
        <li>Procedimiento de reclamaciones.</li>
      </ul>
    </Prose>
  );
}
