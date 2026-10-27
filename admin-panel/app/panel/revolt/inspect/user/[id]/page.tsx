import { PageTitle } from "@/components/common/navigation/PageTitle";
import { Changelog } from "@/components/core/admin/changelogs/Changelog";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import {
  fetchAccountById,
  fetchBotsWithUsers,
  fetchIpBans,
  fetchUserById,
  fetchUserIPs,
  revoltUserInfo,
} from "@/lib/database/revolt";
import { fetchStrikes } from "@/lib/database/revolt/safety_strikes";
import { col } from "@/lib/db";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  Badge,
  Card,
  Flex,
  Grid,
  Heading,
  Table,
  Text,
} from "@radix-ui/themes";

import { UserCard } from "./UserCard";
import { BotManagement } from "./botManagement";
import {
  ManageAccount,
  ManageAccountEmail,
  ManageAccountMFA,
} from "./accountManagement";
import { IpManagement } from "./ipManagement";
import { UserStrikes } from "./userManagement";
import { AlertManagement } from "./alertManagement";
import { ProfileManagement } from "./profileManagement";

type Props = { params: { id: string } };

const getUser = cache(async (id: string) => ({
  account: await fetchAccountById(id),
  user: await fetchUserById(id),
}));

export async function generateMetadata(
  { params }: Props,
  // parent: ResolvingMetadata
): Promise<Metadata> {
  const { account, user } = await getUser(params.id);
  if (!account && !user)
    return {
      title: "Not Found",
    };

  return {
    title:
      (user ? `${user.username}#${user.discriminator}` : account!.email) +
      " - Inspect User",
  };
}

/**
 * Must never statically generate this page as it contains dynamic content only
 */
export const dynamic = "force-dynamic";

