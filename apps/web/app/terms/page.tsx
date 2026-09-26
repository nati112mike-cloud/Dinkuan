import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getT } from "@/lib/session";

export const metadata: Metadata = { title: "Terms of Use" };

/** Terms of use in Amharic and English, accepted at sign-up. */
export default async function TermsPage() {
  const { t } = await getT();
  return (
    <LegalPage
      t={t}
      title="terms.title"
      intro="terms.intro"
      sections={[{ items: ["terms.t1", "terms.t2", "terms.t3", "terms.t4", "terms.t5", "terms.t6", "terms.t7", "terms.t8", "terms.t9"] }]}
    />
  );
}
