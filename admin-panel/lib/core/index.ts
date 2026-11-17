import { Filter } from "mongodb";
import { Message, User } from "revolt-api";
import { ulid } from "ulid";

import {
  ChangeLogDocument,
  changelog,
  channels,
  messages,
  users,
} from "../db/types";
import { publish, publishPrivate } from "../events";

/**
 * Send a message
 * @param message Message
 */
export async function sendMessage(message: Omit<Message, "_id">) {
  const doc: Message = {
    _id: ulid(),
    ...message,
  };

  await publish(message.channel, {
    type: "Message",
    ...doc,
  });

  await messages().insertOne(doc);
}

/**
 * Create or find existing DM between users
 * @param userA User A
 * @param userB User B
 * @returns DM Channel
 */
export async function createOrFindDM(userA: string, userB: string) {
  let dm = await channels().findOne({
    channel_type: "DirectMessage",
    recipients: { $all: [userA, userB] },
  });

  if (!dm) {
    dm = {
      _id: ulid(),
      channel_type: "DirectMessage",
      active: true,
      recipients: [userA, userB],
    };

    await channels().insertOne(dm);

    for (const user of [userA, userB])
      await publishPrivate(user, {
        type: "ChannelCreate",
        ...dm,
      });
  }

  return dm;
}

/**
 * Id of the dedicated bot account that announcements and alerts come from
 */
export const SYSTEM_BOT_ID = "0000000000SYSTEM0000000000";

/**
 * Make sure the system bot account exists and return its id
 */
export async function ensureSystemBot() {
  const owner = process.env.PLATFORM_ACCOUNT_ID ?? SYSTEM_BOT_ID;
  await users().updateOne(
    { _id: SYSTEM_BOT_ID },
    {
      $setOnInsert: {
        _id: SYSTEM_BOT_ID,
        username: "NullCord System",
        discriminator: "0001",
        bot: { owner },
        last_acknowledged_policy_change: new Date(0),
      },
    } as never,
    { upsert: true },
  );
  // repair a bot document created before this field was required
  await users().updateOne(
    { _id: SYSTEM_BOT_ID, last_acknowledged_policy_change: { $exists: false } },
    { $set: { last_acknowledged_policy_change: new Date(0) } } as never,
  );
  return SYSTEM_BOT_ID;
}

/**
 * Send a platform alert from the system bot
 * @param userId Target user
 * @param content Content to send
 */
export async function sendPlatformAlert(userId: string, content: string) {
  const botId = await ensureSystemBot();
  const dm = await createOrFindDM(userId, botId);

  await sendMessage({
    channel: dm._id,
    author: botId,
    content,
  });
}

/**
 * Create a changelog entry
 * @param userEmail User email
 * @param change Change
 */
export async function createChangelog(
  userEmail: string,
  change: Omit<ChangeLogDocument, "_id" | "userEmail">,
) {
  const document = {
    _id: ulid(),
    userEmail,
    ...change,
  } as ChangeLogDocument;
  await changelog().insertOne(document);
  return document;
}

/**
 * Fetch messages from channel with authors
 */
export async function fetchMessages(query: Filter<Message>): Promise<{
  messages: Message[];
  authors: Record<string, User>;
}> {
  const recentMessages = await messages()
    .find(query, {
      sort: {
        _id: -1,
      },
      limit: 200,
    })
    .toArray();

  const authors = await users()
    .find(
      {
        _id: {
          $in: [...new Set(recentMessages.map((message) => message.author))],
        },
      },
      {
        projection: {
          _id: 1,
          username: 1,
          discriminator: 1,
          avatar: 1,
        },
      },
    )
    .toArray()
    .then((arr) =>
      arr.reduce((d, v) => ({ ...d, [v._id]: v }), {} as Record<string, User>),
    );

  return {
    messages: recentMessages,
    authors,
  };
}
