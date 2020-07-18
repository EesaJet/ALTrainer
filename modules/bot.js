import { Client, Intents } from "discord.js";
import process, { env } from "process";
import config from "../config.js";
import { db, initGuilds, addGuild, removeMessageWithReplyId, removeGuild } from "./sqlite3.js";
import { messageHandler } from "./messageHandler.js";
import { postServerCount } from "./post.js";
import { updateCountdowns } from "./updateManager.js";

const activities = [
  { name: "https://bit.ly/live-bot", type: "WATCHING" },
  { name: "for !help", type: "WATCHING" },
  { name: "the time fly by", type: "WATCHING" },
  { name: "the clock tick", type: "LISTENING" },
  { name: "with time", type: "PLAYING" },
];
const activity = activities[Math.floor(Math.random() * activities.length)];
const presence =
  env.NODE_ENV === "debug"
    ? { activity: { name: "maintenance", type: "WATCHING" }, status: "dnd" }
    : { activity, status: "online" };

const requiredIntents = new Intents(["DIRECT_MESSAGES", "GUILDS", "GUILD_MESSAGES"]);

const client = new Client({
  messageCacheMaxSize: 10,
  messageCacheLifetime: 30 * 60 * 60,
  messageSweepInterval: 6 * 60 * 60,
  presence: { activity: { name: "v2 upgrade. Report bugs!", type: "WATCHING" }, status: "dnd" },
  ws: { intents: requiredIntents },
});

export const clientId = Math.round(Math.random() * 1e9);

const { token } = config;
const log = console.log;
client.once("ready", () => {
  log(`Initialized client ${clientId} (${client.shard.ids.join()}).`);

  initGuilds(client.guilds.cache, clientId);
  updateCountdowns(client, clientId);

  // Post server counts to bot lists hourly.
  if (env.NODE_ENV === "production") client.setInterval(postServerCount, 60 * 60 * 1000, client);
});

client.on("message", async message => {
  await messageHandler(message);
  if (message.author?.id !== client.user?.id && !message[Symbol.for("messageReply")])
    message.channel.messages.cache.delete(message.id);
});

// client.on("messageUpdate", (_, message) => {
//   if (message.partial || message.author.bot) return;

//   const messageReply = message[Symbol.for("messageReply")];
//   if (messageReply && !messageReply.deleted) messageHandler(message, messageReply);
// });

client.on("messageDelete", message => {
  const { id: messageId, guild, client, author } = message;
  if (author?.id !== client.user?.id || !guild?.available) return;

  // removeMessageWithId(guild.id, messageId);
  removeMessageWithReplyId(message.id);
});

client.on("guildCreate", guild => {
  addGuild(guild.id, clientId);
  if (guild.systemChannel && guild.me?.permissionsIn(guild.systemChannel.id).has("SEND_MESSAGES"))
    guild.systemChannel.send(
      "**Glad to be a part of your server** :heart:\nYou're probably looking for `!help`"
    );
  log(`Added to ${guild.name} (${guild.id})`);
});

client.on("guildDelete", async guild => {
  log(`Removed from ${guild.name}: ${await removeCountdowns(guild.id)}`);
  removeGuild(guild.id);
});

client.on("rateLimit", rateLimitInfo => {
  log(rateLimitInfo);
});

// Start client
client.login(token);
if (env.NODE_ENV === "debug") client.on("debug", console.info);

process.on("unhandledRejection", log);
process.on("SIGTERM", () => process.exit(143));
process.on("SIGINT", () => process.exit(130));
process.on("SIGHUP", () => process.exit(129));
process.on("exit", code => {
  console.log(`Destroying client ${clientId} (${client.shard.ids.join()}). Code ${code}.`);
  client.destroy();
  db.close();
});
