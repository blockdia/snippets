import { useState } from "react";

function isLoopbackUrl(url: string) {
  const hostname = new URL(url).hostname;

  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

export function SnippetDemo({
  demoUrl,
  downloadName,
  fileDescription,
  labels,
}: {
  demoUrl: string;
  downloadName: string;
  fileDescription: string;
  labels: {
    load: string;
    open: string;
    download: string;
    frameTitle: string;
  };
}) {
  const [loaded, setLoaded] = useState(false);
  const encodedDemoUrl = encodeURIComponent(demoUrl);
  const embedUrl = `https://turbowarp.org/embed?project_url=${encodedDemoUrl}&settings-button&addons=pause,clones`;
  const editorUrl = `https://turbowarp.org/editor?project_url=${encodedDemoUrl}`;
  // TurboWarp only needs local-network permission while fetching a loopback development artifact.
  const iframePermissions = isLoopbackUrl(demoUrl)
    ? "fullscreen; local-network-access; local-network; loopback-network"
    : "fullscreen";

  return (
    <div className="demo-shell">
      {loaded ? (
        <iframe
          allow={iframePermissions}
          allowFullScreen
          className="demo-frame"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={embedUrl}
          title={labels.frameTitle}
        />
      ) : (
        <button
          className="demo-placeholder"
          onClick={() => setLoaded(true)}
          type="button"
        >
          <span aria-hidden="true" className="demo-placeholder-icon">
            ▶
          </span>
          <span className="demo-load-label">{labels.load}</span>
        </button>
      )}
      <div className="demo-toolbar">
        <span>{fileDescription}</span>
        <div>
          <a href={editorUrl} rel="noreferrer" target="_blank">
            {labels.open}
            <span aria-hidden="true">↗</span>
          </a>
          <a download={downloadName} href={demoUrl}>
            {labels.download}
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </div>
  );
}
