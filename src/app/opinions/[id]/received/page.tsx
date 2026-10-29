import { ReceiptScreen } from "../../../../components/citizen/opinions";
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceiptScreen id={id} />;
}
