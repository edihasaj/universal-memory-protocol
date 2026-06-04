// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://agentmemoryprotocol.io",
  integrations: [
    starlight({
      title: "Agent Memory Protocol",
      description:
        "An open standard for agent memory. What MCP did for tools, AMP does for memory.",
      logo: { src: "./src/assets/amp-mark.svg", replacesTitle: false },
      customCss: ["./src/styles/theme.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/edihasaj/agent-memory-protocol",
        },
      ],
      head: [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
          },
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", link: "/introduction/" },
            { label: "Quickstart", link: "/quickstart/" },
          ],
        },
        {
          label: "The standard",
          items: [
            { label: "Specification", link: "/specification/" },
            { label: "Conformance", link: "/conformance/" },
            { label: "Ecosystem & positioning", link: "/ecosystem/" },
          ],
        },
        {
          label: "Background",
          items: [
            { label: "Rationale & landscape", link: "/rationale/" },
            { label: "Adoption & roadmap", link: "/adoption/" },
          ],
        },
      ],
    }),
  ],
});
