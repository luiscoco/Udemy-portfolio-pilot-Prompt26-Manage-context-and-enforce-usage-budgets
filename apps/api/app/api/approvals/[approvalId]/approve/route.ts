import { requireAuthorization } from '../../../../../lib/authorization';
import { portfolioResponse } from '../../../../../lib/portfolio-http';
import { chatBody, reconcileStaleRuns } from '../../../../../lib/chat';
import { chatCoordinator } from '../../../../../lib/chat-coordinator';
import { PortfolioError } from '@portfolio-pilot/db';
export const runtime = 'nodejs';
export function POST(request: Request, context: { params: Promise<{ approvalId: string }> }) {
 return portfolioResponse(request, async () => {
  const auth = await requireAuthorization(request);
  const id = (await context.params).approvalId;
  const row = await auth.approvals.get(id);
  if (!chatCoordinator.isActive(row.runId) && ['pending','approved'].includes(row.status)) {
   await reconcileStaleRuns({ ownerId: auth.user.id, chat: auth.chat });
   throw new PortfolioError(409, 'The approval callback was lost. Confirm by sending a new proposal in this conversation.');
  }
  return { approval: await auth.approvals.decide(id, 'approved', await chatBody(request)) };
 });
}
