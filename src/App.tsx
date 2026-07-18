/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React, { useState, useEffect, useRef } from 'react';
import { CameraExposureTestPage } from './components/CameraExposureTestPage';
import { DraggablePanel } from './components/DraggablePanel';
import { IccProfilePage } from './components/IccProfilePage';
import { ToneLossTestPage } from './components/ToneLossTestPage';
import { VideoBackground } from './components/VideoBackground';
import { getInitialLocale, LANGUAGE_STORAGE_KEY, messagesByLocale, type SupportedLocale } from './i18n';
import { DEFAULT_APP_SETTINGS, getRecommendedImageDefaults, normalizeAppSettings, type AppSettings } from './types';

type ChromeTabsApi = {
  query: (
    queryInfo: { active: boolean; currentWindow: boolean },
    callback: (tabs: Array<{ id?: number }>) => void,
  ) => void;
  sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  onActivated?: {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
  };
  onUpdated?: {
    addListener: (listener: (tabId: number, changeInfo: { status?: string }) => void) => void;
    removeListener: (listener: (tabId: number, changeInfo: { status?: string }) => void) => void;
  };
};

function normalizeSavedSettings(value: Partial<AppSettings>): AppSettings {
  const normalized = normalizeAppSettings(value);
  const legacyValue = value as Partial<AppSettings> & { colorModel?: string; sharpness?: number };
  const hasLegacyProcessedDefaults =
    value.blackPoint === 2 &&
    value.whitePoint === 98 &&
    legacyValue.sharpness === 20 &&
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
      fineSharpness: DEFAULT_APP_SETTINGS.fineSharpness,
      mediumSharpness: DEFAULT_APP_SETTINGS.mediumSharpness,
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
  const searchParams = new URLSearchParams(window.location.search);
  const isInjectedExtension = searchParams.get('mode') === 'extension';
  const isSidePanel = searchParams.get('mode') === 'sidepanel';
  const inspectionModeParam = searchParams.get('inspection');
  const initialInspectionMode = inspectionModeParam === 'pattern' ||
    inspectionModeParam === 'linearity' ||
    inspectionModeParam === 'bidirectional' ||
    inspectionModeParam === 'chart'
    ? inspectionModeParam
    : undefined;
  const isInspectionWindow = searchParams.get('mode') === 'inspection' && initialInspectionMode !== undefined;
  const isExtension = isInjectedExtension || isSidePanel;
  const isFullPanelSurface = isExtension || isInspectionWindow;
  const isCameraExposureTest = window.location.pathname === '/camera-exposure-test' ||
    window.location.search.includes('mode=camera-exposure-test');
  const isToneLossTest = window.location.pathname === '/tone-loss-test' ||
    window.location.search.includes('mode=tone-loss-test');
  const isIccProfilePage = window.location.pathname === '/icc-profile' ||
    window.location.search.includes('mode=icc-profile');
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

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'gsdf_extension_settings' || !event.newValue) {
        return;
      }

      try {
        const nextSettings = normalizeSavedSettings(JSON.parse(event.newValue) as Partial<AppSettings>);
        lastSavedSettingsRef.current = JSON.stringify(nextSettings);
        setSettings(nextSettings);
      } catch {
        console.error('Failed to synchronize settings from another window');
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Sync settings to either the injected iframe host or the active tab managed by the Chrome side panel.
  useEffect(() => {
    if (isInjectedExtension && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'GSDF_SETTINGS_CHANGED',
        payload: settings
      }, '*');
      return;
    }

    const chromeApi = (globalThis as typeof globalThis & { chrome?: { tabs?: ChromeTabsApi } }).chrome;
    if (isSidePanel && chromeApi?.tabs?.query) {
      const syncActiveTab = () => chromeApi.tabs?.query({ active: true, currentWindow: true }, ([activeTab]) => {
        if (activeTab?.id) {
          chromeApi.tabs?.sendMessage(activeTab.id, {
            action: 'apply_settings',
            payload: settings,
          }).catch(() => {});
        }
      });

      const handleTabActivated = () => syncActiveTab();
      const handleTabUpdated = (_tabId: number, changeInfo: { status?: string }) => {
        if (changeInfo.status === 'complete') {
          syncActiveTab();
        }
      };

      syncActiveTab();
      chromeApi.tabs.onActivated?.addListener(handleTabActivated);
      chromeApi.tabs.onUpdated?.addListener(handleTabUpdated);

      return () => {
        chromeApi.tabs?.onActivated?.removeListener(handleTabActivated);
        chromeApi.tabs?.onUpdated?.removeListener(handleTabUpdated);
      };
    }
  }, [settings, isInjectedExtension, isSidePanel]);

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
    if (!isInjectedExtension || !window.parent || window.parent === window) {
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
    if (!isInjectedExtension || !window.parent || window.parent === window) {
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
    if (!isInjectedExtension || !window.parent || window.parent === window) {
      return;
    }

    window.parent.postMessage({
      type: 'GSDF_CLOSE_PANEL'
    }, '*');
  };

  if (isCameraExposureTest) {
    return <CameraExposureTestPage />;
  }

  if (isToneLossTest) {
    return <ToneLossTestPage />;
  }

  if (isIccProfilePage) {
    return <IccProfilePage settings={settings} />;
  }

  return (
    <div className={`relative w-full h-screen overflow-hidden font-sans ${isFullPanelSurface ? 'bg-transparent pointer-events-none' : 'bg-[#050505]'}`}>
      {!isFullPanelSurface && <VideoBackground settings={settings} />}
      
      <div className="pointer-events-auto">
        <DraggablePanel 
          settings={settings} 
          setSettings={setSettings} 
          locale={locale}
          messages={messages}
          onLocaleChange={handleLocaleChange}
          extensionMode={isFullPanelSurface}
          sidebarMode={isSidePanel}
          initialInspectionMode={initialInspectionMode}
          inspectionWindow={isInspectionWindow}
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
