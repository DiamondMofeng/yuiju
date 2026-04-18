/**
 * 当前支持的天气类型。
 *
 * 说明：
 * - 当前版本补充了多云/小雨/雷雨/雾等更细颗粒度描述，提升世界观展示层次；
 * - 枚举只描述“世界背景天气”，不直接等同于现实气象学分类。
 */
export const WEATHER_TYPES = ["晴", "多云", "阴", "小雨", "雨", "雷雨", "雪", "雾"] as const;

/**
 * 天气类型联合。
 */
export type WeatherType = (typeof WEATHER_TYPES)[number];

/**
 * 当前支持的体感温度等级。
 *
 * 说明：
 * - 该等级用于描述“氛围温度”，而不是精确气温；
 * - 扩展为 6 档后，可以更自然地区分冬季严寒和夏季炎热等极端体感。
 */
export const TEMPERATURE_LEVELS = ["严寒", "寒冷", "清凉", "舒适", "温暖", "炎热"] as const;

/**
 * 体感温度等级联合。
 */
export type TemperatureLevel = (typeof TEMPERATURE_LEVELS)[number];

/**
 * 当前天气快照。
 *
 * 说明：
 * - periodStartAt / periodEndAt 用于标识该快照对应的 6 小时时间片；
 * - updatedAt 表示最近一次写入当前快照的时间，方便跨服务消费时判断新鲜度。
 */
export interface WeatherSnapshot {
  type: WeatherType;
  temperatureLevel: TemperatureLevel;
  periodStartAt: string;
  periodEndAt: string;
  updatedAt: string;
}
