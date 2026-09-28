import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CodeCheck } from "~/features/codes/hooks/use-code-check.hook";
import { codeConflictMessage } from "~/features/certificates/schemas/certificate.schema";
import {
  CODE_MAX,
  codeError,
  normalizeCode,
} from "~/features/codes/utils/code.utils";
import type { SectionProps } from "~/features/certificates/types/certificate-form.types";
import {
  codeDetails,
  suggestedCode,
} from "~/features/certificates/utils/certificate-form-selectors.utils";
import { fieldError } from "~/features/certificates/utils/field-labels.utils";
import { InAppLink } from "~/shared/components/in-app-link.component";

type CodeFieldProps = SectionProps & {
  codeCheck: CodeCheck;
  onNavigate(href: string): void;
};

type CodeFieldElement = HTMLElementTagNameMap["s-text-field"];

const noSubscription = () => () => {};

function hasClipboard(): boolean {
  return typeof navigator.clipboard?.writeText === "function";
}

// An empty code is a "required" error, which waits for a save attempt.
function formatErrorOnBlur(code: string): string | null {
  return code === "" ? null : codeError(code);
}

// polaris.js fields keep their input in an open shadow root and have no select() of their own.
function selectFieldText(field: CodeFieldElement | null) {
  field?.focus();
  field?.shadowRoot?.querySelector("input")?.select();
}

const COPIED_MS = 2000;

function useCopyCode(savedCode: string | null) {
  const available = useSyncExternalStore(
    noSubscription,
    hasClipboard,
    () => false,
  );
  const fieldRef = useRef<CodeFieldElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);

    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(savedCode ?? "");
      shopify.toast.show("Code copied");
      setCopied(true);
    } catch {
      shopify.toast.show("Couldn't copy the code", { isError: true });
      selectFieldText(fieldRef.current);
    }
  };

  return {
    available: available && savedCode !== null,
    copied,
    copy,
    fieldRef,
  };
}

function SuggestedLine({ code, onUse }: { code: string; onUse(): void }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-text color="subdued">Suggested: {code}</s-text>
      <s-button variant="tertiary" onClick={onUse}>
        Use suggested code
      </s-button>
    </s-stack>
  );
}

function CodeChangeWarning({
  savedCode,
  onRestore,
}: {
  savedCode: string;
  onRestore(): void;
}) {
  return (
    <s-banner tone="warning">
      <s-paragraph>
        Customers who have the old code, {savedCode}, won&apos;t be able to
        verify it after you save.
      </s-paragraph>
      <s-button slot="secondary-actions" onClick={onRestore}>
        Use old code
      </s-button>
    </s-banner>
  );
}

export function CodeField({
  state,
  dispatch,
  codeCheck,
  onNavigate,
}: CodeFieldProps) {
  const [formatShown, setFormatShown] = useState(false);
  const { draft, savedCode } = state;
  const editing = state.kind === "edit";
  const copier = useCopyCode(editing ? savedCode : null);
  const conflict =
    state.codeMode === "manual" && codeCheck.status === "taken"
      ? codeCheck.usedBy
      : null;
  const error =
    fieldError(state.errors, "code") ??
    (formatShown ? formatErrorOnBlur(draft.code) : null) ??
    (conflict ? codeConflictMessage(conflict) : null);
  const suggestion = suggestedCode(state);
  const copyLabel = copier.copied ? "Copied" : "Copy code";

  const field = (
    <s-text-field
      id="certificate-code"
      ref={copier.fieldRef}
      label="Certificate code"
      required
      autocomplete="off"
      maxLength={CODE_MAX}
      value={draft.code}
      error={error ?? undefined}
      details={copier.available ? undefined : codeDetails(state)}
      onInput={(event) => {
        const typed = event.currentTarget.value;

        // A format error already shown stays while the code is still invalid; typing never shows a new one.
        setFormatShown(
          (shown) => shown && formatErrorOnBlur(normalizeCode(typed)) !== null,
        );
        dispatch({ type: "setCode", value: typed });
      }}
      onBlur={() => {
        setFormatShown(formatErrorOnBlur(draft.code) !== null);
        dispatch({ type: "codeBlur" });
        codeCheck.checkNow();
      }}
    />
  );

  return (
    <>
      {copier.available ? (
        <>
          <s-grid
            gridTemplateColumns="1fr auto"
            gap="small-200"
            alignItems="end"
          >
            {field}
            <s-button
              variant="tertiary"
              icon={copier.copied ? "check" : "clipboard"}
              accessibilityLabel={copyLabel}
              interestFor="copy-code-tip"
              onClick={() => void copier.copy()}
            />
          </s-grid>
          <s-tooltip id="copy-code-tip">{copyLabel}</s-tooltip>
          <s-text color="subdued">{codeDetails(state)}</s-text>
        </>
      ) : (
        field
      )}
      {suggestion !== null && (
        <SuggestedLine
          code={suggestion}
          onUse={() => {
            setFormatShown(false);
            dispatch({ type: "acceptSuggestedCode" });
          }}
        />
      )}
      {conflict !== null && (
        <InAppLink
          href={`/app/certificates/${conflict.id}`}
          onNavigate={onNavigate}
        >
          View certificate
        </InAppLink>
      )}
      {editing && savedCode !== null && draft.code !== savedCode && (
        <CodeChangeWarning
          savedCode={savedCode}
          onRestore={() => {
            setFormatShown(false);
            dispatch({ type: "restoreOldCode" });
          }}
        />
      )}
    </>
  );
}
