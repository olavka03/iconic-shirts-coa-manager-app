import { useCallback, useEffect, useRef } from "react";
import { useBlocker, useNavigate } from "react-router";

// App Bridge already guards admin navigation and reloads; in-app navigation goes through useBlocker
// (spec §6.4.6).
export function useLeaveConfirmation(isDirty: boolean): {
  allowNext: () => void;
} {
  const allowed = useRef(false);
  const navigate = useNavigate();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !allowed.current &&
      currentLocation.pathname + currentLocation.search !==
        nextLocation.pathname + nextLocation.search,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    const target = blocker.location;
    // leaveConfirmation never settles when the merchant stays, so the blocker is released at once and the
    // navigation replayed only after they confirm.
    blocker.reset();
    void shopify.saveBar.leaveConfirmation().then(() => {
      allowed.current = true;
      navigate(`${target.pathname}${target.search}${target.hash}`);
    });
  }, [blocker, navigate]);

  useEffect(() => {
    if (isDirty) {
      allowed.current = false;
    }
  }, [isDirty]);

  const allowNext = useCallback(() => {
    allowed.current = true;
  }, []);

  return { allowNext };
}
