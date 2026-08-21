import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateSkill, getEvaluationSummary } from "@/lib/evaluator";

export const dynamic = "force-dynamic";

/**
 * POST /api/skills/[id]/evaluate
 * Run the micro evaluator on a skill and store the result.
 *
 * Returns the evaluation result with score, pass/fail status, and any issues.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const skill = await prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Run evaluation
    const result = evaluateSkill({
      description: skill.description,
      tags: skill.tags,
      price: skill.price,
      category: skill.category,
      name: skill.name,
      longDescription: skill.longDescription,
    });

    // Store evaluation result
    const updatedSkill = await prisma.skill.update({
      where: { id },
      data: {
        evaluationScore: result.score,
        evaluationPassed: result.passed,
      },
    });

    return NextResponse.json({
      skillId: id,
      evaluation: {
        passed: result.passed,
        score: result.score,
        issues: result.issues,
        summary: getEvaluationSummary(result),
      },
      skill: {
        id: updatedSkill.id,
        name: updatedSkill.name,
        evaluationScore: updatedSkill.evaluationScore,
        evaluationPassed: updatedSkill.evaluationPassed,
      },
    });
  } catch (err: unknown) {
    console.error("[POST /api/skills/[id]/evaluate]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/skills/[id]/evaluate
 * Get the current evaluation status of a skill without re-running.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const skill = await prisma.skill.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        evaluationScore: true,
        evaluationPassed: true,
      },
    });

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if (skill.evaluationScore === null) {
      return NextResponse.json({
        skillId: id,
        evaluated: false,
        message: "Skill has not been evaluated yet. POST to run evaluation.",
      });
    }

    return NextResponse.json({
      skillId: id,
      evaluated: true,
      evaluation: {
        passed: skill.evaluationPassed,
        score: skill.evaluationScore,
      },
      skill: {
        id: skill.id,
        name: skill.name,
      },
    });
  } catch (err: unknown) {
    console.error("[GET /api/skills/[id]/evaluate]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
