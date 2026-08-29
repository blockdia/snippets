import { ArrowUpIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

const VISIBILITY_THRESHOLD = 480;

export function BackToTopButton({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setVisible(window.scrollY > VISIBILITY_THRESHOLD);
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!visible) return null;

  return (
    <button
      aria-label={label}
      className="back-to-top-button"
      onClick={() => {
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({
          top: 0,
          behavior: reducedMotion ? "auto" : "smooth",
        });
      }}
      title={label}
      type="button"
    >
      <ArrowUpIcon aria-hidden="true" size={20} weight="bold" />
    </button>
  );
}
