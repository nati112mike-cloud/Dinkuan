import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getT } from "@/lib/session";

export const metadata: Metadata = { title: "Privacy Policy" };

/** PRD 3 data protection (PDPP 1321/2024): what we collect, why, who sees it, and your rights. */
export default async function PrivacyPage() {
  const { t } = await getT();
  return (
    <LegalPage
      t={t}
      title="privacy.title"
      intro="privacy.intro"
      sections={[
        { title: "privacy.collectTitle", items: ["privacy.c1", "privacy.c2", "privacy.c3", "privacy.c4", "privacy.c5"] },
        { title: "privacy.useTitle", items: ["privacy.u1", "privacy.u2", "privacy.u3"] },
        { title: "privacy.shareTitle", items: ["privacy.s1", "privacy.s2", "privacy.s3", "privacy.s4"] },
        { title: "privacy.rightsTitle", items: ["privacy.r1", "privacy.r2", "privacy.r3"] },
        { title: "privacy.storageTitle", items: ["privacy.st1", "privacy.st2", "privacy.contact"] },
      ]}
    />
  );
}
