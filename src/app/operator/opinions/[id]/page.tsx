import { Suspense } from 'react';
import { OperatorDetail } from '../../../../components/operations/operator-detail';
import { Skeleton } from '../../../../components/ui';

export default async function OperatorOpinionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<Skeleton rows={5} />}><OperatorDetail id={id} /></Suspense>;
}
