import { LandingEditor } from "./landing-editor";
import { listLandingBlocks } from "@/lib/server/actions/landing";
import { listProducts } from "@/lib/server/actions/products";
import {
  LANDING_SECTIONS,
  LANDING_WIZARD_SECTIONS,
  type LandingContent,
  type LandingSection,
  type LandingSectionData,
} from "@/types/landing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Landing · Admin",
};

export default async function AdminLandingPage({
  searchParams,
}: {
  searchParams?: Promise<{ step?: string }>;
}) {
  const { step } = (await searchParams) ?? {};
  const stepIndex = LANDING_WIZARD_SECTIONS.indexOf(step as LandingSection);
  const initialStep = step && stepIndex >= 0 ? stepIndex : 0;

  const blocks = await listLandingBlocks();
  const bySection = new Map(blocks.map((b) => [b.section as LandingSection, b]));
  const products = await listProducts();

  const sections: LandingSectionData[] = LANDING_SECTIONS.map((section) => {
    const block = bySection.get(section);
    return {
      section,
      title: block?.title ?? "",
      subtitle: block?.subtitle ?? "",
      content: (block?.content ?? {}) as LandingContent[LandingSection],
      isPublished: block?.isPublished ?? true,
    };
  });

  return <LandingEditor sections={sections} products={products} initialStep={initialStep} />;
}