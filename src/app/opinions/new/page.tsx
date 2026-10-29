import { Suspense } from "react";
import { OpinionEditor } from "../../../components/citizen/opinion-editor";
export default function OpinionNewPage() {
  return (
    <Suspense fallback={<p>작성 중인 내용을 불러오고 있어요.</p>}>
      <OpinionEditor stage="write" />
    </Suspense>
  );
}
