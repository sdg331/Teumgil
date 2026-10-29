import { Suspense } from 'react';
import { OperatorInbox } from '../../components/operations/operator-inbox';
import { Skeleton } from '../../components/ui';

export default function OperatorPage() { return <Suspense fallback={<Skeleton rows={4} />}><OperatorInbox /></Suspense>; }
