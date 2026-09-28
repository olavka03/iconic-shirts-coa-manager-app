import type { ReactNode } from "react";
import { GRID_COLUMNS } from "~/features/certificates/components/list/certificates-grid.component";
import {
  TOOLBAR_COLUMNS,
  TOOLBAR_CONTROL_COLUMNS,
} from "~/features/certificates/components/list/list-toolbar.component";
import { DEFAULT_PER_PAGE } from "~/features/certificates/utils/list-params.utils";
import type { PageSkeletonKind } from "~/features/certificates/utils/page-skeleton.utils";
import styles from "./page-skeleton.module.css";

type Size = `${number}px` | `${number}%`;

const TABLE_COLUMNS = "auto auto 2fr 2fr 3fr 1fr 1fr 1fr";
const CELL_WIDTHS: readonly Size[][] = [
  ["70%", "80%", "90%", "60%", "50%", "70%"],
  ["85%", "60%", "75%", "70%", "40%", "55%"],
  ["60%", "90%", "65%", "50%", "60%", "80%"],
];
const ROWS = Array.from(
  { length: DEFAULT_PER_PAGE },
  (_unused, index) => index,
);
const CARDS = ROWS.slice(0, 12);
const FORM_SECTIONS = [
  { name: "order", fields: 1 },
  { name: "certificate", fields: 3 },
  { name: "signed-by", fields: 2 },
  { name: "notes", fields: 1 },
];

function Block({
  inlineSize = "100%",
  blockSize = "12px",
}: {
  inlineSize?: Size;
  blockSize?: Size;
}) {
  return (
    <s-box
      background="strong"
      borderRadius="base"
      inlineSize={inlineSize}
      blockSize={blockSize}
    />
  );
}

// One visually hidden label says what is loading; the blocks are hidden from assistive technology.
function Busy({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-busy="true">
      <s-text accessibilityVisibility="exclusive">{label}</s-text>
      <div className={styles.pulse} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function ToolbarBlocks() {
  return (
    <s-box padding="small">
      <s-query-container>
        <s-grid
          gridTemplateColumns={TOOLBAR_COLUMNS}
          gap="small-200"
          alignItems="center"
        >
          <Block blockSize="32px" />
          <s-grid
            gridTemplateColumns={TOOLBAR_CONTROL_COLUMNS}
            gap="small-200"
            alignItems="center"
            justifyContent="end"
          >
            <Block inlineSize="32px" blockSize="32px" />
            <Block inlineSize="32px" blockSize="32px" />
            <Block inlineSize="150px" blockSize="32px" />
            <Block inlineSize="120px" blockSize="32px" />
          </s-grid>
        </s-grid>
      </s-query-container>
    </s-box>
  );
}

function TableRow({ widths }: { widths: readonly Size[] }) {
  return (
    <s-box padding="small" borderWidth="none none base none">
      <s-grid
        gridTemplateColumns={TABLE_COLUMNS}
        gap="base"
        alignItems="center"
      >
        <Block inlineSize="16px" blockSize="16px" />
        <Block inlineSize="32px" blockSize="32px" />
        {widths.map((width, column) => (
          <Block key={column} inlineSize={width} />
        ))}
      </s-grid>
    </s-box>
  );
}

function TableBlocks() {
  return (
    <s-box>
      <s-box background="subdued">
        <TableRow widths={["40%", "50%", "30%", "60%", "40%", "40%"]} />
      </s-box>
      {ROWS.map((row) => (
        <TableRow key={row} widths={CELL_WIDTHS[row % CELL_WIDTHS.length]} />
      ))}
    </s-box>
  );
}

function GridBlocks() {
  return (
    <s-box padding="base">
      <s-query-container>
        <s-grid gap="base" gridTemplateColumns={GRID_COLUMNS}>
          {CARDS.map((card) => (
            <s-box
              key={card}
              border="base"
              borderRadius="base"
              overflow="hidden"
            >
              <s-box background="subdued" blockSize="140px" />
              <s-box padding="small">
                <s-stack gap="small-300">
                  <Block inlineSize="70%" blockSize="16px" />
                  <Block inlineSize="85%" />
                  <Block inlineSize="60%" />
                </s-stack>
              </s-box>
            </s-box>
          ))}
        </s-grid>
      </s-query-container>
    </s-box>
  );
}

const FOOTER_BUTTONS = [0, 1, 2, 3, 4];

function FooterBlocks() {
  return (
    <s-box padding="small">
      <s-grid
        gridTemplateColumns="1fr auto 1fr"
        gap="small"
        alignItems="center"
      >
        <Block inlineSize="120px" />
        <s-stack direction="inline" gap="small-200">
          {FOOTER_BUTTONS.map((button) => (
            <Block key={button} inlineSize="32px" blockSize="32px" />
          ))}
        </s-stack>
        <s-box />
      </s-grid>
    </s-box>
  );
}

export function IndexSkeleton({ view }: { view: "table" | "grid" }) {
  return (
    <s-page heading="Certificates" inlineSize="large">
      <s-section padding="none" accessibilityLabel="Certificates">
        <Busy label="Loading certificates">
          <ToolbarBlocks />
          <s-divider />
          {view === "grid" ? <GridBlocks /> : <TableBlocks />}
          <s-divider />
          <FooterBlocks />
        </Busy>
      </s-section>
    </s-page>
  );
}

function SectionBlocks({ fields }: { fields: number }) {
  return (
    <s-stack gap="base">
      <Block inlineSize="30%" blockSize="16px" />
      {ROWS.slice(0, fields).map((field) => (
        <Block key={field} blockSize="32px" />
      ))}
    </s-stack>
  );
}

function ProofBlocks() {
  return (
    <s-stack gap="base">
      <Block inlineSize="30%" blockSize="16px" />
      <s-query-container>
        <s-grid
          gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr, 1fr"
          gap="large"
        >
          <Block blockSize="160px" />
          <Block blockSize="160px" />
        </s-grid>
      </s-query-container>
    </s-stack>
  );
}

// Only blocks, no text: the form's layout without its copy.
export function CertificateSkeleton() {
  return (
    <s-page inlineSize="base">
      <s-box slot="supplemental-start" paddingBlockEnd="base">
        <div className={styles.pulse} aria-hidden="true">
          <Block inlineSize="120px" blockSize="28px" />
        </div>
      </s-box>
      <Busy label="Loading certificate">
        <s-stack gap="base">
          {FORM_SECTIONS.slice(0, 3).map((section) => (
            <s-section key={section.name}>
              <SectionBlocks fields={section.fields} />
            </s-section>
          ))}
          <s-section>
            <ProofBlocks />
          </s-section>
          <s-section>
            <SectionBlocks fields={FORM_SECTIONS[3].fields} />
          </s-section>
        </s-stack>
      </Busy>
      <s-box slot="aside">
        <div className={styles.pulse} aria-hidden="true">
          <s-section>
            <s-stack gap="base">
              <Block inlineSize="40%" blockSize="16px" />
              <Block blockSize="180px" />
              <Block inlineSize="70%" />
              <Block inlineSize="50%" />
            </s-stack>
          </s-section>
        </div>
      </s-box>
    </s-page>
  );
}

// The same skeletons as the streamed pages' fallbacks, so nothing jumps when the route commits.
export function PageSkeleton({ kind }: { kind: PageSkeletonKind }) {
  return kind.page === "index" ? (
    <IndexSkeleton view={kind.view} />
  ) : (
    <CertificateSkeleton />
  );
}
