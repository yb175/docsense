import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type Props = { url: string; filename: string; onError: (message: string) => void; isFullscreen?: boolean; onToggleFullscreen?: () => void };

export function PdfViewer({ url, filename, onError, isFullscreen = false, onToggleFullscreen }: Props) {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPdf(null); setPage(1); setFitScale(0); canvasRefs.current = {}; pageRefs.current = {};
    void pdfjsLib.getDocument({ url }).promise.then((loaded) => {
      if (!cancelled) setPdf(loaded);
    }).catch((cause) => onError(cause instanceof Error ? cause.message : 'Unable to open PDF'));
    return () => { cancelled = true; };
  }, [url, onError]);

  useEffect(() => {
    if (!pdf || !canvasWrapRef.current) return;
    let cancelled = false;
    const updateFit = async () => {
      const firstPage = await pdf.getPage(1);
      if (cancelled || !canvasWrapRef.current) return;
      const natural = firstPage.getViewport({ scale: 1 });
      const { width, height } = canvasWrapRef.current.getBoundingClientRect();
      const availableWidth = width - 48;
      const availableHeight = height - 48;
      setFitScale(Math.max(.1, Math.min(1, availableWidth / natural.width, availableHeight / natural.height)));
    };
    void updateFit().catch(() => undefined);
    const observer = new ResizeObserver(() => void updateFit());
    observer.observe(canvasWrapRef.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [pdf]);

  useEffect(() => {
    if (!pdf || !fitScale) return;
    let cancelled = false;
    const renderPages = async () => {
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const pdfPage = await pdf.getPage(number);
        const canvas = canvasRefs.current[number];
        if (cancelled || !canvas) return;
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
        const context = canvas.getContext('2d');
        if (!context) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvasContext: context, canvas, viewport }).promise;
      }
    };
    void renderPages().catch((cause) => onError(cause instanceof Error ? cause.message : 'Unable to render PDF page'));
    return () => { cancelled = true; };
  }, [pdf, fitScale, zoom, onError]);

  useEffect(() => {
    if (!pdf || !canvasWrapRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const visiblePage = visible?.target.getAttribute('data-page');
      if (visiblePage) setPage(Number(visiblePage));
    }, { root: canvasWrapRef.current, threshold: [0.5] });
    Object.values(pageRefs.current).forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, [pdf, fitScale]);

  const pageCount = pdf?.numPages ?? 0;
  const goToPage = (nextPage: number) => {
    const target = Math.min(pageCount || 1, Math.max(1, nextPage));
    setPage(target);
    pageRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <div className="pdf-viewer" aria-label={`${filename} PDF viewer`}>
    <div className="pdf-canvas-wrap" ref={canvasWrapRef}>
      {pdf && fitScale ? Array.from({ length: pageCount }, (_, index) => {
        const number = index + 1;
        return <div className="pdf-page" data-page={number} ref={(element) => { pageRefs.current[number] = element; }} key={number}><canvas ref={(element) => { canvasRefs.current[number] = element; }} /></div>;
      }) : <div className="pdf-loading">Loading secure document stream…</div>}
    </div>
    <div className="pdf-pagination" aria-label="PDF pagination">
      <button aria-label="Previous page" disabled={!pdf || page <= 1} onClick={() => goToPage(page - 1)}><span className="material-symbols-outlined">chevron_left</span></button>
      <label>Page <input aria-label="Page number" type="number" min="1" max={pageCount || 1} value={page} onChange={(event) => goToPage(Number(event.target.value) || 1)} /> of {pageCount || '—'}</label>
      <button aria-label="Next page" disabled={!pdf || page >= pageCount} onClick={() => goToPage(page + 1)}><span className="material-symbols-outlined">chevron_right</span></button>
      <span className="pagination-divider" />
      <button aria-label="Zoom out" disabled={zoom <= .75} onClick={() => setZoom((value) => Math.max(.75, value - .15))}><span className="material-symbols-outlined">remove</span></button>
      <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      <button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + .15))}><span className="material-symbols-outlined">add</span></button>
      <button aria-label="Fit page" onClick={() => setZoom(1)}><span className="material-symbols-outlined">fit_screen</span></button>
      <button aria-label={isFullscreen ? 'Exit full screen' : 'Open full screen'} onClick={onToggleFullscreen}><span className="material-symbols-outlined">{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span></button>
    </div>
  </div>;
}
