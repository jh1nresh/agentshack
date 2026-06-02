import { NextResponse } from 'next/server';
import {
  listServiceSkills,
  receiptRollupsByWorkflowId,
  serviceDescriptor,
  SERVICE_ROUTER_VERSION,
} from '@/lib/service-gateway';
import { isLegacyWorkflowSlug } from '@/lib/legacy-workflow-slugs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/services
 *
 * Public AgentShack service catalog.
 * A service is the external abstraction for a runnable agent / workflow / skill.
 */
export async function GET() {
  try {
    const skills = await listServiceSkills();
    const visible = skills.filter(
      (skill) => !isLegacyWorkflowSlug(skill.gatewaySlug) && !isLegacyWorkflowSlug(skill.workflow?.slug),
    );

    const workflowIds = visible
      .map((skill) => skill.workflow?.id)
      .filter((id): id is string => Boolean(id));
    const rollups = await receiptRollupsByWorkflowId(workflowIds);
    const services = visible.map((skill) => serviceDescriptor(
      skill,
      skill.workflow ? rollups.get(skill.workflow.id) : undefined,
    ));

    return NextResponse.json({
      services,
      count: services.length,
      router: {
        version: SERVICE_ROUTER_VERSION,
        strategy: 'explicit service slug or workflow slug alias',
        best_agent_routing: 'planned',
      },
    });
  } catch (err) {
    console.error('[GET /api/v1/services] failed:', err);
    return NextResponse.json(
      { error: 'Service catalog unavailable' },
      { status: 500 },
    );
  }
}
