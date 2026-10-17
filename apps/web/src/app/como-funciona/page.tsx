import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/components/prose';

export const metadata: Metadata = { title: 'Cómo funciona' };

export default function HowItWorksPage() {
  return (
    <Prose>
      <h1 className="text-4xl">Cómo funciona BeanChain</h1>
      <p className="text-lg text-muted">
        Financiamos cosechas concretas de cacao y café. Cada cosecha tiene su propio token, su propio contrato y su propio
        resultado.
      </p>

      <h2>1. Seleccionamos la finca y el comprador</h2>
      <p>
        Antes de publicar una oportunidad revisamos la titularidad de la finca, su historial de producción y las listas de
        sanciones internacionales (OFAC, UE y ONU) de todas las partes. Además, exigimos una carta de compromiso de un comprador
        europeo que pagará la cosecha a un precio pactado.
      </p>

      <h2>2. Publicamos la oportunidad y emitimos el token</h2>
      <p>
        La sociedad emisora firma con la finca un contrato de prefinanciación. Al publicar, desplegamos un token ERC-3643 en la
        red Polygon con un número fijo de unidades. Cada token da derecho a una parte de los ingresos netos de esa cosecha.
      </p>
      <ul>
        <li>Sólo pueden tenerlo wallets de inversores que han pasado la verificación de identidad.</li>
        <li>Cada transferencia pasa por un módulo de cumplimiento que bloquea países no admitidos y límites por inversor.</li>
        <li>No representa la propiedad de la tierra: la finca no arriesga su terreno y tu derecho queda bien definido.</li>
      </ul>

      <h2>3. Inviertes</h2>
      <p>
        Eliges cuántos tokens quieres y pagas por transferencia SEPA o con tarjeta. Al confirmarse el pago, los tokens se emiten
        en tu wallet. Si no quieres gestionar claves, la plataforma te crea una wallet custodiada.
      </p>

      <h2>4. Sigues la cosecha</h2>
      <p>
        Publicamos cada etapa: floración, recolección, fermentación y secado, exportación y venta. Los informes, facturas y
        guías de exportación se registran con su huella digital en la blockchain, y puedes{' '}
        <Link href="/verificar">comprobar que no se han alterado</Link>.
      </p>

      <h2>5. Cobras</h2>
      <p>
        Cuando el comprador paga, el contrato inteligente reparte el capital y el rendimiento entre los titulares en proporción
        a sus tokens. Si vendes tus tokens antes, lo ya devengado sigue siendo tuyo.
      </p>

      <h2>Dónde se genera el valor del token</h2>
      <p>
        El token no depende de la especulación: su valor es la parte proporcional del margen de la venta. Si la cosecha se vende
        por 100 y los costes son 70, los 30 de margen se reparten según lo pactado entre inversores, finca y plataforma.
      </p>

      <p className="mt-8">
        <Link href="/riesgos">Lee los riesgos antes de invertir</Link>
      </p>
    </Prose>
  );
}