export default async function User({ params }: Props) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const { account, user } = await getUser(params.id);
  if (!account && !user) notFound();

  const relationIds = (user?.relations ?? [])
    .filter((relation) => relation.status === "Friend")
    .map((relation) => relation._id);

  const [strikes, ips, ipBans, bots, friends, memberships, reports] =
    await Promise.all([
      fetchStrikes(params.id),
      fetchUserIPs(params.id),
      fetchIpBans(),
      fetchBotsWithUsers(params.id),
      relationIds.length
        ? col("users").find({ _id: { $in: relationIds as never[] } }).toArray()
        : Promise.resolve([]),
      col("server_members")
        .find({ "_id.user": params.id })
        .limit(100)
        .toArray(),
      col("safety_reports")
        .find({ author_id: params.id })
        .sort({ _id: -1 })
        .limit(20)
        .toArray(),
    ]);

  const memberServerIds = memberships.map(
    (membership) => (membership._id as { server?: string }).server,
  );
  const memberServers = memberServerIds.length
    ? await col("servers")
        .find({ _id: { $in: memberServerIds as never[] } })
        .toArray()
    : [];

  //   const { messages: recentMessages, authors: recentMessageAuthors } =
  //     await fetchMessages({
  //       author: params.id,
  //     });

  return (
    <>
      <PageTitle
        metadata={{
          title:
            (user ? `${user.username}#${user.discriminator}` : account!.email) +
            " - Inspect User",
        }}
      />

      <Grid columns={{ initial: "1", lg: "2", xl: "3" }} gap="2" width="auto">
        {user && (
          <UserCard
            user={revoltUserInfo(user)}
            showProfile
            showActions="short"
          />
        )}
        {account && (
          <Card>
            <Flex direction="column" gap="3">
              <Flex direction="column">
                <Heading size="6">Account Management</Heading>
                <Text color="gray" size="1">
                  Information about this user account and administrative
                  options.
                </Text>
              </Flex>

              <ManageAccount
                id={params.id}
                attempts={account.lockout?.attempts || 0}
                disabled={account.disabled}
                deletion={account.deletion as never}
              />

              <Flex direction="column" gap="2">
                <Heading size="2">Email</Heading>
                <ManageAccountEmail
                  id={params.id}
                  email={account.email}
                  verified={account.verification.status !== "Pending"}
                />
              </Flex>

              <Flex direction="column" gap="2">
                <Heading size="2">Multi-Factor Authentication</Heading>
                <ManageAccountMFA
                  id={params.id}
                  totp={account.mfa?.totp_token?.status === "Enabled"}
                  recovery={account.mfa?.recovery_codes?.length || 0}
                />
              </Flex>

              {false && (
                <Flex direction="column" gap="2">
                  <Heading size="2">Authifier Data</Heading>
                  <pre className="text-wrap">
                    <code></code>
                  </pre>
                </Flex>
              )}
            </Flex>
          </Card>
        )}

        {user && (
          <Card>
            <Flex direction="column" gap="3">
              <Flex direction="column">
                <Heading size="6">Profile Management</Heading>
                <Text color="gray" size="1">
                  Change the username, display name, admin access or sessions
                  for this account.
                </Text>
              </Flex>
              <ProfileManagement
                id={params.id}
                username={user.username}
                discriminator={user.discriminator}
                displayName={user.display_name}
                privileged={user.privileged}
              />
            </Flex>
          </Card>
        )}

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">Strikes</Heading>
              <Text color="gray" size="1">
                Information about past infractions regarding this user.
              </Text>
            </Flex>
            <UserStrikes
              id={params.id}
              flags={user?.flags || 0}
              strikes={strikes}
            />
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">IP Addresses</Heading>
              <Text color="gray" size="1">
                Recorded session addresses. IP bans apply to every NullCord API
                request from the address.
              </Text>
            </Flex>
            <IpManagement ips={ips} bans={ipBans} />
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">Moderation History</Heading>
              <Text color="gray" size="1">
                Cases this user has been involved in.
              </Text>
            </Flex>
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">Alerts</Heading>
              <Text color="gray" size="1">
                Moderation notices sent to the user.
              </Text>
            </Flex>
            <AlertManagement id={params.id} />
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">Bots</Heading>
              <Text color="gray" size="1">
                Bots owned by this user. Verification adds the app checkmark
                in the NullCord client.
              </Text>
            </Flex>
            <BotManagement bots={bots} />
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">Friends</Heading>
              <Text color="gray" size="1">
                Users who are friends with this user.
              </Text>
            </Flex>
            {friends.length ? (
              <Table.Root size="1">
                <Table.Body>
                  {friends.map((friend) => (
                    <Table.Row key={String(friend._id)}>
                      <Table.Cell>
                        <Link href={`/panel/revolt/inspect/user/${friend._id}`}>
                          {String(friend.username)}#{String(friend.discriminator)}
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="1" color="gray">
                          {String(friend._id)}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            ) : (
              <Text color="gray" size="1">
                No friends recorded.
              </Text>
            )}
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">Servers</Heading>
              <Text color="gray" size="1">
                Servers this user is in.
              </Text>
            </Flex>
            {memberServers.length ? (
              <Table.Root size="1">
                <Table.Body>
                  {memberServers.map((server) => (
                    <Table.Row key={String(server._id)}>
                      <Table.Cell>
                        <Link href={`/panel/revolt/inspect/server/${server._id}`}>
                          {String(server.name)}
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="1" color="gray">
                          {String(server._id)}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            ) : (
              <Text color="gray" size="1">
                Not a member of any servers.
              </Text>
            )}
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="6">Reports</Heading>
              <Text color="gray" size="1">
                Reports this user has created.
              </Text>
            </Flex>
            {reports.length ? (
              <Table.Root size="1">
                <Table.Body>
                  {reports.map((report) => (
                    <Table.Row key={String(report._id)}>
                      <Table.Cell>
                        <Badge
                          color={
                            report.status === "Resolved"
                              ? "green"
                              : report.status === "Rejected"
                                ? "gray"
                                : "orange"
                          }
                        >
                          {String(report.status)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="1">
                          {String(report.additional_context || "No context")}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            ) : (
              <Text color="gray" size="1">
                No reports created.
              </Text>
            )}
          </Flex>
        </Card>
      </Grid>

      <Card>
        <Flex direction="column" gap="2">
          <Flex direction="column">
            <Heading size="6">Discuss</Heading>
            <Text color="gray" size="1">
              Recent actions and comments relating to this user.
            </Text>
          </Flex>

          <Changelog object={{ type: "User", id: params.id }} />
        </Flex>
      </Card>
    </>
  );
}
