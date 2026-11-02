import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout as FumadocsLayout } from "fumadocs-ui/layouts/docs";
import { BookOpen, ExternalLink } from "lucide-react";

import { source } from "@/lib/source";
import "./docs.css";

export const metadata = {
  title: {
    default: "Trasper documentation",
    template: "%s — Trasper",
  },
  description:
    "Staff guide, administrator reference and operator manual for the Trasper travel quotation system.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      // The application root already owns next-themes. Disable the duplicate
      // provider here and reuse the class-based dark mode it sets up.
      theme={{ enabled: false }}
      search={{ options: { api: "/docs/api/search" } }}
    >
      {/* Fumadocs' prebuilt CSS bypasses the app's Tailwind 3 pipeline. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/fumadocs-ui.css" precedence="default" />
      <FumadocsLayout
        tree={source.getPageTree()}
        tabMode="top"
        tabs={[
          {
            title: "User guide",
            description: "For agency staff, administrators and operators.",
            url: "/docs/user",
          },
          {
            title: "Developer guide",
            description: "Architecture, data, API routes and tests.",
            url: "/docs/developer",
          },
        ]}
        nav={{
          title: (
            <span className="docs-brand">
              <BookOpen aria-hidden className="size-4" />
              Trasper docs
            </span>
          ),
          url: "/docs",
        }}
        links={[
          {
            text: "Open the app",
            url: "/dashboard",
            external: false,
            icon: <ExternalLink aria-hidden className="size-4" />,
          },
        ]}
        sidebar={{ defaultOpenLevel: 2 }}
      >
        {children}
      </FumadocsLayout>
    </RootProvider>
  );
}
