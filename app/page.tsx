import Tourpass from '@/components/tourpass';
import { capabilities } from '@/lib/server';
import { places } from '@/lib/domain/catalog';
export default function Page() {
  return <Tourpass places={places} capabilities={capabilities()} />;
}
export const dynamic = 'force-dynamic';
