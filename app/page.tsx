import Tourpass from '@/components/tourpass';
import { capabilities, naverMapClientId } from '@/lib/server';
import { places } from '@/lib/domain/catalog';
export default function Page() {
  return (
    <Tourpass
      places={places}
      capabilities={capabilities()}
      naverMapClientId={naverMapClientId()}
    />
  );
}
export const dynamic = 'force-dynamic';
