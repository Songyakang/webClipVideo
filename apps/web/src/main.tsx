import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme } from 'antd';

import App from './App';
import 'antd/dist/reset.css';
import './app.css';

const zoomShortcutKeys = new Set(['+', '=', '-', '_', '0']);

const preventBrowserZoom = () => {
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && zoomShortcutKeys.has(event.key)) {
      event.preventDefault();
    }
  };

  const handleGesture = (event: Event) => {
    event.preventDefault();
  };

  window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  window.addEventListener('gesturestart', handleGesture, { passive: false });
  window.addEventListener('gesturechange', handleGesture, { passive: false });
  window.addEventListener('gestureend', handleGesture, { passive: false });
};

preventBrowserZoom();

const projectAntdTheme = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: '#7188ff',
    colorInfo: '#7188ff',
    colorSuccess: '#71f0bc',
    colorWarning: '#ffde78',
    colorError: '#ff8e8e',
    colorText: '#eef3fb',
    colorTextSecondary: '#93a4c2',
    colorTextTertiary: '#7f93b7',
    colorTextPlaceholder: '#7f93b7',
    colorBgBase: '#0a0d14',
    colorBgContainer: '#0e121b',
    colorBgElevated: '#0d121c',
    colorBorder: 'rgba(148, 171, 214, 0.12)',
    colorBorderSecondary: 'rgba(148, 171, 214, 0.08)',
    colorFillSecondary: 'rgba(255, 255, 255, 0.06)',
    colorFillTertiary: 'rgba(255, 255, 255, 0.04)',
    colorFillQuaternary: 'rgba(255, 255, 255, 0.03)',
    controlOutline: 'rgba(113, 136, 255, 0.24)',
    controlItemBgActive: 'rgba(76, 130, 255, 0.16)',
    controlItemBgActiveHover: 'rgba(76, 130, 255, 0.22)',
    controlItemBgHover: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    wireframe: false,
  },
  components: {
    Modal: {
      contentBg: '#0e121b',
      headerBg: '#0e121b',
      footerBg: '#0e121b',
      titleColor: '#eef3fb',
      titleFontSize: 16,
    },
    Select: {
      selectorBg: 'rgba(6, 9, 15, 0.88)',
      optionActiveBg: 'rgba(255, 255, 255, 0.06)',
      optionSelectedBg: 'rgba(76, 130, 255, 0.16)',
      optionSelectedColor: '#eef3fb',
      activeBorderColor: 'rgba(148, 171, 214, 0.24)',
      hoverBorderColor: 'rgba(148, 171, 214, 0.24)',
      colorBgElevated: '#0e121b',
    },
  },
} as const;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={projectAntdTheme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
