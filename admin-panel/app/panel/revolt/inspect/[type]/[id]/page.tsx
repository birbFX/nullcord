export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { col } from "@/lib/db";
import { Heading, Card, Code, Text } from "@radix-ui/themes";
import { EJSON } from "bson";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Inspect",
  description: "Inspect a message, channel or server.",
};

const COLLECTIONS: Record<string, string> = {
  message: "messages",
  channel: "channels",
  server: "servers",
  report: "safety_reports",
  case: "safety_cases",
};

export default async function InspectObject({
  params,
}: {
  params: { type: string; id: string };
}) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const collection = COLLECTIONS[params.type];
  if (!collection) notFound();

  const doc = await col(collection).findOne({ _id: params.id as never });
  if (!doc) notFound();

  return (
    <>
      <PageTitle metadata={metadata} />
      <Heading size="6" mb="2">
        {params.type} {params.id}
      </Heading>
      <Text as="p" color="gray" size="2" mb="4">
        Raw record from <Code>revolt.{collection}</Code>.
      </Text>
      <Card>
        <pre style={{ margin: 0, overflow: "auto", fontSize: 12 }}>
          {EJSON.stringify(doc, { relaxed: true }, 2)}
        </pre>
      </Card>
    </>
  );
}
