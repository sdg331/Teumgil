import { Suspense } from "react";
import { MarketScreen } from "../../../components/citizen/discovery";
export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<p>점포를 불러오고 있어요.</p>}>
      <MarketScreen id={id} />
    </Suspense>
  );
}
