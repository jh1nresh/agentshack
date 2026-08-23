import { MarketDirectory } from "@/components/market/MarketDirectory";
import { MarketplaceFrame } from "@/components/market/MarketplaceFrame";

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  return (
    <MarketplaceFrame
      layout="directory"
      note={"Choose one job.\nSet the limit.\nKeep control."}
    >
      <MarketDirectory initialCategory={category} />
    </MarketplaceFrame>
  );
}
