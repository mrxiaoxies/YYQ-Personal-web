import { useCallback, useEffect, useState } from "react";

import type { SiteContentDocument } from "../../shared/site-content-schema.ts";
import {
  createDefaultSiteContentDocument,
  fetchSiteContent,
  type SiteContentSource
} from "../lib/site-content-client";

export function useSiteContent() {
  const [document, setDocumentState] = useState(createDefaultSiteContentDocument);
  const [source, setSource] = useState<SiteContentSource>("fallback");

  useEffect(() => {
    let active = true;

    void fetchSiteContent(window.fetch.bind(window), window.location).then((result) => {
      if (!active) return;
      setDocumentState(result.document);
      setSource(result.source);
    });

    return () => {
      active = false;
    };
  }, []);

  const setDocument = useCallback((nextDocument: SiteContentDocument) => {
    setDocumentState(nextDocument);
    setSource("remote");
  }, []);

  return { document, setDocument, source };
}
