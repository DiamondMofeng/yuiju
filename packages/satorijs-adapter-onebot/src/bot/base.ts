import { Bot, type Context, type Fragment, Schema, Universal } from "@satorijs/core";
import * as OneBot from "../utils";
import { OneBotMessageEncoder } from "./message";

export class BaseBot<T extends BaseBot.Config = BaseBot.Config> extends Bot<Context, T> {
  static MessageEncoder = OneBotMessageEncoder;

  public internal!: OneBot.Internal;

  sendMessage(
    channelId: string,
    fragment: Fragment,
    guildId?: string,
    options?: Universal.SendOptions,
  ) {
    return super.sendMessage(
      channelId,
      fragment,
      guildId ?? (channelId.startsWith("private:") ? undefined : channelId),
      options,
    );
  }

  async createDirectChannel(userId: string) {
    return { id: "private:" + userId, type: Universal.Channel.Type.DIRECT };
  }

  async getMessage(channelId: string, messageId: string) {
    const data = await this.internal.getMsg(messageId);
    return await OneBot.adaptMessage(this, data);
  }

  async deleteMessage(channelId: string, messageId: string) {
    await this.internal.deleteMsg(messageId);
  }

  async getLogin() {
    const data = await this.internal.getLoginInfo();
    this.user = OneBot.decodeUser(data);
    this.user.avatar = `http://q.qlogo.cn/headimg_dl?dst_uin=${this.user.id}&spec=640`;
    return this.toJSON();
  }

  async getUser(userId: string) {
    const data = await this.internal.getStrangerInfo(userId);
    return OneBot.decodeUser(data);
  }

  async getFriendList() {
    const data = await this.internal.getFriendList();
    return {
      data: data.map((item) => ({
        user: OneBot.decodeUser(item),
        nick: item.remark || item.nickname,
      })),
    };
  }

  async handleFriendRequest(messageId: string, approve: boolean, comment?: string) {
    await this.internal.setFriendAddRequest(messageId, approve, comment);
  }

  async handleGuildRequest(messageId: string, approve: boolean, comment?: string) {
    await this.internal.setGroupAddRequest(messageId, "invite", approve, comment);
  }

  async handleGuildMemberRequest(messageId: string, approve: boolean, comment?: string) {
    await this.internal.setGroupAddRequest(messageId, "add", approve, comment);
  }

  async deleteFriend(userId: string) {
    await this.internal.deleteFriend(userId);
  }

  async getMessageList(channelId: string, before?: string) {
    let list: OneBot.Message[];
    if (before) {
      const msg = await this.internal.getMsg(before);
      if (msg?.message_seq) {
        list = (await this.internal.getGroupMsgHistory(Number(channelId), msg.message_seq))
          .messages;
      } else {
        list = [];
      }
    } else {
      list = (await this.internal.getGroupMsgHistory(Number(channelId))).messages;
    }

    return { data: await Promise.all(list.map((item) => OneBot.adaptMessage(this, item))) };
  }
}

export namespace BaseBot {
  export interface Config {
    advanced?: AdvancedConfig;
  }

  export interface AdvancedConfig {
    splitMixedContent?: boolean;
  }

  export const AdvancedConfig: Schema<AdvancedConfig> = Schema.object({
    splitMixedContent: Schema.boolean().description("是否自动在混合内容间插入空格。").default(true),
  }).description("高级设置");
}
