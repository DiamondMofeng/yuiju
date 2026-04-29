import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ゆいじゅ",
  description: "LLM 驱动的角色自主生活模拟项目",
  lang: "zh-Hans",
  cleanUrls: true,
  themeConfig: {
    logo: "https://raw.githubusercontent.com/yixiaojiu/yuiju/main/packages/source/picture/repo_avatar.webp",
    nav: [{ text: "GitHub", link: "https://github.com/yixiaojiu/yuiju" }],
    socialLinks: [{ icon: "github", link: "https://github.com/yixiaojiu/yuiju" }],
  },
});
