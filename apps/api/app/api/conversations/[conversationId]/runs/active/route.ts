import { requireAuthorization } from '../../../../../../lib/authorization';
import { portfolioResponse } from '../../../../../../lib/portfolio-http';
import { reconcileStaleRuns } from '../../../../../../lib/chat';
export const runtime = 'nodejs';
/** Reconnection recovery: the conversation's running run, if any (lost runs are first marked interrupted). */
export function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  return portfolioResponse(request, async () => {
    const auth = await requireAuthorization(request);
    const conversationId = (await context.params).conversationId;
    await auth.chat.get(conversationId);
    await reconcileStaleRuns({ ownerId: auth.user.id, chat: auth.chat });
    return { run: await auth.chat.activeRun(conversationId) };
  });
}
