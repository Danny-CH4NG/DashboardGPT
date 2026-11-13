import type { ComponentSpec } from "./manifest.ts";
import type { Layout } from "./layout.ts";

const builtin = { kind: "builtin" as const, createdAt: "2026-11-13T00:00:00.000Z" };
const hours = ["06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17"].map((h) => `${h}:00`);

export const seedComponents: ComponentSpec[] = [
  {
    id: "station-kpis",
    type: "kpi-chips",
    title: "全站指標",
    description: "全站即時關鍵指標：每小時進站人次、列車準點率、未處理告警數。",
    grid: { colSpan: 12, rowSpan: 1 },
    data: [
      { label: "進站", value: 1284, unit: "/h", status: "info" },
      { label: "準點", value: 98, unit: "%", status: "ok" },
      { label: "告警", value: 2, status: "warn" },
    ],
    source: builtin,
  },
  {
    id: "ops-status",
    type: "kpi",
    title: "營運狀態",
    description: "綜合列車、設備與告警狀態判定的全站營運狀態。",
    grid: { colSpan: 2, rowSpan: 2 },
    data: { value: "正常", label: "營運中 · 05:30 起", status: "ok" },
    source: builtin,
  },
  {
    id: "passenger-flow",
    type: "line",
    title: "即時人流（進／出站）",
    description: "今日每小時進站與出站人次，資料來源：閘門刷卡紀錄。",
    grid: { colSpan: 4, rowSpan: 2 },
    data: {
      x: hours,
      series: [
        { name: "進站", values: [420, 1380, 1720, 1210, 860, 790, 910, 880, 820, 960, 1240, 1284] },
        { name: "出站", values: [310, 1120, 1540, 1180, 820, 760, 870, 850, 800, 900, 1100, 1190] },
      ],
    },
    options: { smooth: true, accent: "cyan" },
    source: builtin,
  },
  {
    id: "platform-crowding",
    type: "bar",
    title: "月台擁擠度",
    description: "各月台目前人數占設計容量的百分比。70% 以上需注意，85% 以上視為擁擠。",
    grid: { colSpan: 2, rowSpan: 2 },
    data: { x: ["1A", "1B", "2A", "2B", "3"], series: [{ name: "擁擠度 %", values: [46, 72, 88, 54, 31] }] },
    options: { thresholds: { warn: 70, alert: 85 }, accent: "cyan" },
    source: builtin,
  },
  {
    id: "on-time-rate",
    type: "gauge",
    title: "列車準點率",
    description: "今日到站列車中誤點 5 分鐘以內的比例。",
    grid: { colSpan: 2, rowSpan: 2 },
    data: { value: 98, min: 0, max: 100, unit: "%", label: "今日" },
    options: { thresholds: { warn: 95, alert: 90 }, accent: "green" },
    source: builtin,
  },
  {
    id: "equipment-status",
    type: "donut",
    title: "設備狀態",
    description: "電扶梯、電梯、閘門、廣播等設備的運作狀態分布。",
    grid: { colSpan: 2, rowSpan: 2 },
    data: [
      { name: "正常", value: 126 },
      { name: "保養中", value: 6 },
      { name: "異常", value: 2 },
    ],
    source: builtin,
  },
  {
    id: "air-quality",
    type: "kpi",
    title: "環境品質",
    description: "大廳空氣品質指標（AQI），每 5 分鐘更新。",
    grid: { colSpan: 2, rowSpan: 2 },
    data: { value: 42, unit: "AQI", label: "良好 · 24°C · 濕度 68%", delta: -3, status: "ok" },
    options: { accent: "green" },
    source: builtin,
  },
  {
    id: "alerts",
    type: "status-list",
    title: "告警",
    description: "尚未結案的設備與營運告警，依嚴重度排序。",
    grid: { colSpan: 4, rowSpan: 2 },
    data: [
      { label: "2A 月台擁擠度 88%", level: "alert", time: "10:38", location: "2A 月台" },
      { label: "後站電扶梯 E3 保養中", level: "warn", time: "09:12", location: "後站" },
      { label: "北上 152 次延誤 5 分", level: "info", time: "10:40" },
    ],
    source: builtin,
  },
  {
    id: "announcements",
    type: "ticker",
    title: "公告",
    description: "站務即時公告，跑馬燈輪播。",
    grid: { colSpan: 2, rowSpan: 1 },
    data: { items: ["北上 152 次延誤 5 分鐘", "後站電扶梯 E3 保養至 14:00", "週六站前廣場活動，請改由後站進出"] },
    source: builtin,
  },
  {
    id: "transfer-info",
    type: "kpi-chips",
    title: "轉乘",
    description: "主要轉乘方式下一班次的等候時間。",
    grid: { colSpan: 2, rowSpan: 1 },
    data: [
      { label: "內灣線", value: 12, unit: "分" },
      { label: "高鐵接駁", value: 6, unit: "分" },
      { label: "公車 182", value: 3, unit: "分" },
    ],
    source: builtin,
  },
  // Templates in the library that are not placed on the page by default.
  {
    id: "gate-throughput",
    type: "bar",
    title: "閘門進出量",
    description: "各出入口閘門過去一小時通過人次。",
    grid: { colSpan: 2, rowSpan: 2 },
    data: {
      x: ["前站 A", "前站 B", "後站 A", "後站 B"],
      series: [
        { name: "進", values: [512, 344, 268, 160] },
        { name: "出", values: [488, 301, 250, 151] },
      ],
    },
    options: { stacked: true },
    source: builtin,
  },
  {
    id: "daily-entries",
    type: "kpi",
    title: "今日累計進站",
    description: "今日 05:30 起累計進站人次。",
    grid: { colSpan: 2, rowSpan: 1 },
    data: { value: 13464, unit: "人次", delta: 820 },
    options: { accent: "cyan" },
    source: builtin,
  },
];

const place = (id: string) => {
  const c = seedComponents.find((s) => s.id === id)!;
  return { slotId: `slot-${id}`, componentId: id, grid: c.grid };
};

export const seedLayout: Layout = {
  zones: {
    top: { columns: 12, slots: [place("station-kpis")] },
    left: { columns: 2, slots: [place("ops-status")] },
    right: {
      columns: 4,
      slots: ["passenger-flow", "platform-crowding", "on-time-rate", "equipment-status", "air-quality", "alerts"].map(place),
    },
    bottomLeft: { columns: 2, slots: [place("announcements"), place("transfer-info")] },
  },
};
