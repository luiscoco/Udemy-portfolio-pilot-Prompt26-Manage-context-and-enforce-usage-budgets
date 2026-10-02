import { requireAuthorization } from '../../../../lib/authorization';
import { portfolioResponse } from '../../../../lib/portfolio-http';
import { reconcileStaleRuns } from '../../../../lib/chat';
export const runtime = 'nodejs';
/** Durable run outcome; foreign and missing runs are both 404. */
export function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  return portfolioResponse(request, async () => {
    const auth = await requireAuthorization(request);
    const run = await auth.chat.getRun((await context.params).runId);
    if (run.status === 'running') await reconcileStaleRuns({ ownerId: auth.user.id, chat: auth.chat });
    return { run: await auth.chat.getRun(run.id) };
  });
}
