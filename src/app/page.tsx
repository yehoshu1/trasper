import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { GeistMono } from "geist/font/mono";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  Fingerprint,
  GitBranch,
  History,
  Layers3,
  LockKeyhole,
  MapPin,
  Plane,
  PlaneTakeoff,
  Plus,
  ReceiptText,
  Route,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Trasper — The travel agency workspace",
  description:
    "Trasper turns a pasted PNR or a hand-built quote into branded quotations, itineraries and pro forma invoices, keeping every option, revision and payment on one timeline.",
};

const GITHUB_URL = "https://github.com/yehoshu1/trasper";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#workflow", label: "Workflow" },
  { href: "#documents", label: "Documents" },
  { href: "#security", label: "Operations" },
];

const FEATURES = [
  {
    icon: ScanLine,
    title: "PNR in when you have one. Clean data out.",
    body: "Paste Amadeus, Sabre or Galileo-style output, or a plain itinerary. The deterministic parser reads what it can and marks the rest for review — it never invents a flight, and an optional AI fallback covers the long tail. Quoting before the booking? Enter the flights by hand and leave the PNR blank.",
  },
  {
    icon: Layers3,
    title: "Options without the retyping.",
    body: "Build several options on one quotation, each with its own flights, travellers and reference. When the client changes their mind, accept another option instead of rebuilding the trip.",
  },
  {
    icon: FileText,
    title: "Documents that look like you.",
    body: "Quotation, itinerary and pro forma from one record, with your logo, letterhead, footer and time zone. Five print layouts, one source of truth, PDFs generated on your server.",
  },
  {
    icon: LockKeyhole,
    title: "Issued means frozen.",
    body: "Sending locks the snapshot. Company details, flights and references cannot move under a client afterwards. Changes go through a revision that supersedes the last one.",
  },
  {
    icon: ReceiptText,
    title: "A ledger that reconciles itself.",
    body: "Record receipts and reversals — never edit or delete. Part-paid, paid and outstanding states come from the ledger, so the pro forma status is always derived, never typed.",
  },
  {
    icon: History,
    title: "The whole conversation, attached.",
    body: "Calls, emails, notes, WhatsApp messages, meetings and follow-ups sit on the customer and quotation timeline. Whoever picks up the desk next has the full story.",
  },
];

const VALUE_POINTS = [
  {
    number: "01",
    title: "Capture once",
    body: "Customer, travellers, flights and booking reference live together. Nothing is re-keyed between documents, and the booking reference stays optional.",
  },
  {
    number: "02",
    title: "Hand off cleanly",
    body: "The accepted option flows into the itinerary and pro forma with the same travellers and references.",
  },
  {
    number: "03",
    title: "Close the loop",
    body: "Follow-ups, revisions and receipts stay attached to the trip, not scattered across inboxes.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Capture",
    body: "Paste a PNR or free-form itinerary when a booking exists, or add the flights and travellers yourself when you are quoting first. Review every segment, name and deadline before it reaches the customer.",
  },
  {
    number: "02",
    title: "Shape",
    body: "Add flights, hotels, transfers and travellers. Build the options the client asked for, all against the same trip.",
  },
  {
    number: "03",
    title: "Issue",
    body: "Send a branded quotation. Accept an option, then issue the itinerary and pro forma from that frozen snapshot.",
  },
  {
    number: "04",
    title: "Reconcile",
    body: "Record payments and reversals. The ledger updates the pro forma and the dashboard, while the audit trail keeps the history.",
  },
];

const DOCUMENT_POINTS = [
  "Logo, letterhead, footer and company details",
  "Five layouts: Classic, Modern, Minimal, Executive and Vivid",
  "Dates in your agency's time zone; flight times local to each airport",
  "Standalone itineraries use the same branded layout",
];

const SECURITY_ITEMS = [
  {
    icon: Fingerprint,
    title: "Staff-only by design",
    body: "No customer accounts or public mailbox. Sign-in, two-factor authentication, recovery and invites are for your team.",
  },
  {
    icon: ShieldCheck,
    title: "Permissions checked on the server",
    body: "Roles are capability sets enforced on every action and query. Sensitive commercial data never reaches a viewer.",
  },
  {
    icon: ScrollText,
    title: "A record of every write",
    body: "The audit log captures changes, and each customer and quotation carries its own history.",
  },
  {
    icon: Database,
    title: "Your data, your server",
    body: "Self-hosted SQLite with WAL mode, persistent uploads and a backup script. Documents and data stay on your infrastructure.",
  },
  {
    icon: LockKeyhole,
    title: "Documents that cannot drift",
    body: "Issued documents are snapshots; numbers come from a sequence inside the transaction and are never reused.",
  },
  {
    icon: WalletCards,
    title: "Quiet operations",
    body: "Health endpoint, guarded cron route, CSV exports, aged debtors and scheduled backups keep the back office running.",
  },
];

