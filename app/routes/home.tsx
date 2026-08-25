export function meta() {
  return [
    { title: "Scratch Snippets" },
    {
      name: "description",
      content: "An international library of reusable Scratch code patterns.",
    },
  ];
}

export default function Home() {
  return (
    <main className="home-shell">
      <nav className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Scratch Snippets</span>
        </a>
        <span className="phase-label">Foundation preview</span>
      </nav>

      <section className="hero">
        <p className="eyebrow">Reusable ideas, shared across languages</p>
        <h1>Build Scratch projects from clear, reusable patterns.</h1>
        <p className="hero-copy">
          The new SSR platform foundation is ready. Locale-aware content,
          revision history, search, and legacy content import arrive in the next
          implementation phases.
        </p>
        <div className="locale-row" aria-label="Planned launch locales">
          <span>English</span>
          <span>简体中文</span>
          <span>繁體中文</span>
        </div>
      </section>

      <section className="foundation-grid" aria-label="Platform foundation">
        <article>
          <span className="card-number">01</span>
          <h2>Server rendered</h2>
          <p>React Router renders public pages in one Cloudflare Worker.</p>
        </article>
        <article>
          <span className="card-number">02</span>
          <h2>Content first</h2>
          <p>D1 will hold stable snippets, revisions, and translations.</p>
        </article>
        <article>
          <span className="card-number">03</span>
          <h2>Searchable</h2>
          <p>FTS5 will provide locale-aware search with English fallback.</p>
        </article>
      </section>
    </main>
  );
}
