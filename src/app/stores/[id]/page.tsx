import { Suspense } from "react";
import { StoreScreen } from "../../../components/citizen/discovery";
export default async function StorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<p>점포 정보를 불러오고 있어요.</p>}>
      <StoreScreen id={id} />
    </Suspense>
  );
}
