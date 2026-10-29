import { MerchantInbox } from '../../components/operations/merchant-inbox';
import { Suspense } from 'react';
import { Skeleton } from '../../components/ui';

export default function MerchantPage() { return <Suspense fallback={<Skeleton rows={3} />}><MerchantInbox /></Suspense>; }
