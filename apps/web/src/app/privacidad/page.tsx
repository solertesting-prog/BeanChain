import type { Metadata } from 'next';
import { Prose } from '@/components/prose';

export const metadata: Metadata = { title: 'Política de privacidad' };

export default function PrivacyPage() {
  return (
    <Prose>
      <h1 className="text-4xl">Política de privacidad</h1>
      <p className="text-muted">[Documento pendiente de redacción conforme al RGPD.]</p>
      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Datos de cuenta: nombre, correo, país de residencia y teléfono.</li>
        <li>Verificación de identidad: la realiza nuestro proveedor de KYC; guardamos el resultado y la referencia.</li>
        <li>Datos de inversión y pagos.</li>
      </ul>
      <h2>Qué no guardamos en la blockchain</h2>
      <p>
        En la blockchain sólo figuran tu dirección de wallet, tu país en código numérico y una referencia opaca de la
        verificación. Nunca tu nombre ni tus documentos.
      </p>
    </Prose>
  );
}
