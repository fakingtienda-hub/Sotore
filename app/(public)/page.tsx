import { LandingSections } from "@/components/landing/landing-sections";
import { getPublishedLanding } from "@/lib/server/actions/landing";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const sections = await getPublishedLanding();
  return <LandingSections data={sections} mode="hero" />;
}