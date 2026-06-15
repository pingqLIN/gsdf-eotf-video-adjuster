/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React, { useState, useEffect, useRef } from 'react';
import { DraggablePanel } from './components/DraggablePanel';
import { VideoBackground } from './components/VideoBackground';
import { getInitialLocale, LANGUAGE_STORAGE_KEY, messagesByLocale, type SupportedLocale } from './i18n';
import { DEFAULT_APP_SETTINGS, getRecommendedImageDefaults, normalizeAppSettings, type AppSettings } from './types';

function normalizeSavedSettings(value: Partial<AppSettings>): AppSettings {
  const normalized = normalizeAppSettings(value);
  const legacyValue = value as Partial<AppSettings> & { colorModel?: string };
  const hasLegacyProcessedDefaults =
    value.blackPoint === 2 &&
    value.whitePoint === 98 &&
    value.sharpness === 20 &&
    value.temperature === 0;
  const hasPreviousImageDefaults =
    value.blackPoint === 5 &&
    value.whitePoint === 92 &&
    value.saturation === 100 &&
    (legacyValue.colorModel === undefined || legacyValue.colorModel === 'ycbcr');

  if (hasLegacyProcessedDefaults) {
    return {
      ...normalized,
      ...getRecommendedImageDefaults(normalized.lmax),
      sharpness: DEFAULT_APP_SETTINGS.sharpness,
    };
  }

  if (hasPreviousImageDefaults) {
    return {
      ...normalized,
      ...getRecommendedImageDefaults(normalized.lmax),
    };
  }

  return normalized;
}

export default function App() {
  const isExtension = window.location.search.includes('mode=extension');
  const [locale, setLocale] = useState<SupportedLocale>(() => getInitialLocale());
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('gsdf_extension_settings');
    if (saved) {
      try {
        return normalizeSavedSettings(JSON.parse(saved) as Partial<AppSettings>);
      } catch (e) {
        console.error('Failed to parse settings');
      }
    }
    return DEFAULT_APP_SETTINGS;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const lastSavedSettingsRef = useRef(JSON.stringify(settings));
  const toastTimerRef = useRef<number | null>(null);
  const messages = messagesByLocale[locale];

  // Sync settings to the parent window (Chrome content script)
  useEffect(() => {
    if (isExtension && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'GSDF_SETTINGS_CHANGED',
        payload: settings
      }, '*');
    }
  }, [settings, isExtension]);

  useEffect(() => {
    const serializedSettings = JSON.stringify(settings);
    if (serializedSettings === lastSavedSettingsRef.current) {
      return;
    }

    const autosaveTimer = window.setTimeout(() => {
      localStorage.setItem('gsdf_extension_settings', serializedSettings);
      lastSavedSettingsRef.current = serializedSettings;
      setToastMessage(messages.toast.preferencesSaved);

      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage(null);
        toastTimerRef.current = null;
      }, 1400);
    }, 1000);

    return () => {
      window.clearTimeout(autosaveTimer);
    };
  }, [messages.toast.preferencesSaved, settings]);

  const handleLocaleChange = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handlePanelDrag = (deltaX: number, deltaY: number) => {
    if (!isExtension || !window.parent || window.parent === window) {
      return;
    }

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    window.parent.postMessage({
      type: 'GSDF_PANEL_DRAGGED',
      payload: { deltaX, deltaY }
    }, '*');
  };

  const handlePanelResize = (deltaWidth: number, deltaHeight: number) => {
    if (!isExtension || !window.parent || window.parent === window) {
      return;
    }

    if (deltaWidth === 0 && deltaHeight === 0) {
      return;
    }

    window.parent.postMessage({
      type: 'GSDF_PANEL_RESIZED',
      payload: { deltaWidth, deltaHeight }
    }, '*');
  };

  const handlePanelClose = () => {
    if (!isExtension || !window.parent || window.parent === window) {
      return;
    }

    window.parent.postMessage({
      type: 'GSDF_CLOSE_PANEL'
    }, '*');
  };

  return (
    <div className={`relative w-full h-screen overflow-hidden font-sans ${isExtension ? 'bg-transparent pointer-events-none' : 'bg-[#050505]'}`}>
      {!isExtension && <VideoBackground settings={settings} />}
      
      <div className="pointer-events-auto">
        <DraggablePanel 
          settings={settings} 
          setSettings={setSettings} 
          locale={locale}
          messages={messages}
          onLocaleChange={handleLocaleChange}
          extensionMode={isExtension}
          onExtensionDrag={handlePanelDrag}
          onExtensionResize={handlePanelResize}
          onExtensionClose={handlePanelClose}
        />
      </div>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#121417] border border-white/10 text-sky-400 px-5 py-3 rounded-full shadow-2xl flex items-center gap-3 text-xs font-mono tracking-wide z-50 animate-fade-in-up pointer-events-auto">
          <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
