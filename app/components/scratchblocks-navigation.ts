import type { DocumentView } from "scratchblocks-plus";

export const GO_TO_SCRATCHBLOCK_EVENT = "scratchblocks:go-to-block";

export interface GoToScratchblockDetail {
  blockPath: string;
  scriptKey: string;
}

export function highlightScratchblock(
  view: DocumentView,
  blockPath: string,
): void {
  const target = view.getElementByPath(blockPath);
  if (!target) return;

  const details = target.closest("details");
  if (details) details.open = true;
  target.scrollIntoView({ behavior: "smooth", block: "center" });

  if (typeof IntersectionObserver === "undefined") {
    view.highlightBlock(blockPath, { blink: true });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        view.highlightBlock(blockPath, { blink: true });
        observer.disconnect();
      }
    },
    { threshold: 0.5 },
  );
  observer.observe(target);
}
