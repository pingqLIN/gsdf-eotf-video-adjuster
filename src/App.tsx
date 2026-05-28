/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DraggablePanel } from './components/DraggablePanel';
import { VideoBackground } from './components/VideoBackground';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, type AppSettings } from './types';

export default function App() {
  const isExtension = window.location.search.includes('mode=extension');
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('gsdf_extension_settings');
    if (saved) {
      try {
        return normalizeAppSettings(JSON.parse(saved) as Partial<AppSettings>);
      } catch (e) {
        console.error('Failed to parse settings');
      }
    }
    return DEFAULT_APP_SETTINGS;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync settings to the parent window (Chrome content script)
  useEffect(() => {
    if (isExtension && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'GSDF_SETTINGS_CHANGED',
        payload: settings
      }, '*');
    }
  }, [settings, isExtension]);

  const handlePanelDrag = (deltaX: number, deltaY: number) => {
    if (!isExtension || !window.parent || window.parent === window) {
      return;
    }

    window.parent.postMessage({
      type: 'GSDF_PANEL_DRAGGED',
      payload: { deltaX, deltaY }
    }, '*');
  };

  const handleSaveDefault = () => {
    localStorage.setItem('gsdf_extension_settings', JSON.stringify(settings));
    setToastMessage('偏好設定已儲存');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className={`relative w-full h-screen overflow-hidden font-sans ${isExtension ? 'bg-transparent pointer-events-none' : 'bg-[#050505]'}`}>
      {!isExtension && <VideoBackground settings={settings} />}
      
      <div className="pointer-events-auto">
        <DraggablePanel 
          settings={settings} 
          setSettings={setSettings} 
          onSaveDefault={handleSaveDefault}
          extensionMode={isExtension}
          onExtensionDrag={handlePanelDrag}
        />
      </div>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#121417] border border-white/10 text-sky-400 px-5 py-3 rounded-full shadow-2xl flex items-center gap-3 text-xs font-mono tracking-wide z-50 animate-fade-in-up pointer-events-auto">
          <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          {toastMessage.toUpperCase()}
        </div>
      )}
    </div>
  );
}
