import { Suspense } from "react";
import WorkspaceView from "@/components/workspace/WorkspaceView";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;
  return (
    <Suspense fallback={null}>
      <WorkspaceView blockId={blockId} />
    </Suspense>
  );
}
