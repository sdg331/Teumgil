import { Suspense } from "react";
import { HomeScreen } from "../components/citizen/discovery";
export default function HomePage() {
  return (
    <Suspense fallback={<p>시장을 불러오고 있어요.</p>}>
      <HomeScreen />
    </Suspense>
  );
}