const ROLES = [
  { icon: Users, name: "Agents", detail: "Build, send and revise" },
  { icon: ReceiptText, name: "Accountants", detail: "Reconcile and report" },
  { icon: ShieldCheck, name: "Admins", detail: "See the whole desk" },
  { icon: FileCheck2, name: "Viewers", detail: "Read-only document access" },
];

const FAQS = [
  {
    question: "Do we need to change our booking system?",
    answer:
      "No. Trasper reads PNR text you paste in from Amadeus, Sabre, Galileo-style systems or a plain itinerary. If you are quoting before a booking exists, add the flights by hand and leave the PNR blank. It does not log in to your GDS or replace it.",
  },
  {
    question: "Is the app tied to a particular agency?",
    answer:
      "No. Company name, address, logo, letterhead, footer and time zone are settings. Nothing about an agency is hard-coded into the product or its documents.",
  },
  {
    question: "Can we issue an itinerary without a quotation?",
    answer:
      "Yes. Standalone itineraries have their own contact, travellers and frozen flight snapshot. They carry no quotation link, option or pro forma.",
  },
  {
    question: "Where does our data live?",
    answer:
      "On your server. Trasper is self-hosted with SQLite, a persistent uploads directory and backups you control. There is no third-party CRM holding the record.",
  },
  {
    question: "How do roles and permissions work?",
    answer:
      "Admin, agent, accountant and viewer roles ship by default. Custom roles are assembled from capabilities, and every check is enforced on the server rather than by hiding a button.",
  },
  {
    question: "What can we send to a customer?",
    answer:
      "Branded quotations, itineraries and pro forma invoices — previewed on screen and downloaded as PDFs generated from the same frozen record.",
  },
];

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className={`${GeistMono.variable} ${styles.page}`}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>

      <header className={styles.nav}>
        <div className={`${styles.container} ${styles.navInner}`}>
          <Link href="/" className={styles.brand} aria-label="Trasper home">
            <span className={styles.brandMark}>
              <Plane aria-hidden />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>Trasper</span>
              <span className={styles.brandSub}>Travel operations</span>
            </span>
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </a>
            ))}
            <Link href="/docs" className={styles.navLink}>
              Docs
            </Link>
          </nav>

          <div className={styles.navActions}>
            <a
              href={GITHUB_URL}
              className={styles.navGithub}
              target="_blank"
              rel="noreferrer"
              aria-label="View Trasper on GitHub"
              title="Trasper on GitHub"
            >
              <GitBranch aria-hidden />
            </a>
            <div className={styles.navTheme}>
              <ThemeToggle />
            </div>
            <Link href="/login" className={styles.navCta}>
              Staff sign in
              <ArrowUpRight aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowLine} aria-hidden />
                The travel agency workspace
              </p>
              <h1 id="hero-title" className={styles.heroTitle}>
                From a pasted <span className={styles.highlight}>PNR</span> — or a blank page —
                to documents your client keeps.
              </h1>
              <p className={styles.heroLead}>
                Trasper gives agency teams one calm place to build branded quotations, itineraries
                and pro forma invoices — whether the booking already exists or you are quoting
                first — and to keep every option, revision and payment attached to the trip.
              </p>

              <div className={styles.heroActions}>
                <Link href="/login" className={styles.buttonPrimary}>
                  Staff sign in
                  <ArrowRight aria-hidden />
                </Link>
                <a href="#workflow" className={styles.buttonSecondary}>
                  See how it works
                  <ChevronDown aria-hidden />
                </a>
              </div>

              <div className={styles.heroTrust}>
                <span className={styles.trustItem}>
                  <Check aria-hidden /> Built for agency teams
                </span>
                <span className={styles.trustItem}>
                  <Check aria-hidden /> Self-hosted
                </span>
                <span className={styles.trustItem}>
                  <Check aria-hidden /> Your branding on every page
                </span>
              </div>
            </div>

            <div className={styles.heroStage}>
              <div className={styles.stageBackdrop} aria-hidden />
              <figure className={styles.appFrame}>
                <div className={styles.appBar} aria-hidden>
                  <span className={styles.appDot} />
                  <span className={styles.appDot} />
                  <span className={styles.appDot} />
                  <span className={styles.appBarTitle}>Customer document · QT-01-0001</span>
                  <span className={styles.appBarTag}>Demo preview</span>
                </div>
                <Image
                  src="/screenshots/quotation-preview.jpg"
                  alt="A branded quotation preview in Trasper, showing flight segments, passengers and customer details"
                  width={1120}
                  height={820}
                  sizes="(min-width: 1024px) 46vw, 100vw"
                  priority
                  className={styles.appShot}
                />
              </figure>

              <div className={`${styles.floatCard} ${styles.floatCardTop}`}>
                <span className={styles.floatIcon}>
                  <ScanLine aria-hidden />
                </span>
                <span>
                  <span className={styles.floatTitle}>PNR parsed</span>
                  <span className={styles.floatMeta}>
                    6 segments · 3 travellers
                    <br />2 options ready
                  </span>
                </span>
              </div>

              <div className={`${styles.floatCard} ${styles.floatCardBottom}`}>
                <span className={styles.floatIcon}>
                  <Check aria-hidden />
                </span>
                <span>
                  <span className={styles.floatTitle}>
                    <span className={styles.liveDot} />
                    Option B accepted
                  </span>
                  <span className={styles.floatMeta}>
                    Itinerary and pro forma
                    <br />issued from one record
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className={`${styles.container} ${styles.signalBar}`}>
            <p className={styles.signalLabel}>Works with the output you already have</p>
            <div className={styles.signalItems}>
              <span>Amadeus</span>
              <span className={styles.signalDot} aria-hidden />
              <span>Sabre</span>
              <span className={styles.signalDot} aria-hidden />
              <span>Galileo-style</span>
              <span className={styles.signalDot} aria-hidden />
              <span>Free-form itineraries</span>
            </div>
            <p className={styles.signalNote}>Deterministic first · AI optional</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="why-title">
          <div className={styles.container}>
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowLine} aria-hidden />
                Why one workspace
              </p>
              <h2 id="why-title" className={styles.sectionTitle}>
                A trip is too much detail to keep in five places.
              </h2>
              <p className={styles.lead}>
                A booking in one window. A quote in a document. A payment in a ledger. A follow-up
                in someone&rsquo;s head. Trasper keeps the whole journey on one record, so the next
                person to pick it up has the full story.
              </p>
            </div>

            <div className={styles.valueGrid}>
              <div className={styles.valueList}>
                {VALUE_POINTS.map((point) => (
                  <div key={point.number} className={styles.valueItem}>
                    <span className={styles.valueNum}>{point.number}</span>
                    <div>
                      <h3 className={styles.valueTitle}>{point.title}</h3>
                      <p className={styles.valueBody}>{point.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={styles.recordCard}
                role="group"
                aria-label="Example trip record"
              >
                <div className={styles.recordTop}>
                  <div>
                    <p className={styles.recordRef}>Quotation · QT-01-0001</p>
                    <p className={styles.recordName}>The Morgan party</p>
                  </div>
                  <span className={styles.recordStatus}>Accepted</span>
                </div>

                <div className={styles.recordRoute} aria-label="Route: Blantyre to Johannesburg via Addis Ababa">
                  <span className={styles.routeNode}>BLZ</span>
                  <span className={styles.routeTrack}>
                    <span className={styles.routePlane}>
                      <Plane aria-hidden />
                    </span>
                  </span>
                  <span className={styles.routeNode}>ADD</span>
                  <span className={styles.routeTrack}>
                    <span className={styles.routePlane}>
                      <Plane aria-hidden />
                    </span>
                  </span>
                  <span className={styles.routeNode}>JNB</span>
                </div>
                <div className={styles.recordMeta}>
                  <span>3 travellers</span>
                  <span>2 options</span>
                  <span>Itinerary + pro forma issued</span>
                </div>

                <div className={styles.recordTimeline}>
                  <div className={styles.recordEvent}>
                    <span className={styles.recordEventIcon}>
                      <ScanLine aria-hidden />
                    </span>
                    <div>
                      <p className={styles.recordEventTitle}>PNR captured</p>
                      <p className={styles.recordEventMeta}>
                        6 segments, 3 travellers and both options from one paste
                      </p>
                    </div>
                  </div>
                  <div className={styles.recordEvent}>
                    <span className={styles.recordEventIcon}>
                      <Check aria-hidden />
                    </span>
                    <div>
                      <p className={styles.recordEventTitle}>Option B accepted</p>
                      <p className={styles.recordEventMeta}>
                        Itinerary and pro forma frozen from the accepted option
                      </p>
                    </div>
                  </div>
                  <div className={styles.recordEvent}>
                    <span className={styles.recordEventIcon}>
                      <ReceiptText aria-hidden />
                    </span>
                    <div>
                      <p className={styles.recordEventTitle}>Part payment received</p>
                      <p className={styles.recordEventMeta}>
                        Balance and pro forma status updated from the ledger
                      </p>
                    </div>
                  </div>
                  <div className={styles.recordEvent}>
                    <span className={styles.recordEventIcon}>
                      <Clock3 aria-hidden />
                    </span>
                    <div>
                      <p className={styles.recordEventTitle}>Follow-up booked</p>
                      <p className={styles.recordEventMeta}>
                        Call with the Morgan party, Tuesday at 10:00
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.recordFooter}>
                  <span>One record · every handoff</span>
                  <ArrowRight aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className={styles.sectionAlt} aria-labelledby="features-title">
          <div className={styles.container}>
            <div className={styles.sectionHeadRow}>
              <div className={styles.sectionIntro}>
                <p className={styles.eyebrow}>
                  <span className={styles.eyebrowLine} aria-hidden />
                  The feature set
                </p>
                <h2 id="features-title" className={styles.sectionTitle}>
                  Everything after the enquiry.
                </h2>
                <p className={styles.lead}>
                  Trasper covers the parts of the trip that follow the first request — whether the
                  booking is already held or still to come — without another spreadsheet or a folder
                  of final-final documents.
                </p>
              </div>
              <p className={styles.sectionAside}>
                One customer record carries the enquiry, the options, the issued documents and the
                payment history.
              </p>
            </div>

            <div className={styles.featureGrid}>
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className={styles.featureCard}>
                    <div className={styles.featureTop}>
                      <span className={styles.featureIcon}>
                        <Icon aria-hidden />
                      </span>
                      <span className={styles.featureIndex}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className={styles.featureTitle}>{feature.title}</h3>
                    <p className={styles.featureBody}>{feature.body}</p>
                  </article>
                );
              })}
            </div>

            <div className={styles.featureWideGrid}>
              <article className={styles.featureWide}>
                <span className={styles.featureIcon}>
                  <Route aria-hidden />
                </span>
                <div>
                  <h3 className={styles.featureTitle}>Standalone itineraries</h3>
                  <p className={styles.featureBody}>
                    Some trips do not need a quotation. Issue a standalone itinerary with its own
                    contact, travellers and frozen flight snapshot — no quotation, option or pro
                    forma required.
                  </p>
                </div>
              </article>
              <article className={styles.featureWide}>
                <span className={styles.featureIcon}>
                  <ShieldCheck aria-hidden />
                </span>
                <div>
                  <h3 className={styles.featureTitle}>Access that fits the desk</h3>
                  <p className={styles.featureBody}>
                    Admin, agent, accountant and viewer roles are built in; custom roles combine
                    capabilities. Checks run on the server, so a hidden button is never the only
                    control.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="workflow" className={styles.section} aria-labelledby="workflow-title">
          <div className={`${styles.container} ${styles.workflowGrid}`}>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowLine} aria-hidden />
                How it works
              </p>
              <h2 id="workflow-title" className={styles.sectionTitle}>
                One record. Four handoffs. No re-entry.
              </h2>
              <p className={styles.lead}>
                The same trip moves from enquiry to payment without being copied into another
                tool, another document or another spreadsheet.
              </p>

              <ol className={styles.steps}>
                {STEPS.map((step) => (
                  <li key={step.number} className={styles.step}>
                    <span className={styles.stepNum}>{step.number}</span>
                    <div>
                      <h3 className={styles.stepTitle}>{step.title}</h3>
                      <p className={styles.stepBody}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className={styles.workflowVisual}>
              <figure className={styles.shotFrame}>
                <div className={styles.appBar} aria-hidden>
                  <span className={styles.appDot} />
                  <span className={styles.appDot} />
                  <span className={styles.appDot} />
                  <span className={styles.appBarTitle}>Tools · PNR converter</span>
                  <span className={styles.appBarTag}>Deterministic</span>
                </div>
                <Image
                  src="/screenshots/pnr-converter.jpg"
                  alt="The Trasper PNR converter showing pasted itinerary text and the converted PNR result"
                  width={1120}
                  height={820}
                  sizes="(min-width: 960px) 48vw, 100vw"
                  className={styles.appShot}
                />
              </figure>
              <p className={styles.shotCaption}>
                <Sparkles aria-hidden />
                The converter only reformats the text. It never guesses a missing flight — anything
                unreadable is left for a person to complete.
              </p>
            </div>
          </div>
        </section>

        <section id="documents" className={styles.sectionWarm} aria-labelledby="documents-title">
          <div className={`${styles.container} ${styles.docGrid}`}>
            <div className={styles.paperWrap}>
              <div className={styles.paperBackdrop} aria-hidden />
              <article className={styles.paper} aria-label="Example branded itinerary">
                <div className={styles.paperHeader}>
                  <div>
                    <p className={styles.paperAgency}>Your agency</p>
                    <p className={styles.paperAddress}>
                      1 Any Street, Your City
                      <br />
                      hello@youragency.example · youragency.example
                    </p>
                  </div>
                  <span className={styles.paperMark}>
                    <PlaneTakeoff aria-hidden />
                  </span>
                </div>

                <div className={styles.paperKind}>
                  <div>
                    <p className={styles.paperKindTitle}>Itinerary</p>
                    <p className={styles.paperNumber}>IT-2026-0001</p>
                  </div>
                  <p className={styles.paperDate}>Issued 02 Nov 2026</p>
                </div>

                <div className={styles.paperMeta}>
                  <div>
                    <p className={styles.paperMetaLabel}>Prepared for</p>
                    <p className={styles.paperMetaValue}>The Morgan party</p>
                  </div>
                  <div>
                    <p className={styles.paperMetaLabel}>Travellers</p>
                    <p className={styles.paperMetaValue}>3 travellers</p>
                  </div>
                  <div>
                    <p className={styles.paperMetaLabel}>Reference</p>
                    <p className={styles.paperMetaValue}>SMK-01</p>
                  </div>
                </div>

                <div className={styles.paperFlights}>
                  <div className={styles.paperTableHead}>
                    <span>Airline</span>
                    <span>Flight</span>
                    <span>Route</span>
                    <span>Departs</span>
                    <span>Arrives</span>
                  </div>
                  <div className={styles.paperFlightRow}>
                    <span>
                      <strong>Ethiopian</strong>
                    </span>
                    <span className={styles.paperFlightMuted}>ET 875</span>
                    <span>BLZ → ADD</span>
                    <span>06:20</span>
                    <span>12:35</span>
                  </div>
                  <div className={styles.paperFlightRow}>
                    <span>
                      <strong>Ethiopian</strong>
                    </span>
                    <span className={styles.paperFlightMuted}>ET 920</span>
                    <span>ADD → JNB</span>
                    <span>16:05</span>
                    <span>20:30</span>
                  </div>
                </div>

                <div className={styles.paperPassengers}>
                  <span>Mr Alex Morgan (adult)</span>
                  <span>·</span>
                  <span>Ms Sam Morgan (adult)</span>
                  <span>·</span>
                  <span>Miss Robin Morgan (child)</span>
                </div>

                <div className={styles.paperFooter}>
                  <span>Times shown are local to each airport.</span>
                  <span>Page 1 of 1</span>
                </div>
              </article>

              <div className={styles.templates} aria-label="Document layouts">
                <span className={`${styles.templateChip} ${styles.templateChipActive}`}>Classic</span>
                <span className={styles.templateChip}>Modern</span>
                <span className={styles.templateChip}>Minimal</span>
                <span className={styles.templateChip}>Executive</span>
                <span className={styles.templateChip}>Vivid</span>
              </div>
            </div>

            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowLine} aria-hidden />
                Your brand, not ours
              </p>
              <h2 id="documents-title" className={styles.sectionTitle}>
                Every page carries your agency. None of them carry ours.
              </h2>
              <p className={styles.lead}>
                Company name, address, contact details, footer, logo and time zone are settings — not
                source code. Choose a letterhead or a typed header, pick a layout, and every document
                comes out ready to send.
              </p>

              <ul className={styles.checkList}>
                {DOCUMENT_POINTS.map((point) => (
                  <li key={point} className={styles.checkItem}>
                    <span className={styles.checkIcon}>
                      <Check aria-hidden />
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              <p className={styles.smallNote}>
                <MapPin aria-hidden />
                Issued documents render from a frozen snapshot, so a later setting change never
                rewrites history.
              </p>
            </div>
          </div>
        </section>

        <section id="security" className={styles.sectionDark} aria-labelledby="security-title">
          <div className={styles.container}>
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowLine} aria-hidden />
                Operations
              </p>
              <h2 id="security-title" className={styles.sectionTitle}>
                Quietly dependable where it matters.
              </h2>
              <p className={styles.lead}>
                The back office has enough moving parts. Trasper keeps the foundations boring.
              </p>
            </div>

            <div className={styles.securityGrid}>
              {SECURITY_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className={styles.securityItem}>
                    <span className={styles.securityIcon}>
                      <Icon aria-hidden />
                    </span>
                    <h3 className={styles.securityTitle}>{item.title}</h3>
                    <p className={styles.securityBody}>{item.body}</p>
                  </article>
                );
              })}
            </div>

            <div className={styles.roleStrip} role="list" aria-label="Roles">
              {ROLES.map((role) => {
                const Icon = role.icon;
                return (
                  <div key={role.name} className={styles.roleItem} role="listitem">
                    <p className={styles.roleName}>
                      <Icon aria-hidden />
                      {role.name}
                    </p>
                    <p className={styles.roleDetail}>{role.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="faq-title">
          <div className={`${styles.container} ${styles.faqGrid}`}>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowLine} aria-hidden />
                The practical bits
              </p>
              <h2 id="faq-title" className={styles.sectionTitle}>
                Questions worth asking.
              </h2>
              <p className={styles.lead}>
                A few things agency teams usually want to know before they move their desk into a
                new workspace.
              </p>
              <Link href="/docs" className={styles.faqDocsLink}>
                <BookOpen aria-hidden />
                Read the staff guide
              </Link>
            </div>

            <div className={styles.faqList}>
              {FAQS.map((faq) => (
                <details key={faq.question} className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    {faq.question}
                    <Plus aria-hidden className={styles.faqIcon} />
                  </summary>
                  <p className={styles.faqBody}>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.ctaSection} aria-labelledby="cta-title">
          <div className={styles.container}>
            <div className={styles.ctaPanel}>
              <p className={styles.ctaEyebrow}>Ready when you are</p>
              <h2 id="cta-title" className={styles.ctaTitle}>
                Your next quotation could be ready before the call ends.
              </h2>
              <p className={styles.ctaBody}>
                Sign in to your agency&rsquo;s workspace, or read the staff guide first. Your data,
                your branding and your document history stay on your infrastructure.
              </p>
              <div className={styles.ctaActions}>
                <Link href="/login" className={styles.buttonLight}>
                  Staff sign in
                  <ArrowRight aria-hidden />
                </Link>
                <Link href="/docs" className={styles.buttonGhost}>
                  Explore the documentation
                  <BookOpen aria-hidden />
                </Link>
              </div>
              <div className={styles.ctaRoute} aria-hidden>
                <span>BLZ</span>
                <span className={styles.ctaRouteTrack}>
                  <Plane aria-hidden />
                </span>
                <span>ADD</span>
                <span className={styles.ctaRouteTrack}>
                  <Plane aria-hidden />
                </span>
                <span>JNB</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <Link href="/" className={styles.brand} aria-label="Trasper home">
                <span className={styles.brandMark}>
                  <Plane aria-hidden />
                </span>
                <span className={styles.brandText}>
                  <span className={styles.brandName}>Trasper</span>
                  <span className={styles.brandSub}>Travel operations</span>
                </span>
              </Link>
              <p className={styles.footerTagline}>
                Quotations, itineraries and pro forma invoices for travel agency teams — from the
                first enquiry to the final payment.
              </p>
            </div>

            <div>
              <p className={styles.footerHeading}>Product</p>
              <nav className={styles.footerLinks} aria-label="Product">
                {NAV_LINKS.map((link) => (
                  <a key={link.href} href={link.href} className={styles.footerLink}>
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>

            <div>
              <p className={styles.footerHeading}>Access</p>
              <nav className={styles.footerLinks} aria-label="Access">
                <Link href="/login" className={styles.footerLink}>
                  Staff sign in
                </Link>
                <Link href="/docs" className={styles.footerLink}>
                  Documentation
                </Link>
                <a
                  href={GITHUB_URL}
                  className={styles.footerLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                <a href="#security" className={styles.footerLink}>
                  Security and operations
                </a>
              </nav>
            </div>
          </div>

          <div className={styles.footerBottom}>
            <span>
              © {year} Trasper · Staff-only travel operations · English (UK)
            </span>
            <span>
              <PlaneTakeoff aria-hidden />
              Built for travel agencies anywhere
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
