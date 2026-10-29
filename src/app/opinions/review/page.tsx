import { Suspense } from "react";
import { OpinionEditor } from "../../../components/citizen/opinion-editor";
export default function OpinionReviewPage() {
  return (
    <Suspense fallback={<p>검토할 내용을 불러오고 있어요.</p>}>
      <OpinionEditor stage="review" />
    </Suspense>
  );
}
