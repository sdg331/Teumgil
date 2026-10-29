import { OpinionDetailScreen } from "../../../components/citizen/opinions";
export default async function OpinionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OpinionDetailScreen id={id} />;
}
