import { useEffect, useState } from "react";

export interface SnippetTocItem {
  id: string;
  label: string;
  children?: SnippetTocItem[];
}

export function SnippetToc({
  items,
  label,
  toggleLabel,
}: {
  items: SnippetTocItem[];
  label: string;
  toggleLabel: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ids = items.flatMap((item) => [
      item.id,
      ...(item.children?.map((child) => child.id) ?? []),
    ]);
    let frame = 0;

    const update = () => {
      frame = 0;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= 128) {
          current = id;
        }
      }
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        current = ids.at(-1) ?? current;
      }
      setActiveId(current);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [items]);

  const renderLink = (item: SnippetTocItem, nested = false) => (
    <li className={nested ? "toc-child" : undefined} key={item.id}>
      <a
        aria-current={activeId === item.id ? "location" : undefined}
        href={`#${item.id}`}
        onClick={() => setOpen(false)}
      >
        {item.label}
      </a>
    </li>
  );

  return (
    <nav aria-label={label} className="detail-toc">
      <button
        aria-expanded={open}
        className="detail-toc-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{toggleLabel}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <ul className={`detail-toc-links${open ? " is-open" : ""}`}>
        {items.flatMap((item) => [
          renderLink(item),
          ...(item.children?.map((child) => renderLink(child, true)) ?? []),
        ])}
      </ul>
    </nav>
  );
}
