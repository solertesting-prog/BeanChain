import type { Metadata } from 'next';
import { Prose } from '@/components/prose';

export const metadata: Metadata = { title: 'Riesgos de la inversión' };

const RISKS = [
  ['Pérdida del capital', 'Puedes perder todo lo invertido. Esta inversión no está cubierta por ningún fondo de garantía de depósitos ni de inversiones.'],
  ['Riesgo agrícola', 'Sequías, lluvias excesivas, plagas o enfermedades como la moniliasis del cacao o la roya del café pueden reducir o arruinar la cosecha.'],
  ['Precio de mercado', 'Los precios internacionales del cacao y del café son muy volátiles. Aunque haya un precio pactado, el comprador podría renegociar o incumplir.'],
  ['Riesgo país', 'Las fincas están en Venezuela. Cambios políticos, controles de cambio, permisos de exportación o expropiaciones pueden afectar a la operación.'],
  ['Sanciones', 'El régimen de sanciones internacionales sobre Venezuela cambia con frecuencia. Una nueva restricción podría impedir pagos o exportaciones.'],
  ['Contraparte', 'Dependes del cumplimiento de la finca, del exportador, del comprador y de la sociedad emisora.'],
  ['Liquidez', 'No hay un mercado secundario organizado. Es posible que no puedas vender tus tokens antes del vencimiento, o sólo a un precio inferior.'],
  ['Tecnología', 'Los contratos inteligentes pueden contener errores. Si gestionas tu propia wallet y pierdes las claves, necesitarás un proceso de recuperación.'],
  ['Regulación', 'La normativa sobre activos tokenizados está en evolución y puede cambiar las condiciones de la inversión.'],
];

export default function RisksPage() {
  return (
    <Prose>
      <h1 className="text-4xl">Riesgos de invertir en cosechas</h1>
      <p className="text-lg text-muted">
        Invierte sólo dinero que puedas permitirte perder y no concentres tu patrimonio en un único proyecto. La rentabilidad
        estimada de cada oportunidad no está garantizada.
      </p>
      {RISKS.map(([title, body]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
      <p className="mt-8 text-sm text-muted">[Texto pendiente de revisión legal antes del lanzamiento.]</p>
    </Prose>
  );
}
