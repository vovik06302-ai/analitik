import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Radio, Upload, X } from 'lucide-react';
import { CaptureRegion, DESKTOP_CAPTURE_DISPLAY_KEY, DESKTOP_CAPTURE_SOURCE_KEY } from '../types';
import { Language, t } from '../i18n/translations';

interface RegionSelectionModalProps {
  lang: Language;
  isOpen: boolean;
  initialImageUrl: string | null;
  onClose: () => void;
  onApply: (
    dataUrl: string,
    region: CaptureRegion,
    liveStream?: { stream: MediaStream; cropNormalized: { x: number; y: number; w: number; h: number } }
  ) => void;
}

interface DesktopCaptureResult {
  ok: boolean;
  dataUrl?: string;
  displayId?: string;
  cancelled?: boolean;
  error?: string;
}

const getDesktopCapture = (): (() => Promise<DesktopCaptureResult>) | null => {
  const api = (
    window as unknown as {
      pearlDesktop?: { captureScreen?: () => Promise<DesktopCaptureResult> };
    }
  ).pearlDesktop;
  return api?.captureScreen ? api.captureScreen : null;
};

const rememberDesktopSource = (displayId: string | null): void => {
  try {
    if (displayId) {
      localStorage.setItem(DESKTOP_CAPTURE_SOURCE_KEY, 'still');
      localStorage.setItem(DESKTOP_CAPTURE_DISPLAY_KEY, displayId);
    } else {
      localStorage.removeItem(DESKTOP_CAPTURE_SOURCE_KEY);
      localStorage.removeItem(DESKTOP_CAPTURE_DISPLAY_KEY);
    }
  } catch {
    // localStorage недоступен
  }
};

