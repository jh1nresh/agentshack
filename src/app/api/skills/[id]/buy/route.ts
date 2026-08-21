import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyPaymentProof,
  decodePaymentProof,
  splitPayment,
  type X402PaymentProof,
} from '@/lib/x402';
import {
  createPurchaseAttestation,
  generatePlaceholderAttestationUid,
} from '@/lib/eas'; // TODO: migrate to bas.ts when purchase attestation schema is on BAS
import { createJobOnChain } from '@/lib/xlayer';
import { verifyPrivyAuth } from '@/lib/privy-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/skills/[id]/buy
 *
 * Purchase a skill using x402 micropayment.
 *
 * Body: {
 *   privyId: string;
 *   x402Proof: string;  // base64-encoded X402PaymentProof
 *   amount: number;
 *   currency: "USDC";
 *   chain: "xlayer";
 * }
 *
 * Returns: {
 *   success: boolean;
 *   purchaseId: string;
 *   contentUnlocked: boolean;
 *   split: { creator, platform };
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const skillId = id;
    const body = await req.json();
    const { privyId, x402Proof, amount, currency, chain } = body;

    // Validate required fields
    if (!privyId || !x402Proof) {
      return NextResponse.json(
        { error: 'Missing required fields: privyId, x402Proof' },
        { status: 400 }
      );
    }

    // Verify JWT and ensure privyId matches token claims
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (token) {
      const authResult = await verifyPrivyAuth(token);
      if (!authResult.success || authResult.privyId !== privyId) {
        return NextResponse.json(
          { error: 'Unauthorized — privyId mismatch' },
          { status: 403 }
        );
      }
    }

    if (currency !== 'USDC') {
      return NextResponse.json(
        { error: 'Only USDC payments supported' },
        { status: 400 }
      );
    }

    if (chain !== 'xlayer') {
      return NextResponse.json(
        { error: 'Only xlayer chain supported' },
        { status: 400 }
      );
    }

    // Resolve user
    const user = await prisma.user.findUnique({ where: { privyId } });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found — create account first' },
        { status: 404 }
      );
    }

    // Resolve skill
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      include: { creator: true },
    });
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    // Check for duplicate purchase
    const existingPurchase = await prisma.purchase.findFirst({
      where: { userId: user.id, skillId, status: 'completed' },
    });
    if (existingPurchase) {
      return NextResponse.json(
        {
          error: 'Skill already purchased',
          purchaseId: existingPurchase.id,
          contentUnlocked: true,
        },
        { status: 409 }
      );
    }

    // Decode and verify x402 payment proof
    let proof: X402PaymentProof;
    try {
      proof = decodePaymentProof(x402Proof);
    } catch {
      return NextResponse.json(
        { error: 'Invalid x402 proof encoding' },
        { status: 400 }
      );
    }

    // Verify x402 payment proof with EIP-712 signature validation
    const creatorAddress = skill.creator.walletAddress as `0x${string}` | null;
    if (!creatorAddress) {
      return NextResponse.json(
        { error: 'Skill creator has no wallet address configured' },
        { status: 400 }
      );
    }

    const verifyResult = await verifyPaymentProof(proof, creatorAddress);
    if (!verifyResult.valid) {
      return NextResponse.json(
        { error: `Payment verification failed: ${verifyResult.error}` },
        { status: 402 }
      );
    }

    // Verify amount matches skill price
    const expectedAmount = BigInt(Math.floor(skill.price * 1e6));
    if (verifyResult.amount && verifyResult.amount < expectedAmount) {
      return NextResponse.json(
        {
          error: `Insufficient payment: expected ${skill.price} USDC, got ${Number(verifyResult.amount) / 1e6} USDC`,
        },
        { status: 402 }
      );
    }

    // Calculate payment split
    const paymentAmount = verifyResult.amount ?? expectedAmount;
    const split = splitPayment(paymentAmount);

    // Generate EAS attestation data
    let attestationUid: string | undefined;
    const buyerAddress = user.walletAddress as `0x${string}` | null;

    if (buyerAddress && skill.onChainId !== null) {
      const attestation = createPurchaseAttestation(
        buyerAddress,
        creatorAddress,
        BigInt(skill.onChainId),
        paymentAmount
      );
      attestationUid = generatePlaceholderAttestationUid(
        buyerAddress,
        skillId,
        Date.now()
      );
      console.log('[EAS] x402 Purchase attestation prepared:', {
        schemaUid: attestation.schemaUid,
        encodedDataLength: attestation.encodedData.length,
        placeholderUid: attestationUid,
      });
    }

    // Create purchase record
    // Note: txHash is null for x402 off-chain payments.
    // It will be set when on-chain job is confirmed via onchainJobId.
    const purchase = await prisma.purchase.create({
      data: {
        userId: user.id,
        skillId,
        amount: skill.price,
        currency: 'USDC',
        status: 'completed',
        txHash: null, // x402 payments are off-chain; real txHash comes from on-chain job
        ...(attestationUid && { attestationUid }),
      },
    });

    // Increment install counter
    await prisma.skill.update({
      where: { id: skillId },
      data: { installs: { increment: 1 } },
    });

    // Fire-and-forget: Create ERC-8183 job record on X Layer
    // Non-blocking — failures are logged but don't affect the purchase
    if (buyerAddress && skill.onChainId !== null) {
      createJobOnChain({
        skillId: BigInt(skill.onChainId),
        buyerAddr: buyerAddress,
        sellerAddr: creatorAddress,
        amount: paymentAmount,
      })
        .then(async (result) => {
          if (result.success && result.jobId) {
            // Update purchase with on-chain job ID and real txHash
            await prisma.purchase.update({
              where: { id: purchase.id },
              data: {
                onchainJobId: result.jobId,
                ...(result.txHash && { txHash: result.txHash }),
              },
            });
            console.log('[x402] On-chain job created:', {
              purchaseId: purchase.id,
              onchainJobId: result.jobId,
              txHash: result.txHash,
            });
          }
        })
        .catch((err) => {
          console.error('[x402] On-chain job creation failed:', err);
        });
    }

    console.log('[x402] Purchase completed:', {
      purchaseId: purchase.id,
      skillId,
      buyer: user.id,
      amount: skill.price,
      split: {
        creator: Number(split.creator) / 1e6,
        platform: Number(split.platform) / 1e6,
      },
    });

    return NextResponse.json(
      {
        success: true,
        purchaseId: purchase.id,
        contentUnlocked: true,
        split: {
          creator: Number(split.creator) / 1e6,
          platform: Number(split.platform) / 1e6,
        },
        attestation: attestationUid ? { uid: attestationUid, status: 'pending' } : null,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('[POST /api/skills/[id]/buy]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
