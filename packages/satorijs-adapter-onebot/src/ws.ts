import {
  Adapter,
  type Context,
  type Dict,
  HTTP,
  Logger,
  Schema,
  Time,
  type Universal,
} from "@satorijs/core";
import type { OneBotBot } from "./bot";
import type { Payload, Response } from "./utils";
import { dispatchSession, TimeoutError } from "./utils";

const logger = new Logger("onebot");

interface SharedConfig<T = "ws"> {
  protocol: T;
  responseTimeout?: number;
}

export class WsClient extends Adapter.WsClient<
  Context,
  OneBotBot<OneBotBot.BaseConfig & WsClient.Options>
> {
  static inject = ["http"];

  accept(socket: Universal.WebSocket): void {
    accept(socket, this.bot);
  }

  prepare() {
    const http = this.ctx.http.extend(this.bot.config);
    if (this.bot.config.token) {
      http.config.headers.Authorization = `Bearer ${this.bot.config.token}`;
    }
    return http.ws(this.bot.config.endpoint);
  }
}

export namespace WsClient {
  export interface Options extends SharedConfig<"ws">, HTTP.Config, Adapter.WsClientConfig {}

  export const Options: Schema<Options> = Schema.intersect([
    Schema.object({
      protocol: Schema.const("ws").required(),
      endpoint: Schema.string().role("link").description("OneBot WebSocket 服务地址。").required(),
      responseTimeout: Schema.natural()
        .role("time")
        .default(Time.minute)
        .description("等待响应的时间，单位为毫秒。"),
    }).description("连接设置"),
    HTTP.createConfig(),
    Adapter.WsClientConfig,
  ]);
}

let counter = 0;

export function accept(socket: Universal.WebSocket, bot: OneBotBot) {
  const listeners = new Map<
    number | string,
    {
      timer: ReturnType<typeof setTimeout>;
      resolve(response: Response): void;
      reject(error: Error): void;
      action: string;
      params: Dict;
    }
  >();

  socket.addEventListener("message", ({ data }) => {
    let parsed: (Response & { post_type?: string }) | Payload;
    try {
      parsed = JSON.parse(data.toString());
    } catch (error) {
      logger.warn("cannot parse message %o", data);
      return;
    }

    if (parsed.post_type) {
      logger.debug("receive %o", parsed);
      dispatchSession(bot, parsed as Payload);
      return;
    }

    const response = parsed as Response;
    if (response.echo === undefined) return;

    const listener = listeners.get(response.echo);
    if (!listener) return;

    clearTimeout(listener.timer);
    listeners.delete(response.echo);

    if (
      response.status === "failed" ||
      (typeof response.retcode === "number" && response.retcode !== 0)
    ) {
      listener.reject(
        new Error(
          `Error with request ${listener.action}, args: ${JSON.stringify(listener.params)}, retcode: ${response.retcode}`,
        ),
      );
    } else {
      listener.resolve(response);
    }
  });

  socket.addEventListener("close", () => {
    delete bot.internal._request;
    for (const listener of listeners.values()) {
      clearTimeout(listener.timer);
      listener.reject(new Error(`OneBot websocket closed before ${listener.action} response`));
    }
    listeners.clear();
  });

  bot.internal._request = (action, params = {}) => {
    const echo = ++counter;
    const payload = { action, params, echo };

    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(echo);
        reject(new TimeoutError(params, action));
      }, bot.config.responseTimeout ?? Time.minute);

      listeners.set(echo, { timer, resolve, reject, action, params });
      socket.send(JSON.stringify(payload));
    });
  };

  bot.initialize().catch((error) => bot.offline(error));
}