interface DragBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const RegionSelectionModal: React.FC<RegionSelectionModalProps> = ({
  lang,
  isOpen,
  initialImageUrl,
  onClose,
  onApply,
}) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(initialImageUrl);
  const [dragBox, setDragBox] = useState<DragBox | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [captureNote, setCaptureNote] = useState('');
  const [stillDisplayId, setStillDisplayId] = useState<string | null>(null);
  const [keepLiveStream, setKeepLiveStream] = useState(true);
  const [capturedStream, setCapturedStream] = useState<MediaStream | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSourceUrl(initialImageUrl);
      setDragBox(null);
      setCaptureError('');
      setCaptureNote('');
      setStillDisplayId(null);
      setCapturedStream(null);
    }
  }, [isOpen, initialImageUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (capturedStream) {
          capturedStream.getTracks().forEach((tr) => tr.stop());
          setCapturedStream(null);
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, capturedStream]);

  if (!isOpen) return null;

  const stopPendingStream = () => {
    if (capturedStream) {
      capturedStream.getTracks().forEach((tr) => tr.stop());
      setCapturedStream(null);
    }
  };

  const loadFile = (file: File) => {
    stopPendingStream();
    setStillDisplayId(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setDragBox(null);
        setCaptureError('');
      }
    };
    reader.readAsDataURL(file);
  };

  // Обычный снимок экрана средствами настольной программы (без живого потока).
  const captureStill = async (note: string): Promise<boolean> => {
    const capture = getDesktopCapture();
    if (!capture) return false;
    const result = await capture();
    if (result.ok && result.dataUrl) {
      setSourceUrl(result.dataUrl);
      setDragBox(null);
      setCaptureError('');
      setCaptureNote(note);
      setStillDisplayId(result.displayId ?? null);
      return true;
    }
    if (!result.cancelled && result.error) {
      setCaptureError(result.error);
    }
    // true, чтобы не пробовать другие способы после отмены или ошибки
    return true;
  };

  const handleScreenCapture = async () => {
    setCaptureError('');
    setCaptureNote('');
    stopPendingStream();

    const stillNote =
      lang === 'en'
        ? 'Screenshot taken. Drag with the left mouse button over the chart area, then press "Apply Region".'
        : 'Снимок экрана готов. Зажмите левую кнопку мыши и обведите область графика, затем нажмите «Применить область».';

    if (!keepLiveStream && getDesktopCapture()) {
      await captureStill(stillNote);
      return;
    }

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        if (await captureStill(stillNote)) return;
        setCaptureError(
          lang === 'en'
            ? 'Screen capture is unavailable in this browser context. Upload or paste an image instead.'
            : 'Захват экрана недоступен в этом контексте браузера. Загрузите файл или вставьте скриншот (Ctrl+V).'
        );
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      setSourceUrl(canvas.toDataURL('image/png'));
      setDragBox(null);
      setStillDisplayId(null);
      setCaptureNote(stillNote);

      if (keepLiveStream) {
        setCapturedStream(stream);
      } else {
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (err) {
      const cancelled = err instanceof DOMException && err.name === 'NotAllowedError';
      if (!cancelled && getDesktopCapture()) {
        const fallbackNote =
          lang === 'en'
            ? 'Live stream is unavailable, so a regular screenshot was taken. Drag over the chart area, then press "Apply Region".'
            : 'Живой поток недоступен, поэтому сделан обычный снимок экрана. Обведите мышью область графика и нажмите «Применить область».';
        if (await captureStill(fallbackNote)) return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setCaptureError(
        lang === 'en'
          ? `Screen capture cancelled or blocked (${msg}). You can upload or paste (Ctrl+V) a screenshot.`
          : `Захват экрана отменён или заблокирован (${msg}). Загрузите файл или вставьте скриншот (Ctrl+V).`
      );
    }
  };

  const normalizedBox = dragBox
    ? {
        left: Math.min(dragBox.startX, dragBox.endX),
        top: Math.min(dragBox.startY, dragBox.endY),
        width: Math.abs(dragBox.endX - dragBox.startX),
        height: Math.abs(dragBox.endY - dragBox.startY),
      }
    : null;

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;
    if (e.button === 2) {
      stopPendingStream();
      onClose();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    setIsDragging(true);
    setDragBox({ startX: x, startY: y, endX: x, endY: y });
  };

  const handleMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !imgRef.current || !dragBox) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    setDragBox({ ...dragBox, endX: x, endY: y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const applySelection = (useFullImage: boolean) => {
    if (!sourceUrl || !imgRef.current) return;
    const img = imgRef.current;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const dispW = img.clientWidth;
    const dispH = img.clientHeight;
    if (!natW || !natH || !dispW || !dispH) return;
    rememberDesktopSource(stillDisplayId);

    if (useFullImage || !normalizedBox || normalizedBox.width < 12 || normalizedBox.height < 12) {
      const liveMeta =
        capturedStream && keepLiveStream
          ? { stream: capturedStream, cropNormalized: { x: 0, y: 0, w: 1, h: 1 } }
          : undefined;
      if (!liveMeta && capturedStream) {
        capturedStream.getTracks().forEach((tr) => tr.stop());
      }
      setCapturedStream(null);
      onApply(sourceUrl, { x: 0, y: 0, width: natW, height: natH }, liveMeta);
      onClose();
      return;
    }

    const scaleX = natW / dispW;
    const scaleY = natH / dispH;
    const cropX = Math.round(normalizedBox.left * scaleX);
    const cropY = Math.round(normalizedBox.top * scaleY);
    const cropW = Math.max(1, Math.round(normalizedBox.width * scaleX));
    const cropH = Math.max(1, Math.round(normalizedBox.height * scaleY));

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const liveMeta =
        capturedStream && keepLiveStream
          ? {
              stream: capturedStream,
              cropNormalized: {
                x: cropX / natW,
                y: cropY / natH,
                w: cropW / natW,
                h: cropH / natH,
              },
            }
          : undefined;
      if (!liveMeta && capturedStream) {
        capturedStream.getTracks().forEach((tr) => tr.stop());
      }
      setCapturedStream(null);
      onApply(
        canvas.toDataURL('image/png'),
        {
          x: cropX,
          y: cropY,
          width: cropW,
          height: cropH,
        },
        liveMeta
      );
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onContextMenu={(e) => {
        e.preventDefault();
        stopPendingStream();
        onClose();
      }}
    >
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#25324D] bg-[#101624] flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold text-[#F1F5F9]">
            {t(lang, 'RegionOverlayHint')}
          </span>
          <button
            type="button"
            aria-label={lang === 'en' ? 'Close modal' : 'Закрыть окно'}
            onClick={() => {
              stopPendingStream();
              onClose();
            }}
            className="text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-4 py-2.5 border-b border-[#25324D] flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleScreenCapture}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-3.5 py-1.5 text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
          >
            <Monitor className="w-4 h-4 text-[#00D4AA]" />
            <span>{lang === 'en' ? 'Capture Screen' : 'Захват экрана'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-3.5 py-1.5 text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#38BDF8]" />
            <span>{lang === 'en' ? 'Upload Image' : 'Загрузить файл'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
            }}
          />

          <label className="flex items-center gap-1.5 text-[12px] text-[#94A3B8] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepLiveStream}
              onChange={(e) => setKeepLiveStream(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#00D4AA] rounded cursor-pointer"
            />
            <Radio className="w-3.5 h-3.5 text-[#00D4AA]" />
            <span>
              {lang === 'en'
                ? 'Keep live stream for auto-capture'
                : 'Держать живой поток для авто-снимков'}
            </span>
          </label>

          <span className="text-[12px] text-[#64748B] ml-auto">
            {lang === 'en' ? 'Tip: press Ctrl+V to paste' : 'Подсказка: Ctrl+V вставляет скриншот'}
          </span>
        </div>

        {captureError && (
          <div className="mx-4 mt-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-[8px] px-3 py-2 text-[#FCA5A5] text-[12.5px]">
            {captureError}
          </div>
        )}

        {captureNote && !captureError && (
          <div className="mx-4 mt-3 bg-[#38BDF8]/10 border border-[#38BDF8]/30 rounded-[8px] px-3 py-2 text-[#BAE6FD] text-[12.5px]">
            {captureNote}
          </div>
        )}

        {sourceUrl && !captureNote && !captureError && !dragBox && (
          <div className="mx-4 mt-3 text-[12.5px] text-[#94A3B8]">
            {lang === 'en'
              ? 'Drag with the left mouse button over the chart area, then press "Apply Region".'
              : 'Зажмите левую кнопку мыши и обведите область графика, затем нажмите «Применить область».'}
          </div>
        )}

        {/* Workspace / Crop Canvas */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) loadFile(file);
          }}
          className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#0A0E17] min-h-[320px]"
        >
          {sourceUrl ? (
            <div
              className="relative inline-block select-none cursor-crosshair touch-none"
              onPointerDown={handleMouseDown}
              onPointerMove={handleMouseMove}
              onPointerUp={handleMouseUp}
              onPointerCancel={handleMouseUp}
            >
              <img
                ref={imgRef}
                src={sourceUrl}
                alt="Chart selection"
                draggable={false}
                className="max-h-[55vh] w-auto block rounded"
              />
              {normalizedBox && normalizedBox.width > 4 && normalizedBox.height > 4 && (
                <div
                  className="absolute border-2 border-[#00D4AA] bg-[#00D4AA]/15 pointer-events-none"
                  style={{
                    left: normalizedBox.left,
                    top: normalizedBox.top,
                    width: normalizedBox.width,
                    height: normalizedBox.height,
                  }}
                >
                  <span className="absolute -top-6 left-0 bg-[#101624] border border-[#25324D] text-[#00D4AA] text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap">
                    {Math.round(normalizedBox.width)} × {Math.round(normalizedBox.height)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center space-y-2 py-12">
              <Upload className="w-8 h-8 text-[#64748B] mx-auto" />
              <div className="text-[14px] text-[#94A3B8]">
                {lang === 'en'
                  ? 'Capture your screen, drop an image, or press Ctrl+V'
                  : 'Захватите экран, перетащите картинку или нажмите Ctrl+V'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#25324D] bg-[#101624] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              stopPendingStream();
              onClose();
            }}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-4 py-2 text-[13px] font-medium cursor-pointer"
          >
            {lang === 'en' ? 'Cancel' : 'Отмена'}
          </button>
          {sourceUrl && (
            <>
              <button
                type="button"
                onClick={() => applySelection(true)}
                className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-4 py-2 text-[13px] font-medium cursor-pointer"
              >
                {lang === 'en' ? 'Use Full Image' : 'Вся область'}
              </button>
              <button
                type="button"
                onClick={() => applySelection(false)}
                className="bg-[#00D4AA] hover:bg-[#22E7BF] text-[#071216] rounded-[10px] px-4 py-2 text-[13px] font-semibold cursor-pointer"
              >
                {lang === 'en' ? 'Apply Region' : 'Применить область'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
