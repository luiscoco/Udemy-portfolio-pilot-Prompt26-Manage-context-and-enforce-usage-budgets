import { requireAuthorization } from '../../../../../lib/authorization';
import { portfolioResponse } from '../../../../../lib/portfolio-http';
import { reconcileStaleRuns } from '../../../../../lib/chat';
export const runtime = 'nodejs';
export function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
 return portfolioResponse(request, async () => {
  const auth = await requireAuthorization(request);
  await reconcileStaleRuns({ ownerId: auth.user.id, chat: auth.chat });
  return { approvals: await auth.approvals.list((await context.params).runId) };
 });
}
