import { MerchantDetail } from '../../../../components/operations/merchant-detail';
import { Suspense } from 'react';
import { Skeleton } from '../../../../components/ui';

export default async function MerchantTransmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<Skeleton rows={4} />}><MerchantDetail id={id} /></Suspense>;
}
