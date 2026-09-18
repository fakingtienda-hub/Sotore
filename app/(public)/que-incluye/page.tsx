import type { Metadata } from "next";

import { LandingSections } from "@/components/landing/landing-sections";
import { getLandingSiteConfig, getPublishedLanding } from "@/lib/server/actions/landing";

export const dynamic = "force-dynamic";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "Fakingstore";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getLandingSiteConfig();
  return {
    title: `Qué incluye · ${storeName}`,
    description: site.headerTag,
  };
}

export default async function LandingDetailsPage() {
  const sections = await getPublishedLanding();
  return <LandingSections data={sections} mode="details" />;
}