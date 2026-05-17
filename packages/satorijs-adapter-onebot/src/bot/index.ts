import { type Context, Schema, type Session, Time } from "@satorijs/core";
import * as OneBot from "../utils";
import { WsClient } from "../ws";
import { BaseBot } from "./base";

export * from "./base";
export * from "./cqcode";
export * from "./message";

export class OneBotBot<T extends OneBotBot.Config = OneBotBot.Config> extends BaseBot<T> {
  static inject = ["http"];

  constructor(ctx: Context, config: T) {
    super(ctx, config, "onebot");

    this.config.advanced ??= {};
    this.config.advanced.splitMixedContent ??= true;
    this.user = {
      id: config.selfId,
      avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${config.selfId}&spec=640`,
    };
    this.platform = "onebot";
    this.internal = new OneBot.Internal();

    ctx.plugin(WsClient, this);
  }

  async initialize() {
    await this.getLogin().then(
      () => this.online(),
      (error) => this.offline(error),
    );
  }

  async getChannel(channelId: string) {
    const data = await this.internal.getGroupInfo(channelId);
    return OneBot.adaptChannel(data);
  }

  async getGuild(guildId: string) {
    const data = await this.internal.getGroupInfo(guildId);
    return OneBot.adaptGuild(data);
  }

  async getGuildList() {
    const data = await this.internal.getGroupList();
    return { data: data.map(OneBot.adaptGuild) };
  }

  async getChannelList(guildId: string) {
    return { data: [await this.getChannel(guildId)] };
  }

  async getGuildMember(guildId: string, userId: string) {
    const data = await this.internal.getGroupMemberInfo(guildId, userId);
    return OneBot.decodeGuildMember(data);
  }

  async getGuildMemberList(guildId: string) {
    const data = await this.internal.getGroupMemberList(guildId);
    return { data: data.map(OneBot.decodeGuildMember) };
  }

  async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
    return this.internal.setGroupKick(guildId, userId, permanent);
  }

  async muteGuildMember(guildId: string, userId: string, duration: number) {
    return this.internal.setGroupBan(guildId, userId, duration / 1000);
  }

  async muteChannel(channelId: string, guildId?: string, enable?: boolean) {
    return this.internal.setGroupWholeBan(channelId, enable);
  }

  async checkPermission(name: string, session: Partial<Session>) {
    if (name === "onebot.group.admin") {
      return session.author?.roles?.[0]?.id === "admin";
    } else if (name === "onebot.group.owner") {
      return session.author?.roles?.[0]?.id === "owner";
    }
    return super.checkPermission(name, session);
  }
}

export namespace OneBotBot {
  export interface BaseConfig extends BaseBot.Config {
    protocol: "ws";
    endpoint: string;
    selfId: string;
    token?: string;
    responseTimeout?: number;
  }

  export const BaseConfig: Schema<BaseConfig> = Schema.object({
    protocol: Schema.const("ws").required(),
    endpoint: Schema.string().role("link").description("OneBot WebSocket 服务地址。").required(),
    selfId: Schema.string().description("机器人的账号。").required(),
    token: Schema.string()
      .role("secret")
      .description("发送信息时用于验证的字段，应与 OneBot 配置文件中的 access_token 保持一致。"),
    responseTimeout: Schema.natural()
      .role("time")
      .default(Time.minute)
      .description("等待响应的时间，单位为毫秒。"),
  });

  export type Config = BaseConfig & WsClient.Options;

  export const Config: Schema<Config> = Schema.intersect([
    BaseConfig,
    WsClient.Options,
    Schema.object({
      advanced: BaseBot.AdvancedConfig,
    }),
  ]);
}
