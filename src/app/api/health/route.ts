import { NextResponse } from 'next/server';
import { deploymentRevision, releaseRuntimeState } from '@/lib/release-readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      product: 'Maiat Dojo',
      revision: deploymentRevision(),
      ...releaseRuntimeState(),
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
