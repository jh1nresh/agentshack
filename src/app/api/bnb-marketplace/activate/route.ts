import { NextResponse } from "next/server";
import { activationRequestSchema, dispatchTestnetActivation } from "@/lib/bnb-marketplace-activation";

export async function POST(request: Request) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = activationRequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid activation request" }, { status: 400 });

  try {
    return NextResponse.json(await dispatchTestnetActivation(parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
