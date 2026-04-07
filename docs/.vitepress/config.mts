import { defineConfig } from "vitepress";

export default defineConfig({
  title: "SINT Protocol",
  description: "Security, permission, and economic enforcement layer for physical AI.",
  lang: "en-US",
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: [
    /^https?:\/\/localhost/,
    /^\.\/\.\.\/\.\.\/AGENTS$/,
    /^\.\/\.\.\/\.\.\/WHITEPAPER$/,
    /^\.\/\.\.\/CONTRIBUTING$/,
  ],
  sitemap: {
    hostname: "https://docs.sint.gg",
  },
  themeConfig: {
    logo: "/sint-logo.svg",
    nav: [
      { text: "Getting Started", link: "/getting-started" },
      { text: "Spec", link: "/SINT_v0.2_SPEC" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "GitHub", link: "https://github.com/sint-ai/sint-protocol" },
    ],
    sidebar: [
      {
        text: "Start Here",
        items: [
          { text: "Overview", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Protocol Spec v0.2", link: "/SINT_v0.2_SPEC" },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Docker Deployment", link: "/guides/docker-deployment" },
          { text: "Persistence Baseline", link: "/guides/persistence-baseline" },
          { text: "WebSocket Approvals", link: "/guides/websocket-approvals" },
          { text: "Gazebo ROS2 Validation", link: "/guides/gazebo-ros2-validation" },
          { text: "Isaac Sim Integration", link: "/guides/isaac-sim-integration" },
          { text: "Secure MCP Deployments", link: "/guides/secure-mcp-deployments" },
          { text: "API Documentation Site", link: "/guides/api-documentation-site" },
          { text: "AutoGen Interop Fixtures", link: "/guides/autogen-interop-fixtures" },
          { text: "NIST Submission Playbook", link: "/guides/nist-submission-playbook" },
          { text: "OpenAI Agents SDK Integration", link: "/guides/openai-agents-sdk-integration" },
          { text: "Claude Desktop Integration", link: "/guides/claude-desktop-integration" },
          { text: "Cursor Integration", link: "/guides/cursor-integration" },
        ],
      },
      {
        text: "Community",
        items: [
          { text: "Discord Launch Runbook", link: "/community/discord-launch-runbook" },
          { text: "Discord Launch Kit", link: "/community/discord-launch-kit" },
          { text: "External Contributor Onboarding", link: "/community/external-contributor-onboarding" },
          { text: "Good First Issues Board", link: "/community/good-first-issues-board" },
          { text: "Collaboration Reply Playbook", link: "/community/open-source-collaboration-replies" },
        ],
      },
      {
        text: "Security Bulletins",
        items: [
          { text: "April 2026 Bulletin", link: "/security-bulletins/2026-04" },
          { text: "Bulletin Template", link: "/security-bulletins/TEMPLATE" },
        ],
      },
      {
        text: "Profiles",
        items: [
          { text: "Warehouse AMR Policy Template", link: "/profiles/warehouse-amr.policy.template" },
          { text: "Industrial Cell Policy Template", link: "/profiles/industrial-cell.policy.template" },
          { text: "Edge Gateway Policy Template", link: "/profiles/edge-gateway.policy.template" },
          { text: "OpenAI Agents Fail-Closed Template", link: "/profiles/openai-agents-fail-closed.policy.template" },
        ],
      },
      {
        text: "Compliance & Reports",
        items: [
          { text: "Tier Crosswalk Pack", link: "/compliance/tier-crosswalk-pack" },
          { text: "Industrial Benchmark Report", link: "/reports/industrial-benchmark-report" },
          { text: "ROS2 Control-Loop Benchmark", link: "/reports/ros2-control-loop-benchmark" },
          { text: "Certification Bundle Summary", link: "/reports/certification-bundle-summary" },
          { text: "NIST Submission Bundle", link: "/reports/nist-submission-bundle" },
        ],
      },
      {
        text: "Tutorials",
        items: [
          { text: "Hello World Agent", link: "/tutorials/hello-world-agent" },
          { text: "MCP Server with SINT", link: "/tutorials/mcp-server-with-sint" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/sint-ai/sint-protocol" },
    ],
    editLink: {
      pattern: "https://github.com/sint-ai/sint-protocol/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    search: {
      provider: "local",
    },
    footer: {
      message: "SINT complements MCP and A2A by enforcing delegated authority and safety for physical actions.",
      copyright: "Copyright 2026 SINT contributors",
    },
  },
});
